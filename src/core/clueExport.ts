/**
 * Export des données du cycle au format de l'export Clue (« Télécharger mes données ») :
 * un dossier `ClueDataDownload-AAAA-MM-JJ` avec `measurements.json`, `cycle_attributes.json`,
 * `profile.json`, `tags_tracked.json` et `notifications.json`. Le fichier se réimporte ici
 * (Cycle › Réglages › Importer depuis Clue) et se lit avec les outils qui lisent les exports Clue.
 * Contrairement à Clue, le zip n'est pas chiffré.
 */

import { zipSync, strToU8 } from 'fflate';
import type { CycleDay, CycleMark, CycleSettings, ISODate } from './types';

/** Types que Clue écrit comme un seul objet `{ option }` (les autres sont des listes). */
const SINGLE = new Set(['pms', 'iud']);

interface Measurement {
  type: string;
  id: string;
  date: ISODate;
  value: unknown;
}

/** Mesures d'un jour, au format de `measurements.json`. */
function measurements(d: CycleDay): Measurement[] {
  const out: Measurement[] = [];
  const add = (type: string, value: unknown) => out.push({ type, id: `${d.date}-${type}`, date: d.date, value });
  if (d.flow) add('period', { option: d.flow });
  for (const [type, options] of Object.entries(d.options)) {
    if (!options.length) continue;
    if (SINGLE.has(type) && options.length === 1) {
      add(type, { option: options[0] });
      continue;
    }
    add(
      type,
      options.map((option) => {
        const severity = d.severity?.[`${type}.${option}`];
        return severity ? { option, extent: { severity } } : { option };
      }),
    );
  }
  if (d.sleepMin !== undefined) add('sleep_duration', { minutes: d.sleepMin });
  if (d.bbt !== undefined) add('bbt', { celsius: d.bbt, excluded: false });
  if (d.weightKg !== undefined) add('weight', { kilograms: d.weightKg });
  if (d.note?.trim()) add('notes', { text: d.note });
  return out;
}

/** Contenu des fichiers JSON de l'export, par nom de fichier. */
export function toClueFiles(days: CycleDay[], marks: CycleMark[], settings: CycleSettings, now = new Date()): Record<string, unknown> {
  const today = now.toISOString().slice(0, 10);
  const reminders: Record<string, unknown>[] = [];
  const reminder = (Type: string, extra: Record<string, unknown> = {}) =>
    reminders.push({ Type, Enabled: true, Title: 'Planning', ...extra, UpdatedTime: now.toISOString() });
  if (settings.checkInTime) reminder('reminder_daily_check_in', { Reminder: { TimeOfDay: settings.checkInTime, Frequency: 'daily' } });
  if (settings.remindPeriodDays > 0) reminder('reminder_period_coming_soon', { DaysBefore: settings.remindPeriodDays });
  if (settings.remindFertile) reminder('reminder_fertile_window_starting_soon');
  if (settings.remindPms) reminder('reminder_pms');

  return {
    'measurements.json': [...days].sort((a, b) => a.date.localeCompare(b.date)).flatMap(measurements),
    'cycle_attributes.json': [...marks]
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map((m) => ({ id: m.id, startDate: m.startDate, excluded: m.excluded, note: m.note ?? null })),
    'profile.json': {
      profileData: {
        cycle_length: settings.cycleLength,
        period_length: settings.periodLength,
        pms_length: settings.pmsDays,
        fertile_phase_enabled: settings.showFertile,
        ovulation_enabled: settings.showOvulation,
        predictions_enabled: true,
        categories: Object.fromEntries(['period', ...settings.categories].map((key, i) => [String(i), { key }])),
      },
      createdAt: today,
      updatedAt: today,
    },
    'tags_tracked.json': settings.customTags,
    'notifications.json': { Notifications: reminders },
    'cycle_settings.json': {},
  };
}

/** Nom du dossier et du zip : `ClueDataDownload-2026-10-19`. */
export const clueExportName = (now = new Date()) => `ClueDataDownload-${now.toISOString().slice(0, 10)}`;

/** Zip non chiffré, avec les fichiers dans un dossier comme l'export Clue. */
export function clueZip(files: Record<string, unknown>, folder: string): Uint8Array {
  const entries = Object.fromEntries(
    Object.entries(files).map(([name, content]) => [`${folder}/${name}`, strToU8(JSON.stringify(content))]),
  );
  return zipSync(entries, { level: 6 });
}
