import { createTask, createEntity, type NewTask } from '../src/core/entity';
import type { CalendarEvent, Settings, Task, TimeWindow, WindowRule, Weekday } from '../src/core/types';
import { DEFAULT_SETTINGS } from '../src/core/types';
import { formatHM, toISODate } from '../src/core/time';
import type { ScheduleResult } from '../src/core/scheduler';

const CREATED = new Date('2026-10-01T00:00:00');

/** Date locale lisible : `at('2026-10-19 09:30')`. */
export const at = (s: string) => new Date(s.replace(' ', 'T'));

/**
 * Tâche dont l'id est le titre, pour des tests lisibles. Durée et découpage sont fixés ici
 * (30 min, d'un seul tenant) pour que les tests ne dépendent pas des valeurs par défaut de
 * `createTask` (1 h, découpable) ; chaque test peut les préciser.
 */
export const task = (title: string, fields: Partial<NewTask> = {}): Task =>
  createTask({ title, durationMin: 30, splittable: false, ...fields }, CREATED, title);

export const event = (title: string, start: string, end: string, fields: Partial<CalendarEvent> = {}): CalendarEvent =>
  createEntity<CalendarEvent>({ title, start: at(start).toISOString(), end: at(end).toISOString(), ...fields }, CREATED, title);

export const ALL_WEEK: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export const hours = (id: string, start: string, end: string, days: Weekday[] = ALL_WEEK): TimeWindow =>
  createEntity<TimeWindow>({ name: id, rules: days.map((weekday): WindowRule => ({ weekday, start, end })) }, CREATED, id);

export const settings = (overrides: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...overrides });

/** `10-19 09:30` */
export const fmt = (d: Date) => `${toISODate(d).slice(5)} ${formatHM(d)}`;

/** Blocs d'une tâche sous forme `['10-19 08:00', '10-19 09:00']`. */
export const blocksOf = (r: ScheduleResult, id: string) =>
  r.blocks.filter((b) => b.taskId === id).map((b) => [fmt(b.start), fmt(b.end)]);

export const reasonOf = (r: ScheduleResult, id: string) => r.unscheduled.find((u) => u.taskId === id)?.reason;
