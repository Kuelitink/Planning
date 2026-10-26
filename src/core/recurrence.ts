/**
 * Tâches récurrentes (comme dans FlowSavvy) : une tâche qui revient tous les N jours, toutes
 * les N semaines (certains jours) ou tous les N mois.
 *
 * Une tâche récurrente porte la date de son occurrence en cours (`Task.occurrence`) : elle est
 * planifiée ce jour-là (pas avant, et due avant la fin du jour). La cocher la fait passer à
 * l'occurrence suivante au lieu de la terminer ; une occurrence en retard rattrape aujourd'hui.
 * La série s'arrête après `until` : la dernière occurrence cochée termine la tâche.
 */

import type { ISODate, Task, TaskRecurrence, TimeRange, Weekday } from './types';
import { addDays, parseISODate, startOfWeek, toISODate } from './time';

/** Au-delà, on considère qu'il n'y a plus d'occurrence (série mal réglée). */
const MAX_SEARCH_DAYS = 3 * 366;

const dayIndex = (d: Date) => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1970, 0, 1)) / 86_400_000);

/** Jours de la semaine d'une récurrence hebdomadaire (par défaut : celui du premier jour). */
export function weekdaysOf(rec: TaskRecurrence): Weekday[] {
  return rec.weekdays?.length ? rec.weekdays : [parseISODate(rec.start).getDay() as Weekday];
}

/** `date` est-elle une occurrence de la série ? */
export function isOccurrence(rec: TaskRecurrence, date: ISODate): boolean {
  if (date < rec.start || (rec.until && date > rec.until)) return false;
  const start = parseISODate(rec.start);
  const d = parseISODate(date);
  const every = Math.max(1, Math.round(rec.interval) || 1);
  if (rec.freq === 'daily') return (dayIndex(d) - dayIndex(start)) % every === 0;
  if (rec.freq === 'weekly') {
    if (!weekdaysOf(rec).includes(d.getDay() as Weekday)) return false;
    const weeks = Math.round((dayIndex(startOfWeek(d, 1)) - dayIndex(startOfWeek(start, 1))) / 7);
    return weeks % every === 0;
  }
  // Mensuelle : même jour du mois (le dernier jour pour un 29, 30 ou 31 trop grand).
  const months = (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth();
  if (months % every !== 0) return false;
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getDate() === Math.min(start.getDate(), lastDay);
}

/** Première occurrence strictement après `after` (absente : la série est finie). */
export function nextOccurrence(rec: TaskRecurrence, after: ISODate): ISODate | undefined {
  let d = parseISODate(after < rec.start ? toISODate(addDays(parseISODate(rec.start), -1)) : after);
  for (let i = 0; i < MAX_SEARCH_DAYS; i++) {
    d = addDays(d, 1);
    const iso = toISODate(d);
    if (rec.until && iso > rec.until) return undefined;
    if (isOccurrence(rec, iso)) return iso;
  }
  return undefined;
}

/** Première occurrence le `date` ou après. */
export function occurrenceFrom(rec: TaskRecurrence, date: ISODate): ISODate | undefined {
  return isOccurrence(rec, date) ? date : nextOccurrence(rec, date);
}

/**
 * Occurrence qui suit une occurrence faite : la suivante de la série, mais pas avant
 * aujourd'hui (une occurrence en retard cochée rattrape la série à aujourd'hui).
 */
export function occurrenceAfterDone(rec: TaskRecurrence, done: ISODate, today: ISODate): ISODate | undefined {
  const next = nextOccurrence(rec, done);
  if (!next || next >= today) return next;
  return occurrenceFrom(rec, today);
}

const WEEKDAY_NAMES = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

/** « Tous les jours », « Toutes les 2 semaines (lun., jeu.) », « Tous les mois ». */
export function describeRecurrence(rec: TaskRecurrence): string {
  const n = Math.max(1, Math.round(rec.interval) || 1);
  if (rec.freq === 'daily') return n === 1 ? 'Tous les jours' : `Tous les ${n} jours`;
  if (rec.freq === 'monthly') return n === 1 ? 'Tous les mois' : `Tous les ${n} mois`;
  const days = [1, 2, 3, 4, 5, 6, 0]
    .filter((d) => weekdaysOf(rec).includes(d as Weekday))
    .map((d) => WEEKDAY_NAMES[d])
    .join(', ');
  return `${n === 1 ? 'Toutes les semaines' : `Toutes les ${n} semaines`} (${days})`;
}

/** Décale un créneau fixé d'un nombre de jours (même heure locale). */
function shiftPinned(pinned: TimeRange | undefined, days: number): TimeRange | undefined {
  if (!pinned || !days) return pinned;
  const move = (s: string) => addDays(new Date(s), days).toISOString();
  return { start: move(pinned.start), end: move(pinned.end) };
}

const daysBetween = (from: ISODate, to: ISODate) => dayIndex(parseISODate(to)) - dayIndex(parseISODate(from));

/**
 * Tâche récurrente cochée : ce qui change pour passer à l'occurrence suivante (son créneau
 * fixé suit, à la même heure). Absent : la série est finie, la tâche se termine vraiment.
 */
export function advanceRecurring(task: Task, today: ISODate): Partial<Task> | undefined {
  if (!task.recurrence) return undefined;
  const current = task.occurrence ?? today;
  const next = occurrenceAfterDone(task.recurrence, current, today);
  if (!next) return undefined;
  return { occurrence: next, prevOccurrence: current, pinned: shiftPinned(task.pinned, daysBetween(current, next)) };
}

/** « Annuler » après avoir coché une tâche récurrente : retour à l'occurrence précédente. */
export function revertRecurring(task: Task): Partial<Task> | undefined {
  if (!task.recurrence || !task.prevOccurrence || !task.occurrence) return undefined;
  return {
    occurrence: task.prevOccurrence,
    prevOccurrence: undefined,
    pinned: shiftPinned(task.pinned, daysBetween(task.occurrence, task.prevOccurrence)),
  };
}
