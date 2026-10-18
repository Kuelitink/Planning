/** Vue Semaine : 7 colonnes, grille horaire, tâches planifiées et événements. */

import { useEffect, useMemo, useRef, type CSSProperties, type MouseEvent } from 'react';
import { dayPlan } from '../../core/daily';
import { addDays, formatHM, isSameDay, parseHM } from '../../core/time';
import { useStore } from '../../state/store';
import { useNav } from '../../state/nav';
import { useNow } from '../../ui/kit';
import { formatDayLong } from '../../ui/format';
import { toneOf } from '../../ui/palette';
import { columnStyle, hourLabel, hourRange, isAllDay, isTimed, itemKey, layout, minutesOf, quarterAt } from './shared';

const HOUR_PX = 48;
/** Hauteur d'une ligne de titre (11px) dans un bloc. */
const LINE_PX = 13;
export const WEEKDAY_INITIAL = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export function WeekView({ weekStart, onPickDay }: { weekStart: Date; onPickDay: (day: Date) => void }) {
  const { plan, tasks, events, windows, settings, projects, active } = useStore();
  const { openSheet } = useNav();
  const now = useNow(60_000);
  const startKey = weekStart.getTime();

  const columns = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(new Date(startKey), i);
      const dp = dayPlan(plan, tasks, events, day, { windows, settings });
      return { day, allDay: dp.items.filter(isAllDay), placed: layout(dp.items.filter(isTimed), day) };
    });
  }, [startKey, plan, tasks, events, windows, settings]);

  const todayIdx = columns.findIndex((c) => isSameDay(c.day, now));
  const nowMin = todayIdx >= 0 ? minutesOf(now, columns[todayIdx].day) : null;
  const { startMin, endMin } = hourRange(
    parseHM(settings.dayStart),
    parseHM(settings.dayEnd),
    columns.flatMap((c) => c.placed),
    nowMin,
  );
  const y = (min: number) => ((min - startMin) / 60) * HOUR_PX;
  const height = y(endMin);
  const hours: number[] = [];
  for (let m = startMin; m <= endMin; m += 60) hours.push(m);
  const hasAllDay = columns.some((c) => c.allDay.length > 0);

  // À l'ouverture d'une semaine qui contient aujourd'hui, on montre l'heure actuelle.
  const nowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (nowRef.current) nowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [startKey]);

  const colorOf = (projectId?: string) => toneOf(projects.find((p) => p.id === projectId)?.color);

  const onColumnClick = (day: Date) => (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    openSheet({ kind: 'add', date: quarterAt(day, startMin, HOUR_PX, e.clientY - rect.top) });
  };

  return (
    <div className="week">
      <div className="week__head">
        <span className="week__corner" aria-hidden="true" />
        {columns.map(({ day }) => {
          const today = isSameDay(day, now);
          return (
            <button key={day.getTime()} type="button" className="week__day" aria-label={`${formatDayLong(day)} — voir la journée`} onClick={() => onPickDay(day)}>
              <span className="week__dow" aria-hidden="true">
                {WEEKDAY_INITIAL[day.getDay()]}
              </span>
              <span className={today ? 'week__num week__num--today' : 'week__num'} aria-hidden="true">
                {day.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {hasAllDay && (
        <div className="week__allday">
          <span className="week__corner" aria-hidden="true" />
          {columns.map(({ day, allDay }) => (
            <div key={day.getTime()} className="week__allday-col">
              {allDay.slice(0, 2).map((ev) => (
                <button
                  key={itemKey(ev)}
                  type="button"
                  className="week__allday-item"
                  aria-label={`Événement ${ev.title}, journée entière`}
                  onClick={() => openSheet({ kind: 'event', id: ev.eventId })}
                >
                  {ev.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="week__body" style={{ height }}>
        {hours.map((m) => (
          <div key={m}>
            <span className="week__hour" style={{ top: y(m) }} aria-hidden="true">
              {hourLabel(m).slice(0, 2)}
            </span>
            <div className="week__line" style={{ top: y(m) }} aria-hidden="true" />
          </div>
        ))}

        <div className="week__cols">
          {columns.map(({ day, placed }, i) => (
            <div key={day.getTime()} className="week__col" onClick={onColumnClick(day)}>
              {placed.map((p) => {
                const top = y(p.from) + 1;
                const h = Math.max(14, y(p.to) - y(p.from) - 2);
                const lines = Math.max(1, Math.floor((h - 6) / LINE_PX));
                const { item } = p;
                const when = `${formatHM(item.start)} à ${formatHM(item.end)}`;
                const titleStyle = { WebkitLineClamp: lines };
                if (item.kind === 'event') {
                  return (
                    <button
                      key={itemKey(item)}
                      type="button"
                      className="week__block week__block--event"
                      style={{ top, height: h, ...columnStyle(p, 1) }}
                      aria-label={`Événement ${item.title}, ${when}`}
                      onClick={() => openSheet({ kind: 'event', id: item.eventId })}
                    >
                      <span className="week__title" style={titleStyle}>
                        {item.title}
                      </span>
                    </button>
                  );
                }
                const tone = colorOf(item.projectId);
                const running = active?.taskId === item.taskId;
                return (
                  <button
                    key={itemKey(item)}
                    type="button"
                    className={running ? 'week__block week__block--running' : 'week__block'}
                    style={{ top, height: h, '--tone-fill': tone.fill, '--tone-ink': tone.ink, ...columnStyle(p, 1) } as CSSProperties}
                    aria-label={`${item.title}, ${when}${running ? ', chrono en cours' : ''}`}
                    onClick={() => openSheet({ kind: 'task', id: item.taskId })}
                  >
                    <span className="week__title" style={titleStyle}>
                      {item.title}
                    </span>
                  </button>
                );
              })}
              {i === todayIdx && nowMin !== null && nowMin >= startMin && nowMin <= endMin && (
                <div ref={nowRef} className="week__now" style={{ top: y(nowMin) - 1 }} aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
