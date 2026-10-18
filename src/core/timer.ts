/** Chrono : un seul en cours à la fois ; totaux par tâche, par jour, par semaine. */

import type { ID, TimeEntry } from './types';
import { addDays, parseDateTime, startOfDay, startOfWeek } from './time';
import { createEntity } from './entity';

export function activeEntry(entries: TimeEntry[]): TimeEntry | undefined {
  return entries.find((e) => !e.end);
}

/** Arrête le chrono en cours (s'il y en a un). */
export function stopTimer(entries: TimeEntry[], now: Date): { entries: TimeEntry[]; stopped?: TimeEntry } {
  const active = activeEntry(entries);
  if (!active) return { entries };
  const iso = now.toISOString();
  const stopped: TimeEntry = { ...active, end: iso, updatedAt: iso };
  return { entries: entries.map((e) => (e.id === active.id ? stopped : e)), stopped };
}

/** Démarre un chrono sur `taskId` ; le chrono en cours est arrêté d'abord. */
export function startTimer(
  entries: TimeEntry[],
  taskId: ID | undefined,
  now: Date,
  id?: ID,
): { entries: TimeEntry[]; started: TimeEntry; stopped?: TimeEntry } {
  const { entries: afterStop, stopped } = stopTimer(entries, now);
  const started = createEntity<TimeEntry>({ taskId, start: now.toISOString() }, now, id);
  return { entries: [...afterStop, started], started, stopped };
}

/** Durée d'une session (en cours : jusqu'à `now`), en ms. */
export function entryDuration(entry: TimeEntry, now: Date): number {
  const end = entry.end ? parseDateTime(entry.end).getTime() : now.getTime();
  return Math.max(0, end - parseDateTime(entry.start).getTime());
}

/** Temps passé dans [from, to), sessions rognées aux bornes, en ms. */
export function totalInRange(entries: TimeEntry[], from: Date, to: Date, now: Date, taskId?: ID): number {
  let sum = 0;
  for (const e of entries) {
    if (taskId !== undefined && e.taskId !== taskId) continue;
    const start = Math.max(parseDateTime(e.start).getTime(), from.getTime());
    const end = Math.min(e.end ? parseDateTime(e.end).getTime() : now.getTime(), to.getTime());
    if (end > start) sum += end - start;
  }
  return sum;
}

/** Temps total par tâche (sessions sans tâche sous la clé `''`), en ms. */
export function totalsByTask(entries: TimeEntry[], now: Date): Map<ID, number> {
  const totals = new Map<ID, number>();
  for (const e of entries) {
    const key = e.taskId ?? '';
    totals.set(key, (totals.get(key) ?? 0) + entryDuration(e, now));
  }
  return totals;
}

export function totalForDay(entries: TimeEntry[], day: Date, now: Date): number {
  const start = startOfDay(day);
  return totalInRange(entries, start, addDays(start, 1), now);
}

export function totalForWeek(entries: TimeEntry[], day: Date, now: Date, weekStartsOn: 0 | 1 = 1): number {
  const start = startOfWeek(day, weekStartsOn);
  return totalInRange(entries, start, addDays(start, 7), now);
}

/** 2_537_000 ms → « 00:42:17 ». */
export function formatClock(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
