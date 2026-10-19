/** Vue Jour : timeline de la journée, tâches planifiées et événements. */

import { useEffect, useMemo, useRef, type CSSProperties, type MouseEvent } from 'react';
import { dayPlan } from '../../core/daily';
import { formatHM, isSameDay, parseHM, toISODate } from '../../core/time';
import { useStore } from '../../state/store';
import { useNav } from '../../state/nav';
import { useNow } from '../../ui/kit';
import { IconFlag, IconTimer } from '../../ui/icons';
import { toneOf } from '../../ui/palette';
import { columnStyle, hourLabel, hourRange, isAllDay, isTimed, itemKey, layout, minutesOf, quarterAt } from './shared';
import { OvulationDot, dayPhase, describeMark, phaseClass, useCalendarMarks } from '../cycle/shared';
import '../cycle.css';

const HOUR_PX = 60;
/** En dessous de cette hauteur, un bloc tient sur une ligne (titre + heure). */
const SMALL_PX = 40;
/** En dessous de cette hauteur, titre et heure sont serrés (ex. 45 min). */
const MEDIUM_PX = 52;

export function DayView({ day }: { day: Date }) {
  const { plan, tasks, events, windows, settings, projects, active } = useStore();
  const { openSheet } = useNav();
  const now = useNow(60_000);
  const isToday = isSameDay(day, now);

  const dp = useMemo(() => dayPlan(plan, tasks, events, day, { windows, settings }), [plan, tasks, events, day, windows, settings]);
  const { allDay, placed } = useMemo(
    () => ({ allDay: dp.items.filter(isAllDay), placed: layout(dp.items.filter(isTimed), day) }),
    [dp, day],
  );
  // Phase du cycle du jour : une étiquette discrète au-dessus de la timeline.
  const dayKey = toISODate(day);
  const cycleMark = useCalendarMarks(dayKey, dayKey)?.get(dayKey);
  const phase = dayPhase(cycleMark);

  const atRisk = useMemo(() => new Set(plan.atRisk.map((r) => r.taskId)), [plan.atRisk]);

  const nowMin = minutesOf(now, day);
  const { startMin, endMin } = hourRange(parseHM(settings.dayStart), parseHM(settings.dayEnd), placed, isToday ? nowMin : null);
  const y = (min: number) => ((min - startMin) / 60) * HOUR_PX;
  const height = y(endMin);

  const hours: number[] = [];
  for (let m = startMin; m <= endMin; m += 60) hours.push(m);

  // À l'ouverture (et au retour sur aujourd'hui), on montre l'heure actuelle.
  const nowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isToday) nowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.getTime()]);

  const colorOf = (projectId?: string) => toneOf(projects.find((p) => p.id === projectId)?.color);

  /** Toucher un créneau vide : ajouter à ce quart d'heure. */
  const onGridClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    openSheet({ kind: 'add', date: quarterAt(day, startMin, HOUR_PX, e.clientY - rect.top) });
  };

  return (
    <>
      {phase && (
        <p className="cal-cycle">
          <span className={`cal-cycle__tag ${phaseClass(phase)}`}>
            {phase === 'ovulation' && <OvulationDot />}
            {describeMark(cycleMark, dayKey > toISODate(now))}
          </span>
        </p>
      )}
      {allDay.length > 0 && (
        <div className="cal-allday">
          {allDay.map((ev) => (
            <button key={itemKey(ev)} type="button" onClick={() => openSheet({ kind: 'event', id: ev.eventId })}>
              {ev.title}
            </button>
          ))}
        </div>
      )}

      <div className="cal" style={{ height }}>
        {hours.map((m) => (
          <div key={m}>
            <span className="cal__hour" style={{ top: y(m) }} aria-hidden="true">
              {hourLabel(m)}
            </span>
            <div className="cal__line" style={{ top: y(m) }} aria-hidden="true" />
          </div>
        ))}

        <div className="cal__grid" onClick={onGridClick}>
          {placed.map((p) => {
            const top = y(p.from) + 1;
            const h = Math.max(14, y(p.to) - y(p.from) - 2);
            const small = h < SMALL_PX;
            const size = small ? ' cal__block--small' : h < MEDIUM_PX ? ' cal__block--medium' : '';
            const style: CSSProperties = { top, height: h, ...columnStyle(p) };
            const { item } = p;
            const range = small ? formatHM(item.start) : `${formatHM(item.start)} – ${formatHM(item.end)}`;

            if (item.kind === 'event') {
              return (
                <button
                  key={itemKey(item)}
                  type="button"
                  className={`cal__block cal__block--event${size}`}
                  style={style}
                  aria-label={`Événement ${item.title}, ${formatHM(item.start)} à ${formatHM(item.end)}`}
                  onClick={() => openSheet({ kind: 'event', id: item.eventId })}
                >
                  <span className="cal__title">
                    <span>{item.title}</span>
                  </span>
                  <span className="cal__time">{range}</span>
                </button>
              );
            }

            const tone = colorOf(item.projectId);
            const running = active?.taskId === item.taskId;
            const part = item.part ? ` · ${item.part.index}/${item.part.count}` : '';
            return (
              <button
                key={itemKey(item)}
                type="button"
                className={`cal__block${size}`}
                style={{ ...style, '--tone-fill': tone.fill } as CSSProperties}
                aria-label={`${item.title}, ${formatHM(item.start)} à ${formatHM(item.end)}${running ? ', chrono en cours' : ''}`}
                onClick={() => openSheet({ kind: 'task', id: item.taskId })}
              >
                <span className="cal__title">
                  {running && (
                    <span className="cal__running" aria-hidden="true">
                      <span className="dot" style={{ background: 'var(--accent)' }} />
                      <IconTimer size={14} />
                    </span>
                  )}
                  <span>{item.title}</span>
                  {atRisk.has(item.taskId) && (
                    <span className="cal__risk" aria-hidden="true">
                      <IconFlag size={13} />
                    </span>
                  )}
                </span>
                <span className="cal__time">
                  {range}
                  {part}
                </span>
              </button>
            );
          })}
        </div>

        {isToday && nowMin >= startMin && nowMin <= endMin && (
          <div ref={nowRef} className="cal__now" style={{ top: y(nowMin) - 1 }} aria-hidden="true">
            <span className="cal__now-label">{formatHM(now)}</span>
          </div>
        )}
      </div>
    </>
  );
}
