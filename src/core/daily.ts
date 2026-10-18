/**
 * « To-do du jour » : la journée ordonnée (tâches planifiées + événements) et ses totaux.
 */

import type { CalendarEvent, ID, Priority, Settings, Task, TimeWindow } from './types';
import { DEFAULT_SETTINGS } from './types';
import type { ScheduleResult } from './scheduler';
import { expandEvents } from './events';
import { clip, normalize, subtract, totalLength, type Interval } from './intervals';
import { addDays, MINUTE, parseDateTime, startOfDay, toISODate, isSameDay } from './time';
import { defaultRules, defaultWindow, windowAvailability } from './windows';

export type DayItem =
  | {
      kind: 'task';
      taskId: ID;
      title: string;
      projectId?: ID;
      priority: Priority;
      start: Date;
      end: Date;
      pinned: boolean;
      /** Pour une tâche découpée : numéro du morceau (1…count). */
      part?: { index: number; count: number };
    }
  | { kind: 'event'; eventId: ID; title: string; start: Date; end: Date; allDay: boolean };

export interface DayPlan {
  date: string;
  items: DayItem[];
  /** Tâches terminées ce jour-là. */
  done: Task[];
  totals: {
    /** Minutes de tâches planifiées dans la journée. */
    taskMin: number;
    /** Minutes d'événements (hors journée entière). */
    eventMin: number;
    /** Minutes des horaires par défaut de la journée. */
    capacityMin: number;
    /** Minutes libres dans ces horaires. */
    freeMin: number;
  };
}

export interface DayPlanOptions {
  windows?: TimeWindow[];
  settings?: Settings;
}

export function dayPlan(
  result: ScheduleResult,
  tasks: Task[],
  events: CalendarEvent[],
  date: Date,
  options: DayPlanOptions = {},
): DayPlan {
  const settings = options.settings ?? DEFAULT_SETTINGS;
  const dayStart = startOfDay(date);
  const dayEnd = addDays(dayStart, 1);
  const from = dayStart.getTime();
  const to = dayEnd.getTime();
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const items: DayItem[] = [];
  const taskIntervals: Interval[] = [];
  const eventIntervals: Interval[] = [];

  const blocksByTask = new Map<ID, ScheduleResult['blocks']>();
  for (const b of result.blocks) {
    if (!blocksByTask.has(b.taskId)) blocksByTask.set(b.taskId, []);
    blocksByTask.get(b.taskId)!.push(b);
  }

  for (const b of result.blocks) {
    if (b.end.getTime() <= from || b.start.getTime() >= to) continue;
    const task = byId.get(b.taskId);
    if (!task) continue;
    const all = blocksByTask.get(b.taskId)!;
    items.push({
      kind: 'task',
      taskId: task.id,
      title: task.title,
      projectId: task.projectId,
      priority: task.priority,
      start: b.start,
      end: b.end,
      pinned: Boolean(b.pinned),
      part: all.length > 1 ? { index: all.indexOf(b) + 1, count: all.length } : undefined,
    });
    taskIntervals.push({ start: b.start.getTime(), end: b.end.getTime() });
  }

  for (const occ of expandEvents(events, dayStart, dayEnd)) {
    items.push({ kind: 'event', eventId: occ.eventId, title: occ.title, start: occ.start, end: occ.end, allDay: occ.allDay });
    if (!occ.allDay) eventIntervals.push({ start: occ.start.getTime(), end: occ.end.getTime() });
  }

  items.sort(
    (a, b) =>
      Number(b.kind === 'event' && b.allDay) - Number(a.kind === 'event' && a.allDay) ||
      a.start.getTime() - b.start.getTime() ||
      (a.kind === b.kind ? 0 : a.kind === 'event' ? -1 : 1),
  );

  const done = tasks.filter((t) => t.status === 'done' && t.doneAt && isSameDay(parseDateTime(t.doneAt), dayStart));

  const tasksInDay = normalize(clip(taskIntervals, from, to));
  const eventsInDay = normalize(clip(eventIntervals, from, to));
  const windows = options.windows ?? [];
  const capacity = windowAvailability(defaultWindow(windows, settings), defaultRules(windows, settings), from, to);
  const free = subtract(capacity, normalize([...tasksInDay, ...eventsInDay]));

  return {
    date: toISODate(dayStart),
    items,
    done,
    totals: {
      taskMin: Math.round(totalLength(clip(taskIntervals, from, to)) / MINUTE),
      eventMin: Math.round(totalLength(eventsInDay) / MINUTE),
      capacityMin: Math.round(totalLength(capacity) / MINUTE),
      freeMin: Math.round(totalLength(free) / MINUTE),
    },
  };
}
