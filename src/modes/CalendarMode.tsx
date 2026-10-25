/** Mode Calendrier : vues Jour, 3 jours, Semaine et Mois. */

import { useRef, useState, type TouchEvent } from 'react';
import { addDays, isSameDay, startOfDay } from '../core/time';
import { useNav } from '../state/nav';
import { Fab, Header, Segmented, useNow } from '../ui/kit';
import { IconChevronLeft, IconChevronRight } from '../ui/icons';
import { formatDayMonth, formatDayShort, formatMonth } from '../ui/format';
import { TimelineView, type TimelineTarget } from './calendar/TimelineView';
import { MonthView } from './calendar/MonthView';
import { proposedDate } from './calendar/shared';
import './calendar.css';

type View = 'day' | 'three' | 'week' | 'month';

const VIEW_KEY = 'planning.calendarView';
/** Glissement horizontal minimal pour changer de mois. */
const SWIPE_PX = 60;
/** Jours visibles à la fois dans les vues à grille horaire. */
const VISIBLE: Record<Exclude<View, 'month'>, 1 | 3 | 7> = { day: 1, three: 3, week: 7 };

function readView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'day' || v === 'three' || v === 'week' || v === 'month') return v;
  } catch {
    /* stockage indisponible */
  }
  return 'day';
}

/** « 19–25 oct. », ou « 28 sept.–4 oct. » à cheval sur deux mois. */
function rangeLabel(start: Date, days: number): string {
  const end = addDays(start, days - 1);
  return start.getMonth() === end.getMonth() ? `${start.getDate()}–${formatDayMonth(end)}` : `${formatDayMonth(start)}–${formatDayMonth(end)}`;
}

export function CalendarMode() {
  const { openSheet } = useNav();
  const now = useNow(60_000);
  const [view, setViewState] = useState<View>(readView);
  /** Jour de référence : premier jour visible, ou jour choisi dans le mois. */
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  /** Jour vers lequel la grille horaire doit défiler (flèches, aujourd'hui, changement de vue). */
  const [target, setTarget] = useState<TimelineTarget>(() => ({ day: startOfDay(new Date()), key: 0 }));
  const days = view === 'month' ? 0 : VISIBLE[view];

  const goTo = (day: Date) => {
    const d = startOfDay(day);
    setAnchor(d);
    setTarget((t) => ({ day: d, key: t.key + 1 }));
  };

  const setView = (v: View) => {
    setViewState(v);
    goTo(anchor);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* préférence non retenue */
    }
  };

  const step = (dir: 1 | -1) => {
    if (view !== 'month') goTo(addDays(anchor, days * dir));
    else
      setAnchor((d) => {
        // Mois voisin : aujourd'hui s'il en fait partie, sinon le 1er.
        const target = new Date(d.getFullYear(), d.getMonth() + dir, 1);
        const today = startOfDay(new Date());
        return today.getFullYear() === target.getFullYear() && today.getMonth() === target.getMonth() ? today : target;
      });
  };

  const openDay = (day: Date) => {
    setViewState('day');
    goTo(day);
  };

  const label = view === 'day' ? formatDayShort(anchor) : view === 'month' ? formatMonth(anchor) : rangeLabel(anchor, days);
  const isCurrent =
    view === 'month'
      ? anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth()
      : view === 'day'
        ? isSameDay(anchor, now)
        : anchor <= now && now < addDays(anchor, days);

  // Mois : glisser à gauche / à droite pour le mois suivant / précédent.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > 1.5 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
  };

  return (
    <>
      <Header
        right={
          <button
            type="button"
            className="cal-nav__date"
            aria-label={isCurrent ? label : `${label} — revenir à aujourd'hui`}
            onClick={() => goTo(new Date())}
          >
            {label}
          </button>
        }
      />

      <div className="cal-bar">
        <Segmented<View>
          label="Affichage"
          value={view}
          onChange={setView}
          options={[
            { value: 'day', label: 'Jour' },
            { value: 'three', label: '3 j', ariaLabel: '3 jours' },
            { value: 'week', label: 'Sem.', ariaLabel: 'Semaine' },
            { value: 'month', label: 'Mois' },
          ]}
        />
        <div className="cal-nav">
          <button type="button" className="icon-btn" aria-label="Période précédente" onClick={() => step(-1)}>
            <IconChevronLeft />
          </button>
          <button type="button" className="icon-btn" aria-label="Période suivante" onClick={() => step(1)}>
            <IconChevronRight />
          </button>
        </div>
      </div>

      {view === 'month' ? (
        <div className="cal-swipe" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <MonthView month={anchor} selected={anchor} onSelect={(d) => setAnchor(startOfDay(d))} onOpenDay={openDay} />
        </div>
      ) : (
        <TimelineView key={view} days={VISIBLE[view]} target={target} onAnchor={setAnchor} onPickDay={openDay} />
      )}

      <Fab onClick={() => openSheet({ kind: 'add', date: proposedDate(anchor, now) })} />
    </>
  );
}
