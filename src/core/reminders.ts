/**
 * Rappels du mode Cycle, comme ceux de Clue : règles proches ou en retard, SPM, fenêtre
 * fertile, saisie du jour. Sans serveur, ils s'affichent dans l'app (et en notification
 * du téléphone si on l'a permis) quand l'app est ouverte.
 */

import type { CycleSettings, ISODate } from './types';
import { daysBetween, type Forecast } from './cycle';

export type ReminderKind = 'late' | 'period' | 'pms' | 'fertile' | 'checkin';

export interface Reminder {
  /** Clé stable sur la journée (une notification par clé et par jour). */
  key: string;
  kind: ReminderKind;
  text: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

export function cycleReminders(
  fc: Forecast,
  settings: CycleSettings,
  today: ISODate,
  /** Heure actuelle `HH:MM`. */
  time: string,
  loggedToday: boolean,
  formatDate: (d: ISODate) => string,
): Reminder[] {
  const out: Reminder[] = [];
  if (fc.nextPeriod && fc.phase !== 'period') {
    if (fc.lateDays > 0) out.push({ key: 'late', kind: 'late', text: `Règles en retard de ${plural(fc.lateDays, 'jour')}` });
    else if (fc.daysUntil === 0) out.push({ key: 'period-today', kind: 'period', text: "Règles prévues aujourd'hui" });
    else if (settings.remindPeriodDays > 0 && fc.daysUntil !== undefined && fc.daysUntil <= settings.remindPeriodDays) {
      out.push({ key: 'period-soon', kind: 'period', text: `Règles prévues dans ${plural(fc.daysUntil, 'jour')}` });
    }
  }
  if (settings.remindPms && settings.showPms && fc.pms && today >= fc.pms[0] && today <= fc.pms[1] && fc.phase === 'pms') {
    out.push({ key: 'pms', kind: 'pms', text: `SPM possible jusqu'au ${formatDate(fc.pms[1])}` });
  }
  if (settings.remindFertile && settings.showFertile && fc.fertile && fc.phase !== 'period') {
    const [start, end] = fc.fertile;
    if (today >= start && today <= end)
      out.push({ key: 'fertile', kind: 'fertile', text: `Fenêtre fertile (estimée) jusqu'au ${formatDate(end)}` });
    else if (daysBetween(today, start) === 1)
      out.push({ key: 'fertile-soon', kind: 'fertile', text: 'Fenêtre fertile (estimée) à partir de demain' });
  }
  if (settings.checkInTime && !loggedToday && time >= settings.checkInTime) {
    out.push({ key: 'checkin', kind: 'checkin', text: 'Comment te sens-tu aujourd’hui ? Note ta journée.' });
  }
  return out;
}
