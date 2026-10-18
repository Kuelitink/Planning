/** Mode Calendrier : la journée seule, tâches planifiées et événements. */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type TouchEvent } from 'react';
import { dayPlan, type DayItem } from '../core/daily';
import { addDays, atMinutes, formatHM, isSameDay, parseHM, startOfDay } from '../core/time';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { Fab, Header, useNow } from '../ui/kit';
import { IconChevronLeft, IconChevronRight, IconFlag, IconTimer } from '../ui/icons';
import { formatDayShort } from '../ui/format';
import { toneOf } from '../ui/palette';
import './calendar.css';

const HOUR_PX = 60;
/** En dessous de cette hauteur, un bloc tient sur une ligne (titre + heure). */
const SMALL_PX = 40;
/** Glissement horizontal minimal pour changer de jour. */
const SWIPE_PX = 60;

type TimedItem = Exclude<DayItem, { kind: 'event'; allDay: true }>;

interface Placed {
  item: TimedItem;
  /** Minutes depuis minuit, bornées au jour affiché. */
  from: number;
  to: number;
  col: number;
  cols: number;
}

/** Minutes d'horloge depuis minuit du jour affiché (0 avant, 1440 après). */
function minutesOf(d: Date, day: Date): number {
  if (isSameDay(d, day)) return d.getHours() * 60 + d.getMinutes();
  return d.getTime() < day.getTime() ? 0 : 24 * 60;
}

const hourLabel = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:00`;

/** Répartit les éléments qui se chevauchent en colonnes côte à côte. */
function layout(items: TimedItem[], day: Date): Placed[] {
  const placed: Placed[] = items
    .map((item) => ({
      item,
      from: Math.max(0, minutesOf(item.start, day)),
      to: Math.min(24 * 60, minutesOf(item.end, day)),
      col: 0,
      cols: 1,
    }))
    .filter((p) => p.to > p.from)
    .sort((a, b) => a.from - b.from || b.to - a.to);

  let cluster: Placed[] = [];
  let clusterEnd = -1;
  let colEnds: number[] = [];
  const flush = () => {
    for (const p of cluster) p.cols = colEnds.length;
    cluster = [];
    colEnds = [];
  };
  for (const p of placed) {
    if (p.from >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= p.from);
    if (col < 0) {
      col = colEnds.length;
      colEnds.push(p.to);
    } else colEnds[col] = p.to;
    p.col = col;
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, p.to);
  }
  flush();
  return placed;
}

export function CalendarMode() {
  const { plan, tasks, events, windows, settings, projects, active } = useStore();
  const { openSheet } = useNav();
  const now = useNow(60_000);
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const isToday = isSameDay(day, now);

  const dp = useMemo(() => dayPlan(plan, tasks, events, day, { windows, settings }), [plan, tasks, events, day, windows, settings]);
  const { allDay, placed } = useMemo(
    () => ({
      allDay: dp.items.filter((i): i is Extract<DayItem, { kind: 'event' }> => i.kind === 'event' && i.allDay),
      placed: layout(
        dp.items.filter((i): i is TimedItem => !(i.kind === 'event' && i.allDay)),
        day,
      ),
    }),
    [dp, day],
  );
  const atRisk = useMemo(() => new Set(plan.atRisk.map((r) => r.taskId)), [plan.atRisk]);

  // Plage affichée : horaires de la journée, élargie aux éléments qui débordent.
  let startMin = parseHM(settings.dayStart);
  let endMin = parseHM(settings.dayEnd);
  for (const p of placed) {
    startMin = Math.min(startMin, Math.floor(p.from / 60) * 60);
    endMin = Math.max(endMin, Math.ceil(p.to / 60) * 60);
  }
  const nowMin = minutesOf(now, day);
  // On n'élargit pour la ligne « maintenant » que si elle est proche de la plage
  // (pas de timeline qui commence à minuit quand on ouvre l'app la nuit).
  if (isToday && nowMin >= startMin - 120 && nowMin <= endMin + 120) {
    startMin = Math.min(startMin, Math.floor(nowMin / 60) * 60);
    endMin = Math.max(endMin, Math.ceil((nowMin + 1) / 60) * 60);
  }
  startMin = Math.max(0, startMin);
  endMin = Math.min(24 * 60, Math.max(endMin, startMin + 60));
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
    const min = startMin + ((e.clientY - rect.top) / HOUR_PX) * 60;
    const quarter = Math.max(0, Math.min(24 * 60 - 15, Math.floor(min / 15) * 15));
    openSheet({ kind: 'add', date: atMinutes(day, quarter) });
  };

  const onFab = () => {
    let date: Date;
    if (isToday) {
      date = new Date(now);
      date.setHours(now.getHours() + 1, 0, 0, 0);
    } else date = atMinutes(day, 9 * 60);
    openSheet({ kind: 'add', date });
  };

  // Glisser à gauche / à droite : jour suivant / précédent.
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
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > 1.5 * Math.abs(dy)) setDay((d) => addDays(d, dx < 0 ? 1 : -1));
  };

  return (
    <>
      <Header
        right={
          <div className="cal-nav">
            <button type="button" className="icon-btn" aria-label="Jour précédent" onClick={() => setDay((d) => addDays(d, -1))}>
              <IconChevronLeft />
            </button>
            <button
              type="button"
              className="cal-nav__date"
              aria-label={isToday ? formatDayShort(day) : `${formatDayShort(day)} — revenir à aujourd'hui`}
              onClick={() => setDay(startOfDay(new Date()))}
            >
              {formatDayShort(day)}
            </button>
            <button type="button" className="icon-btn" aria-label="Jour suivant" onClick={() => setDay((d) => addDays(d, 1))}>
              <IconChevronRight />
            </button>
          </div>
        }
      />

      {allDay.length > 0 && (
        <div className="cal-allday">
          {allDay.map((ev) => (
            <button key={`${ev.eventId}-${ev.start.getTime()}`} type="button" onClick={() => openSheet({ kind: 'event', id: ev.eventId })}>
              {ev.title}
            </button>
          ))}
        </div>
      )}

      <div className="cal" style={{ height }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
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
            const style: CSSProperties = {
              top,
              height: h,
              left: `calc(${(p.col / p.cols) * 100}% + ${p.col ? 2 : 0}px)`,
              width: `calc(${100 / p.cols}% - ${p.cols > 1 ? 2 : 0}px)`,
            };
            const { item } = p;
            const range = small ? formatHM(item.start) : `${formatHM(item.start)} – ${formatHM(item.end)}`;

            if (item.kind === 'event') {
              return (
                <button
                  key={`e-${item.eventId}-${item.start.getTime()}`}
                  type="button"
                  className={`cal__block cal__block--event${small ? ' cal__block--small' : ''}`}
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
                key={`t-${item.taskId}-${item.start.getTime()}`}
                type="button"
                className={`cal__block${small ? ' cal__block--small' : ''}`}
                style={{ ...style, background: tone.fill, color: tone.ink }}
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

        {isToday && nowMin >= startMin && nowMin <= endMin && <div ref={nowRef} className="cal__now" style={{ top: y(nowMin) - 1 }} aria-hidden="true" />}
      </div>

      <Fab onClick={onFab} />
    </>
  );
}
