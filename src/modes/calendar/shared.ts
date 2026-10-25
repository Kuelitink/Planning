/** Outils partagés par les vues Jour, Semaine et Mois du calendrier. */

import type { DayItem } from '../../core/daily';
import type { ScheduleResult } from '../../core/scheduler';
import type { CalendarEvent, ID, Task } from '../../core/types';
import { expandEvents } from '../../core/events';
import { addDays, atMinutes, isSameDay, startOfDay, toISODate } from '../../core/time';

export type TimedItem = Exclude<DayItem, { kind: 'event'; allDay: true }>;
export type AllDayItem = Extract<DayItem, { kind: 'event' }>;

export interface Placed {
  item: TimedItem;
  /** Minutes depuis minuit, bornées au jour affiché. */
  from: number;
  to: number;
  col: number;
  cols: number;
}

/** Minutes d'horloge depuis minuit du jour affiché (0 avant, 1440 après). */
export function minutesOf(d: Date, day: Date): number {
  if (isSameDay(d, day)) return d.getHours() * 60 + d.getMinutes();
  return d.getTime() < day.getTime() ? 0 : 24 * 60;
}

export const WEEKDAY_INITIAL = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export const hourLabel = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:00`;

export const isTimed = (i: DayItem): i is TimedItem => !(i.kind === 'event' && i.allDay);
export const isAllDay = (i: DayItem): i is AllDayItem => i.kind === 'event' && i.allDay;

/** Clé React stable d'un élément du jour. */
export const itemKey = (i: DayItem) => (i.kind === 'event' ? `e-${i.eventId}-${i.start.getTime()}` : `t-${i.taskId}-${i.start.getTime()}`);

/** Répartit les éléments qui se chevauchent en colonnes côte à côte. */
export function layout(items: TimedItem[], day: Date): Placed[] {
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

/** Position horizontale d'un bloc dans sa colonne de chevauchement. */
export function columnStyle(p: Placed, gap = 2) {
  return {
    left: `calc(${(p.col / p.cols) * 100}% + ${p.col ? gap : 0}px)`,
    width: `calc(${100 / p.cols}% - ${p.cols > 1 ? gap : 0}px)`,
  };
}

/** Quart d'heure touché dans une colonne de grille, en date. */
export function quarterAt(day: Date, startMin: number, hourPx: number, offsetY: number): Date {
  const min = startMin + (offsetY / hourPx) * 60;
  const quarter = Math.max(0, Math.min(24 * 60 - 15, Math.floor(min / 15) * 15));
  return atMinutes(day, quarter);
}

/** Date proposée par le bouton + : prochaine heure ronde aujourd'hui, sinon 9:00. */
export function proposedDate(day: Date, now: Date): Date {
  if (isSameDay(day, now)) {
    const d = new Date(now);
    d.setHours(now.getHours() + 1, 0, 0, 0);
    return d;
  }
  return atMinutes(day, 9 * 60);
}

/** Élément du mois : une tâche (morceaux regroupés) ou une occurrence d'événement. */
export type MonthItem =
  | { kind: 'task'; taskId: ID; title: string; projectId?: ID; start: Date; end: Date }
  | { kind: 'event'; eventId: ID; title: string; start: Date; end: Date; allDay: boolean };

/**
 * Éléments par jour (`YYYY-MM-DD`) entre `from` et `to` : tâches planifiées (une
 * entrée par tâche et par jour) et événements (sur chaque jour qu'ils touchent).
 */
export function itemsByDay(plan: ScheduleResult, tasks: Task[], events: CalendarEvent[], from: Date, to: Date): Map<string, MonthItem[]> {
  const out = new Map<string, MonthItem[]>();
  const push = (key: string, item: MonthItem) => {
    const list = out.get(key);
    if (list) list.push(item);
    else out.set(key, [item]);
  };
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const taskOfDay = new Map<string, Extract<MonthItem, { kind: 'task' }>>();
  for (const b of plan.blocks) {
    if (b.end <= from || b.start >= to) continue;
    const task = byId.get(b.taskId);
    if (!task) continue;
    const key = toISODate(b.start);
    const seen = taskOfDay.get(`${key}|${b.taskId}`);
    if (seen) {
      if (b.start < seen.start) seen.start = b.start;
      if (b.end > seen.end) seen.end = b.end;
      continue;
    }
    const item = { kind: 'task' as const, taskId: task.id, title: task.title, projectId: task.projectId, start: b.start, end: b.end };
    taskOfDay.set(`${key}|${b.taskId}`, item);
    push(key, item);
  }
  for (const occ of expandEvents(events, from, to)) {
    const item: MonthItem = { kind: 'event', eventId: occ.eventId, title: occ.title, start: occ.start, end: occ.end, allDay: occ.allDay };
    // Un événement sur plusieurs jours apparaît sur chacun d'eux.
    const last = new Date(occ.end.getTime() - 1);
    for (let d = startOfDay(occ.start < from ? from : occ.start); d <= last && d < to; d = addDays(d, 1)) push(toISODate(d), item);
  }
  for (const list of out.values()) {
    list.sort(
      (a, b) =>
        Number(b.kind === 'event' && b.allDay) - Number(a.kind === 'event' && a.allDay) || a.start.getTime() - b.start.getTime(),
    );
  }
  return out;
}
