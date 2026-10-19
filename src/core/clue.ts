/**
 * Import des données de Clue.
 *
 * Formats lus :
 * - l'export actuel « Télécharger mes données » : zip protégé par le mot de passe affiché
 *   par Clue, ou les fichiers .json qu'il contient. `measurements.json` est une liste de
 *   `{ type, id, date: 'YYYY-MM-DD', value }`, où `value` vaut `{ option }`, une liste de
 *   `{ option, extent? }`, ou une mesure (`{ minutes }`, `{ celsius }`, `{ kilograms }`,
 *   `{ text }`). `cycle_attributes.json` donne les cycles exclus et leurs notes,
 *   `profile.json` les durées et réglages, `tags_tracked.json` les étiquettes perso,
 *   `notifications.json` les rappels ;
 * - l'ancienne sauvegarde `.cluedata` (`{ data: [{ day, period, pain: [...] }] }`).
 *
 * Tout ce qui n'est pas reconnu est gardé tel quel (options inconnues) ou compté dans
 * le résumé (`unknown`), jamais perdu en silence.
 */

import type { CycleDay, CycleMark, CycleSettings, Entity, Flow, ISODate } from './types';
import { CATEGORIES } from './cycleCatalog';
import { periodsOf } from './cycle';
import { readZip } from './zip';

export type DayData = Omit<CycleDay, keyof Entity>;
export type MarkData = Omit<CycleMark, keyof Entity>;

export interface ClueImport {
  days: DayData[];
  marks: MarkData[];
  settings: Partial<CycleSettings>;
  summary: {
    measurements: number;
    days: number;
    periods: number;
    from?: ISODate;
    to?: ISODate;
    /** Types de mesures non compris (ignorés). */
    unknown: string[];
    /** Fichiers reconnus. */
    files: string[];
  };
}

const FLOWS: Flow[] = ['light', 'medium', 'heavy', 'very_heavy'];
const DATE = /^\d{4}-\d{2}-\d{2}/;

type Raw = Record<string, unknown>;
const isObj = (x: unknown): x is Raw => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

/** Jours en construction, par date. */
class DayBook {
  readonly days = new Map<ISODate, DayData>();
  readonly unknown = new Set<string>();
  measurements = 0;

  day(date: ISODate): DayData {
    let d = this.days.get(date);
    if (!d) this.days.set(date, (d = { date, options: {} }));
    return d;
  }

  add(date: ISODate, category: string, option: string, severity?: string) {
    const d = this.day(date);
    const list = (d.options[category] ??= []);
    if (!list.includes(option)) list.push(option);
    if (severity) d.severity = { ...d.severity, [`${category}.${option}`]: severity };
  }

  note(date: ISODate, text: string) {
    const d = this.day(date);
    const t = text.trim();
    if (!t) return;
    d.note = d.note && d.note !== t ? `${d.note}\n${t}` : t;
  }
}

/** Une mesure de `measurements.json`. */
function applyMeasurement(book: DayBook, type: string, date: ISODate, value: unknown) {
  book.measurements++;
  if (type === 'period') {
    const option = isObj(value) ? value.option : Array.isArray(value) && isObj(value[0]) ? value[0].option : value;
    if (FLOWS.includes(option as Flow)) book.day(date).flow = option as Flow;
    else if (option === 'spotting') book.add(date, 'spotting', 'spotting');
    else if (option !== 'none') book.unknown.add(`period:${String(option)}`);
    return;
  }
  if (isObj(value) && !('option' in value)) {
    const d = book.day(date);
    if (type === 'sleep_duration' && num(value.minutes) !== undefined) d.sleepMin = Math.round(num(value.minutes)!);
    else if (type === 'bbt' && num(value.celsius) !== undefined) d.bbt = num(value.celsius);
    else if (type === 'weight' && num(value.kilograms ?? value.kilogram ?? value.value) !== undefined) {
      d.weightKg = num(value.kilograms ?? value.kilogram ?? value.value);
    } else if (type === 'notes' && typeof value.text === 'string') book.note(date, value.text);
    else book.unknown.add(type);
    return;
  }
  const items = Array.isArray(value) ? value : [value];
  let any = false;
  for (const item of items) {
    const option = isObj(item) ? item.option : item;
    if (typeof option !== 'string' || !option) continue;
    const extent = isObj(item) && isObj(item.extent) ? item.extent.severity : undefined;
    book.add(date, type, option, typeof extent === 'string' ? extent : undefined);
    any = true;
  }
  if (!any) book.unknown.add(type);
}

// --- Ancienne sauvegarde .cluedata -------------------------------------------------

/** Anciennes catégories → types actuels. */
const OLD_CATEGORY: Record<string, string> = {
  mood: 'feelings',
  sex: 'sex_life',
  social: 'social_life',
  mental: 'mind',
  motivation: 'mind',
  poop: 'stool',
  fluid: 'discharge',
  ailment: 'ailments',
  appointment: 'appointments',
  test: 'tests',
  party: 'partying',
  collectionMethod: 'collection_method',
  emotion: 'feelings',
  sleep: 'sleep_duration',
  tag: 'tags',
  IUD: 'iud',
};

/** Anciennes options → options actuelles (après retrait des suffixes de catégorie). */
const OLD_OPTION: Record<string, string> = {
  cramps: 'period_cramps',
  tender_breasts: 'breast_tenderness',
  ovulation_pain: 'ovulation',
  energized: 'energetic',
  high_energy: 'fully_energized',
  conflict: 'argumentative',
  drinks: 'alcohol',
  great: 'ok',
  nauseated: 'nauseous',
  great_poop: 'normal',
  ovulation_test_pos: 'ovulation_positive',
  ovulation_test_neg: 'ovulation_negative',
  pregnancy_test_pos: 'pregnancy_positive',
  pregnancy_test_neg: 'pregnancy_negative',
  pain: 'painkillers',
  antibiotic: 'antibiotics',
  cold_flu_medication: 'cold_or_flu_meds',
  biking: 'cycling',
  sweet_craving: 'sweet',
  salty_craving: 'salty',
  chocolate_craving: 'chocolate',
  carbs_craving: 'carbs',
  supportive: 'supportive',
  ob_gyn: 'ob_gyn',
  doctor: 'general_check_up',
  menstrual_cup: 'menstrual_cup',
};

const OLD_SUFFIX =
  /_(social|party|ailment|medication|appointment|collection_method|craving|hair|skin|poop|digestion|emotion|sex|mood|test)$/;

/** Sommeil par tranches (ancien format) → durée au milieu de la tranche. */
const OLD_SLEEP: Record<string, number> = { '0_to_3_hours': 120, '3_to_6_hours': 270, '6_to_9_hours': 450, '9_or_more_hours': 570 };

function oldOption(category: string, raw: string): string {
  if (category === 'medication' && raw === 'cold_flu_medication') return 'cold_or_flu_meds';
  if (category === 'pill' || category === 'tags') return raw;
  const key = OLD_OPTION[raw] ?? raw.replace(OLD_SUFFIX, '');
  return OLD_OPTION[key] ?? key;
}

function readBackup(raw: Raw, book: DayBook, marks: Map<ISODate, MarkData>, settings: Partial<CycleSettings>) {
  for (const entry of raw.data as unknown[]) {
    if (!isObj(entry) || typeof entry.day !== 'string' || !DATE.test(entry.day)) continue;
    const date = entry.day.slice(0, 10);
    for (const [key, value] of Object.entries(entry)) {
      if (key === 'day' || value === null || value === undefined || value === false) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      if (key === 'period') {
        applyMeasurement(book, 'period', date, { option: value });
        continue;
      }
      if (key === 'marks_excluded_cycle') {
        marks.set(date, { startDate: date, excluded: true, note: marks.get(date)?.note });
        continue;
      }
      if (key === 'cycle_exclusion_notes') {
        if (typeof value === 'string' && value.trim())
          marks.set(date, { startDate: date, excluded: Boolean(marks.get(date)?.excluded), note: value.trim() });
        continue;
      }
      if (key === 'sleep' && typeof value === 'string') {
        book.measurements++;
        if (OLD_SLEEP[value] !== undefined) book.day(date).sleepMin = OLD_SLEEP[value];
        continue;
      }
      if ((key === 'notes' || key === 'note') && typeof value === 'string') {
        book.measurements++;
        book.note(date, value);
        continue;
      }
      if (key === 'birth_control' || key === 'environment') continue;
      const category = OLD_CATEGORY[key] ?? key;
      const values = Array.isArray(value) ? value : [value];
      for (const v of values) {
        if (typeof v !== 'string') continue;
        book.measurements++;
        if (category === 'feelings' && v === 'pms') book.add(date, 'pms', 'yes');
        else book.add(date, category, oldOption(category, v));
      }
    }
  }
  const s = isObj(raw.settings) ? raw.settings : undefined;
  const defaults = Array.isArray(s?.user_defaults) && isObj(s.user_defaults[0]) ? s.user_defaults[0] : undefined;
  const tags = isObj(defaults?.app_state) ? defaults.app_state.user_created_tags : undefined;
  if (Array.isArray(tags)) settings.customTags = tags.filter((t): t is string => typeof t === 'string');
  const avg =
    isObj(defaults?.defaults) && isObj(defaults.defaults.user_defined_averages) ? defaults.defaults.user_defined_averages : undefined;
  if (avg) applyLengths(settings, avg.cycleLength, avg.periodLength, avg.PMSLength);
}

// --- Fichiers de l'export actuel ----------------------------------------------------

function applyLengths(settings: Partial<CycleSettings>, cycle: unknown, period: unknown, pms: unknown) {
  const c = num(cycle);
  const p = num(period);
  const s = num(pms);
  if (c !== undefined && c >= 15 && c <= 90) settings.cycleLength = Math.round(c);
  if (p !== undefined && p >= 1 && p <= 15) settings.periodLength = Math.round(p);
  if (s !== undefined && s >= 1 && s <= 14) settings.pmsDays = Math.round(s);
}

/** Catégories du profil Clue → catégories de saisie. */
const PROFILE_CATEGORY: Record<string, string> = {
  ...OLD_CATEGORY,
  emotion: 'feelings',
  sleep: 'sleep_duration',
  tag: 'tags',
  motivation: 'mind',
  appointment: 'appointments',
  fluid: 'discharge',
};

function readProfile(raw: Raw, settings: Partial<CycleSettings>, profileCategories: Set<string>) {
  const p = isObj(raw.profileData) ? raw.profileData : raw;
  applyLengths(settings, p.cycle_length, p.period_length, p.pms_length);
  if (typeof p.fertile_phase_enabled === 'boolean') settings.showFertile = p.fertile_phase_enabled;
  if (typeof p.ovulation_enabled === 'boolean') settings.showOvulation = p.ovulation_enabled;
  const cats = isObj(p.categories) ? Object.values(p.categories) : Array.isArray(p.categories) ? p.categories : [];
  for (const c of cats) {
    const key = isObj(c) ? c.key : c;
    if (typeof key === 'string' && key !== 'period') profileCategories.add(PROFILE_CATEGORY[key] ?? key);
  }
}

function readNotifications(raw: Raw, settings: Partial<CycleSettings>) {
  const list = Array.isArray(raw.Notifications) ? raw.Notifications : [];
  for (const n of list) {
    if (!isObj(n) || n.Enabled !== true) continue;
    const time = isObj(n.Reminder) && typeof n.Reminder.TimeOfDay === 'string' ? n.Reminder.TimeOfDay : undefined;
    switch (n.Type) {
      case 'reminder_daily_check_in':
      case 'reminder_tracking':
        if (time && /^\d{2}:\d{2}$/.test(time)) settings.checkInTime = time;
        break;
      case 'reminder_period_coming_soon':
        // `DaysBefore` : ajouté par l'export de Planning (Clue ne le donne pas, 2 jours par défaut).
        settings.remindPeriodDays = num(n.DaysBefore) ?? 2;
        break;
      case 'reminder_pms':
        settings.remindPms = true;
        break;
      case 'reminder_fertile_window_starting_soon':
        settings.remindFertile = true;
        break;
      case 'reminder_cycle_phase':
        settings.remindFertile = true;
        settings.remindPms = true;
        break;
    }
  }
}

const baseName = (path: string) => path.split(/[\\/]/).pop()!.toLowerCase();

/**
 * Lit des fichiers Clue (contenu JSON par nom de fichier). Le format de chaque fichier est
 * reconnu à son contenu, le nom ne sert que d'indice.
 */
export function parseClueFiles(files: Map<string, string>): ClueImport {
  const book = new DayBook();
  const marks = new Map<ISODate, MarkData>();
  const settings: Partial<CycleSettings> = {};
  const profileCategories = new Set<string>();
  const tags = new Set<string>();
  const recognized: string[] = [];

  for (const [path, text] of files) {
    const name = baseName(path);
    let raw: unknown;
    try {
      raw = JSON.parse(text.replace(/^﻿/, ''));
    } catch {
      continue;
    }
    if (Array.isArray(raw) && raw.some((m) => isObj(m) && typeof m.type === 'string' && typeof m.date === 'string')) {
      for (const m of raw) {
        if (isObj(m) && typeof m.type === 'string' && typeof m.date === 'string' && DATE.test(m.date)) {
          applyMeasurement(book, m.type, m.date.slice(0, 10), m.value);
        }
      }
    } else if (Array.isArray(raw) && raw.some((a) => isObj(a) && typeof a.startDate === 'string')) {
      for (const a of raw) {
        if (!isObj(a) || typeof a.startDate !== 'string' || !DATE.test(a.startDate)) continue;
        const note = typeof a.note === 'string' && a.note.trim() ? a.note.trim() : undefined;
        if (a.excluded === true || note)
          marks.set(a.startDate.slice(0, 10), { startDate: a.startDate.slice(0, 10), excluded: a.excluded === true, note });
      }
    } else if (Array.isArray(raw) && name.startsWith('tags') && raw.every((t) => typeof t === 'string')) {
      raw.forEach((t: string) => tags.add(t));
    } else if (isObj(raw) && Array.isArray(raw.data) && raw.data.some((d) => isObj(d) && typeof d.day === 'string')) {
      readBackup(raw, book, marks, settings);
    } else if (isObj(raw) && (isObj(raw.profileData) || name.startsWith('profile'))) {
      readProfile(raw, settings, profileCategories);
    } else if (isObj(raw) && Array.isArray(raw.Notifications)) {
      readNotifications(raw, settings);
    } else continue;
    recognized.push(name);
  }

  const days = [...book.days.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const d of days) d.options.tags?.forEach((t) => tags.add(t));
  if (tags.size) settings.customTags = [...new Set([...(settings.customTags ?? []), ...tags])];

  // Catégories de saisie : celles du profil Clue et celles qui ont des données.
  const used = new Set<string>(profileCategories);
  for (const d of days) {
    Object.keys(d.options).forEach((k) => used.add(k));
    if (d.sleepMin !== undefined) used.add('sleep_duration');
    if (d.bbt !== undefined) used.add('bbt');
    if (d.weightKg !== undefined) used.add('weight');
    if (d.note) used.add('notes');
  }
  if (used.size) {
    const known = CATEGORIES.map((c) => c.key).filter((k) => used.has(k));
    settings.categories = [...known, ...[...used].filter((k) => !known.includes(k)).sort()];
  }

  const periods = periodsOf(days as CycleDay[]);
  return {
    days,
    marks: [...marks.values()],
    settings,
    summary: {
      measurements: book.measurements,
      days: days.length,
      periods: periods.length,
      from: days[0]?.date,
      to: days[days.length - 1]?.date,
      unknown: [...book.unknown].sort(),
      files: recognized,
    },
  };
}

/** Fichiers choisis par l'utilisateur : zip (chiffré ou non), .json ou .cluedata. */
export function loadClueFiles(files: { name: string; bytes: Uint8Array }[], password?: string): ClueImport {
  const texts = new Map<string, string>();
  const decoder = new TextDecoder();
  for (const f of files) {
    if (f.bytes[0] === 0x50 && f.bytes[1] === 0x4b) {
      const entries = readZip(f.bytes, password, (n) => /\.(json|cluedata)$/i.test(n) && !baseName(n).startsWith('._'));
      for (const [name, bytes] of entries) texts.set(`${f.name}/${name}`, decoder.decode(bytes));
    } else texts.set(f.name, decoder.decode(f.bytes));
  }
  const result = parseClueFiles(texts);
  if (!result.summary.files.length) throw new Error('Aucune donnée Clue reconnue dans ce fichier.');
  return result;
}

/** Fusionne un jour importé avec le jour déjà noté (rien n'est perdu). */
export function mergeDay(existing: DayData | undefined, incoming: DayData): DayData {
  if (!existing) return incoming;
  const options: Record<string, string[]> = { ...existing.options };
  for (const [k, list] of Object.entries(incoming.options)) options[k] = [...new Set([...(options[k] ?? []), ...list])];
  const note =
    existing.note && incoming.note && !existing.note.includes(incoming.note)
      ? `${existing.note}\n${incoming.note}`
      : (existing.note ?? incoming.note);
  const severity = existing.severity || incoming.severity ? { ...existing.severity, ...incoming.severity } : undefined;
  return {
    ...existing,
    flow: incoming.flow ?? existing.flow,
    options,
    severity,
    sleepMin: incoming.sleepMin ?? existing.sleepMin,
    bbt: incoming.bbt ?? existing.bbt,
    weightKg: incoming.weightKg ?? existing.weightKg,
    note,
  };
}
