/**
 * Vue Calendrier du mode Cycle : chaque case prend la couleur de sa phase (règles notées et
 * prévues, fenêtre fertile, SPM), une pastille pour l'ovulation estimée, un point par jour noté.
 */

import { useMemo, useRef, useState, type TouchEvent } from 'react';
import type { ISODate } from '../../core/types';
import { dayMarks } from '../../core/cycle';
import { addDays, parseISODate, startOfMonth, startOfWeek, toISODate } from '../../core/time';
import { useCycle } from '../../state/cycle';
import { useNav } from '../../state/nav';
import { useStore } from '../../state/store';
import { IconChevronLeft, IconChevronRight } from '../../ui/icons';
import { formatDayLong, formatMonth } from '../../ui/format';
import { DayChips, DayMarks, Legend, OvulationDot, WEEKDAY_LETTER, dayPhase, describeMark, phaseClass } from './shared';

const SWIPE_PX = 60;

export function CycleCalendar() {
  const { settings: appSettings } = useStore();
  const { openSheet } = useNav();
  const { settings, today, forecast: fc, byDate } = useCycle();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<ISODate>(today);

  const weekStartsOn = appSettings.weekStartsOn;
  const { days, marks } = useMemo(() => {
    const gridStart = startOfWeek(month, weekStartsOn);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const offset = (month.getDay() - weekStartsOn + 7) % 7;
    const weeks = Math.ceil((offset + daysInMonth) / 7);
    const list = Array.from({ length: weeks * 7 }, (_, i) => toISODate(addDays(gridStart, i)));
    return { days: list, marks: dayMarks([...byDate.values()], fc, settings, list[0], list[list.length - 1], today) };
  }, [month, weekStartsOn, byDate, fc, settings, today]);

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const isCurrentMonth = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth();
  const order = Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7);

  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > 1.5 * Math.abs(dy)) shift(dx < 0 ? 1 : -1);
  };

  const selDay = byDate.get(selected);
  const selMark = marks.get(selected);
  const future = selected > today;
  const selDate = parseISODate(selected);

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" className="icon-btn" aria-label="Mois précédent" onClick={() => shift(-1)}>
          <IconChevronLeft />
        </button>
        <button
          type="button"
          onClick={() => {
            setMonth(startOfMonth(new Date()));
            setSelected(today);
          }}
          disabled={isCurrentMonth}
          style={{
            minHeight: 44,
            border: 'none',
            background: 'transparent',
            fontSize: 16,
            fontWeight: 700,
            cursor: isCurrentMonth ? 'default' : 'pointer',
          }}
        >
          {formatMonth(month)}
        </button>
        <button type="button" className="icon-btn" aria-label="Mois suivant" onClick={() => shift(1)}>
          <IconChevronRight />
        </button>
      </div>

      <div className="cy-month" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        {order.map((d, i) => (
          <span key={`h${i}`} className="cy-month__dow" aria-hidden="true">
            {WEEKDAY_LETTER[d]}
          </span>
        ))}
        {days.map((date) => {
          // Les jours des mois voisins restent neutres : leurs phases s'affichent dans leur mois.
          const outside = Number(date.slice(5, 7)) - 1 !== month.getMonth();
          const mark = outside ? undefined : marks.get(date);
          const phase = dayPhase(mark);
          const cls = ['cy-month__cell', outside && 'cy-month__cell--outside', phaseClass(phase), date === today && 'cy-month__cell--today'];
          return (
            <button
              key={date}
              type="button"
              className={cls.filter(Boolean).join(' ')}
              aria-pressed={date === selected}
              aria-label={`${date.slice(8)}${date === today ? ", aujourd'hui" : ''} — ${describeMark(marks.get(date), date > today) || 'rien'}`}
              onClick={() => setSelected(date)}
            >
              <span className="cy-num">{Number(date.slice(8))}</span>
              {phase === 'ovulation' && <OvulationDot />}
              <DayMarks mark={mark} />
            </button>
          );
        })}
      </div>
      <Legend settings={settings} variant="calendar" />

      <section className="section cy-card" aria-label={formatDayLong(selDate)}>
        <div className="cy-card__head">
          <div style={{ minWidth: 0 }}>
            <h2 className="cy-card__title">{formatDayLong(selDate)}</h2>
            {describeMark(selMark, future) && <p className="cy-card__sub">{describeMark(selMark, future)}</p>}
          </div>
          {!future && (
            <button
              type="button"
              className="btn btn--primary"
              style={{ height: 40, padding: '0 16px', fontSize: 15, flex: 'none' }}
              onClick={() => openSheet({ kind: 'cycleDay', date: selected })}
            >
              {selDay ? 'Modifier' : 'Noter'}
            </button>
          )}
        </div>
        {future ? <p className="cy-card__sub">Jour à venir.</p> : <DayChips day={selDay} />}
      </section>
    </div>
  );
}
