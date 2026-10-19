/** Vue Mois : grille des jours avec points de couleur (et phases du cycle), agenda du jour choisi dessous. */

import { useMemo } from 'react';
import { addDays, formatHM, isSameDay, startOfMonth, startOfWeek, toISODate } from '../../core/time';
import { useCycle } from '../../state/cycle';
import { useStore } from '../../state/store';
import { useNav } from '../../state/nav';
import { useNow } from '../../ui/kit';
import { IconCalendar } from '../../ui/icons';
import { formatDayLong } from '../../ui/format';
import { toneOf } from '../../ui/palette';
import { itemsByDay, type MonthItem } from './shared';
import { Legend, OvulationDot, dayPhase, describeMark, phaseClass, useCalendarMarks } from '../cycle/shared';
import { WEEKDAY_INITIAL } from './WeekView';
import '../cycle.css';

/** Points affichés au plus par cellule (au-delà : « +n »). */
const MAX_DOTS = 4;
const EVENT_DOT = '#B98AA0';

/** Avec « +n », on garde la place d'un point pour le compteur. */
const shownDots = (n: number) => (n > MAX_DOTS ? MAX_DOTS - 1 : n);

const countLabel = (n: number) => (n === 0 ? 'rien de prévu' : n === 1 ? '1 élément' : `${n} éléments`);

export function MonthView({
  month,
  selected,
  onSelect,
  onOpenDay,
}: {
  month: Date;
  selected: Date;
  onSelect: (day: Date) => void;
  onOpenDay: (day: Date) => void;
}) {
  const { plan, tasks, events, projects, settings } = useStore();
  const { openSheet } = useNav();
  const now = useNow(60_000);

  const monthStart = startOfMonth(month);
  const monthKey = monthStart.getTime();
  const { days, byDay } = useMemo(() => {
    const first = new Date(monthKey);
    const gridStart = startOfWeek(first, settings.weekStartsOn);
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const offset = (first.getDay() - settings.weekStartsOn + 7) % 7;
    const weeks = Math.ceil((offset + daysInMonth) / 7);
    const list = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
    return { days: list, byDay: itemsByDay(plan, tasks, events, gridStart, addDays(gridStart, weeks * 7)) };
  }, [monthKey, settings.weekStartsOn, plan, tasks, events]);

  // Phases du cycle (réglage « Phases du cycle dans le Calendrier »), même code couleur que le mode Cycle.
  const cycle = useCycle();
  const cycleMarks = useCalendarMarks(toISODate(days[0]), toISODate(days[days.length - 1]));

  const colorOf = (projectId?: string) => toneOf(projects.find((p) => p.id === projectId)?.color).dot;
  const dotColor = (item: MonthItem) => (item.kind === 'task' ? colorOf(item.projectId) : EVENT_DOT);
  const weekdayOrder = Array.from({ length: 7 }, (_, i) => (settings.weekStartsOn + i) % 7);
  const agenda = byDay.get(toISODate(selected)) ?? [];

  return (
    <div className="month">
      <div className="month__dows" aria-hidden="true">
        {weekdayOrder.map((d, i) => (
          <span key={i}>{WEEKDAY_INITIAL[d]}</span>
        ))}
      </div>

      <div className="month__grid">
        {days.map((day) => {
          const key = toISODate(day);
          const items = byDay.get(key) ?? [];
          const outside = day.getMonth() !== monthStart.getMonth();
          const today = isSameDay(day, now);
          const isSelected = isSameDay(day, selected);
          // Les jours des mois voisins restent neutres, comme dans le calendrier du Cycle.
          const mark = outside ? undefined : cycleMarks?.get(key);
          const phase = dayPhase(mark);
          const cycleLabel = phase ? `, ${describeMark(mark, key > cycle.today)}` : '';
          const cls = ['month__cell', outside && 'month__cell--outside', isSelected && 'month__cell--selected', today && 'month__cell--today', phaseClass(phase)].filter(Boolean).join(' ');
          return (
            <button
              key={day.getTime()}
              type="button"
              className={cls}
              aria-pressed={isSelected}
              aria-label={`${formatDayLong(day)}, ${countLabel(items.length)}${cycleLabel}`}
              onClick={() => onSelect(day)}
            >
              <span className="month__num">{day.getDate()}</span>
              {phase === 'ovulation' && <OvulationDot />}
              <span className="month__dots" aria-hidden="true">
                {items.slice(0, shownDots(items.length)).map((item, i) => (
                  <span key={i} className="month__dot" style={{ background: dotColor(item) }} />
                ))}
                {items.length > MAX_DOTS && <span className="month__more">+{items.length - shownDots(items.length)}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {cycleMarks && <Legend settings={cycle.settings} variant="planner" />}

      <section className="cal-agenda" aria-label={`Agenda du ${formatDayLong(selected)}`}>
        <div className="cal-agenda__head">
          <h2 className="cal-agenda__title">{formatDayLong(selected)}</h2>
          <button type="button" className="link-btn" onClick={() => onOpenDay(selected)}>
            Voir la journée
          </button>
        </div>
        {agenda.length === 0 ? (
          <p className="cal-agenda__empty">Rien de prévu.</p>
        ) : (
          <div className="stack">
            {agenda.map((item) => {
              const time = item.kind === 'event' && item.allDay ? 'Journée' : formatHM(item.start);
              return (
                <button
                  key={item.kind === 'task' ? `t-${item.taskId}` : `e-${item.eventId}-${item.start.getTime()}`}
                  type="button"
                  className="row row--compact cal-agenda__row"
                  onClick={() => openSheet(item.kind === 'task' ? { kind: 'task', id: item.taskId } : { kind: 'event', id: item.eventId })}
                >
                  <span className="cal-agenda__time">{time}</span>
                  {item.kind === 'task' ? (
                    <span className="dot" style={{ background: dotColor(item) }} aria-hidden="true" />
                  ) : (
                    <span className="cal-agenda__icon" aria-hidden="true">
                      <IconCalendar size={16} />
                    </span>
                  )}
                  <span className="row__title">{item.title}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
