/**
 * Utilitaires de dates en heure locale. On évite `new Date('YYYY-MM-DD')`,
 * qui est interprété en UTC : les dates seules passent par `parseISODate`.
 */

import type { ISODate } from './types';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** `"09:30"` → 570. Accepte `24:00`. */
export function parseHM(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!m) throw new Error(`Heure invalide : ${hm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) throw new Error(`Heure invalide : ${hm}`);
  return h * 60 + min;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Heure locale `HH:MM`. */
export function formatHM(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Ajoute des jours calendaires (garde l'heure locale, même en cas de changement d'heure). */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}

export function addMinutes(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MINUTE);
}

/** Le jour `day` à `minutes` après minuit, heure locale (1440 = minuit suivant). */
export function atMinutes(day: Date, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
}

export function startOfWeek(d: Date, weekStartsOn: 0 | 1 = 1): Date {
  const s = startOfDay(d);
  return addDays(s, -((s.getDay() - weekStartsOn + 7) % 7));
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateOnly(s: string): boolean {
  return DATE_ONLY.test(s);
}

/** `YYYY-MM-DD` → minuit local. */
export function parseISODate(s: string): Date {
  const m = DATE_ONLY.exec(s);
  if (!m) throw new Error(`Date invalide : ${s}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Date-heure ISO, ou date seule (→ minuit local). */
export function parseDateTime(s: string): Date {
  return isDateOnly(s) ? parseISODate(s) : new Date(s);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Arrondit à la grille de `gridMin` minutes au-dessus, grille alignée sur minuit local. */
export function roundUpToGrid(ms: number, gridMin: number): number {
  const step = Math.max(1, gridMin) * MINUTE;
  const midnight = startOfDay(new Date(ms)).getTime();
  return midnight + Math.ceil((ms - midnight) / step) * step;
}

/** 90 → « 1 h 30 », 45 → « 45 min », 120 → « 2 h ». */
export function formatDuration(totalMin: number): string {
  const min = Math.round(totalMin);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${pad(rest)}` : `${h} h`;
}
