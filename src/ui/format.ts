/** Formats de dates en français. */

import { addDays, isDateOnly, isSameDay, parseDateTime, startOfDay } from '../core/time';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const longDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const monthYear = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** « Lundi 19 octobre » */
export function formatDayLong(d: Date): string {
  return cap(longDay.format(d));
}

/** « Lun. 19 oct. » */
export function formatDayShort(d: Date): string {
  return cap(shortDay.format(d));
}

/** « Octobre 2026 » */
export function formatMonth(d: Date): string {
  return cap(monthYear.format(d));
}

/** « 19 oct. » */
export function formatDayMonth(d: Date): string {
  return dayMonth.format(d);
}

/** « Aujourd'hui », « Demain », « Hier » ou « Lun. 19 oct. » */
export function formatRelativeDay(d: Date, now = new Date()): string {
  const today = startOfDay(now);
  if (isSameDay(d, today)) return "Aujourd'hui";
  if (isSameDay(d, addDays(today, 1))) return 'Demain';
  if (isSameDay(d, addDays(today, -1))) return 'Hier';
  return formatDayShort(d);
}

/** Échéance : « Demain », « Mer. 21 oct. 18:00 »… */
export function formatDeadline(s: string, now = new Date()): string {
  const d = parseDateTime(s);
  const day = formatRelativeDay(d, now);
  if (isDateOnly(s)) return day;
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${hm}`;
}

/** Numéro de semaine ISO. */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Valeur pour `<input type="datetime-local">` / `type="date"` / `type="time"`. */
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const toInputDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const toInputTime = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
/** `YYYY-MM-DD` + `HH:MM` → Date locale. */
export function fromInputs(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h || 0, min || 0);
}
