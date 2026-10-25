/**
 * Charge de travail selon le cycle, pour l'auto-planification.
 *
 * `cycleLoad()` donne, pour chaque jour, un facteur de charge entre 0 et 1 : la part du
 * temps libre de la journée (horaires par défaut moins les événements) que les tâches
 * peuvent occuper. Le planificateur s'en sert comme plafond souple (voir `scheduler.ts`).
 *
 * - Règles (notées ou prévues) : `LOAD_PERIOD`.
 * - Phase folliculaire, fenêtre fertile et ovulation : `LOAD_FULL` (aucun plafond).
 * - Phase lutéale (du lendemain de l'ovulation à la veille des règles prévues, SPM
 *   compris) : pente linéaire de `LOAD_LUTEAL_START` à `LOAD_LUTEAL_END`.
 * - Règles en retard (aujourd'hui) : `LOAD_LATE`, comme la fin de la phase lutéale.
 * - Sans données de cycle, suivi interrompu ou jours au-delà des prédictions : aucun
 *   facteur (la table est vide) ou `LOAD_FULL`.
 *
 * Les phases suivent les prédictions de `forecast()` (cycle.ts) : ovulation 14 jours avant
 * les règles prévues.
 */

import type { CycleDay, CycleMark, CycleSettings, ISODate } from './types';
import { addDaysISO, dayNum, forecast } from './cycle';

/** Pleine charge : phase folliculaire, fenêtre fertile, ovulation. */
export const LOAD_FULL = 1;
/** Premier jour de la phase lutéale (lendemain de l'ovulation). */
export const LOAD_LUTEAL_START = 0.85;
/** Veille des règles prévues : la journée la plus légère de la phase lutéale. */
export const LOAD_LUTEAL_END = 0.5;
/** Pendant les règles. */
export const LOAD_PERIOD = 0.7;
/** Règles en retard : comme la fin de la phase lutéale. */
export const LOAD_LATE = LOAD_LUTEAL_END;

/**
 * Facteur de charge de chaque jour de `from` à `to` inclus (`from` = aujourd'hui).
 * Table vide quand il n'y a rien à prédire (aucune règle notée, suivi interrompu).
 */
export function cycleLoad(
  days: CycleDay[],
  marks: CycleMark[],
  settings: CycleSettings,
  from: ISODate,
  to: ISODate,
): Record<ISODate, number> {
  const out: Record<ISODate, number> = {};
  const fc = forecast(days, marks, settings, from, 4 + Math.ceil((dayNum(to) - dayNum(from)) / 15));
  if (!fc.cycleStart || fc.upcoming.length === 0) return out;

  // Règles en cours (notées ou prévues) puis règles prévues.
  const periods: [ISODate, ISODate][] = fc.upcoming.map((u) => [u.start, u.periodEnd]);
  if (fc.periodUntil) periods.unshift([fc.cycleStart, fc.periodUntil]);
  const last = fc.upcoming[fc.upcoming.length - 1].start;

  for (let n = dayNum(from); n <= dayNum(to); n++) {
    const date = addDaysISO(from, n - dayNum(from));
    out[date] = factorOf(date);
  }
  return out;

  function factorOf(date: ISODate): number {
    if (fc.lateDays > 0 && date === from) return LOAD_LATE;
    if (periods.some(([a, b]) => a <= date && date <= b)) return LOAD_PERIOD;
    if (date >= last) return LOAD_FULL;
    // Cycle dont les règles suivent ce jour : lutéale après son ovulation.
    const next = fc.upcoming.find((u) => u.start > date)!;
    const first = dayNum(next.ovulation) + 1;
    const end = dayNum(next.start) - 1;
    const n = dayNum(date);
    if (n < first) return LOAD_FULL;
    if (end <= first) return LOAD_LUTEAL_END;
    return LOAD_LUTEAL_START + ((LOAD_LUTEAL_END - LOAD_LUTEAL_START) * (n - first)) / (end - first);
  }
}
