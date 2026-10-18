/** Mode Calendrier : vues Jour, Semaine et Mois. */

import { useRef, useState, type TouchEvent } from 'react';
import { addDays, isSameDay, startOfDay, startOfWeek } from '../core/time';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { Fab, Header, Segmented, useNow } from '../ui/kit';
import { IconChevronLeft, IconChevronRight } from '../ui/icons';
import { formatDayMonth, formatDayShort, formatMonth } from '../ui/format';
import { DayView } from './calendar/DayView';
import { WeekView } from './calendar/WeekView';
import { MonthView } from './calendar/MonthView';
import { proposedDate } from './calendar/shared';
import './calendar.css';

type View = 'day' | 'week' | 'month';

const VIEW_KEY = 'planning.calendarView';
/** Glissement horizontal minimal pour changer de période. */
const SWIPE_PX = 60;

function readView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'day' || v === 'week' || v === 'month') return v;
  } catch {
    /* stockage indisponible */
  }
  return 'day';
}

/** « 19–25 oct. », ou « 28 sept.–4 oct. » à cheval sur deux mois. */
function weekLabel(start: Date): string {
  const end = addDays(start, 6);
  return start.getMonth() === end.getMonth() ? `${start.getDate()}–${formatDayMonth(end)}` : `${formatDayMonth(start)}–${formatDayMonth(end)}`;
}

export function CalendarMode() {
  const { settings } = useStore();
  const { openSheet } = useNav();
  const now = useNow(60_000);
  const [view, setViewState] = useState<View>(readView);
  /** Jour de référence : jour affiché, jour dans la semaine, jour choisi dans le mois. */
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const weekStart = startOfWeek(anchor, settings.weekStartsOn);

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* préférence non retenue */
    }
  };

  const step = (dir: 1 | -1) => {
    if (view === 'day') setAnchor((d) => addDays(d, dir));
    else if (view === 'week') setAnchor((d) => addDays(d, 7 * dir));
    else
      setAnchor((d) => {
        // Mois voisin : aujourd'hui s'il en fait partie, sinon le 1er.
        const target = new Date(d.getFullYear(), d.getMonth() + dir, 1);
        const today = startOfDay(new Date());
        return today.getFullYear() === target.getFullYear() && today.getMonth() === target.getMonth() ? today : target;
      });
  };

  const openDay = (day: Date) => {
    setAnchor(startOfDay(day));
    setView('day');
  };

  const label = view === 'day' ? formatDayShort(anchor) : view === 'week' ? weekLabel(weekStart) : formatMonth(anchor);
  const isCurrent =
    view === 'day'
      ? isSameDay(anchor, now)
      : view === 'week'
        ? isSameDay(weekStart, startOfWeek(now, settings.weekStartsOn))
        : anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth();

  // Glisser à gauche / à droite : période suivante / précédente.
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
            onClick={() => setAnchor(startOfDay(new Date()))}
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
            { value: 'week', label: 'Semaine' },
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

      <div className="cal-swipe" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {view === 'day' && <DayView day={anchor} />}
        {view === 'week' && <WeekView weekStart={weekStart} onPickDay={openDay} />}
        {view === 'month' && <MonthView month={anchor} selected={anchor} onSelect={(d) => setAnchor(startOfDay(d))} onOpenDay={openDay} />}
      </div>

      <Fab onClick={() => openSheet({ kind: 'add', date: proposedDate(anchor, now) })} />
    </>
  );
}
