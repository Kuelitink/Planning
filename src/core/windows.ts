import type { ID, ISODate, Project, Settings, Task, TimeWindow, WindowOverride, WindowRule, Weekday } from './types';
import { normalize, clip, type Interval } from './intervals';
import { addDays, atMinutes, parseHM, startOfDay, toISODate } from './time';

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/** Horaires utilisés quand aucun n'est défini : `dayStart`–`dayEnd` tous les jours. */
export function fallbackRules(settings: Settings): WindowRule[] {
  return ALL_DAYS.map((weekday) => ({ weekday, start: settings.dayStart, end: settings.dayEnd }));
}

/**
 * Horaires d'une tâche : les siens, sinon ceux de sa liste, sinon ceux des réglages.
 * `window` est null quand on retombe sur `dayStart`–`dayEnd` (pas de période spéciale).
 */
export function rulesForTask(
  task: Task,
  windows: TimeWindow[],
  projects: Project[],
  settings: Settings,
): { windowId: ID | null; rules: WindowRule[]; window: TimeWindow | null } {
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : undefined;
  for (const id of [task.windowId, project?.defaultWindowId, settings.defaultWindowId]) {
    if (!id) continue;
    const w = windows.find((x) => x.id === id);
    if (w) return { windowId: w.id, rules: w.rules, window: w };
  }
  return { windowId: null, rules: fallbackRules(settings), window: null };
}

/** Fenêtre des horaires par défaut (réglages), s'il y en a une. */
export function defaultWindow(windows: TimeWindow[], settings: Settings): TimeWindow | null {
  return (settings.defaultWindowId && windows.find((x) => x.id === settings.defaultWindowId)) || null;
}

/** Règles des horaires par défaut (réglages), avec repli sur `dayStart`–`dayEnd`. */
export function defaultRules(windows: TimeWindow[], settings: Settings): WindowRule[] {
  return defaultWindow(windows, settings)?.rules ?? fallbackRules(settings);
}

/** Période spéciale qui couvre `day` ; si plusieurs se chevauchent, la dernière du tableau gagne. */
export function overrideFor(window: TimeWindow, day: Date): WindowOverride | undefined {
  const iso = toISODate(day);
  let found: WindowOverride | undefined;
  for (const o of window.overrides ?? []) if (o.from <= iso && iso <= o.to) found = o;
  return found;
}

/**
 * Plages concrètes d'une fenêtre entre `from` et `to` (ms), périodes spéciales comprises.
 * Chaque jour prend les règles de sa période spéciale s'il y en a une, sinon les règles
 * habituelles (`fallback` quand il n'y a pas de fenêtre). Une plage appartient à son jour
 * de début : une plage de nuit d'un jour normal reste valable même si le lendemain est
 * dans une période spéciale.
 */
export function windowAvailability(window: TimeWindow | null, fallback: WindowRule[], from: number, to: number): Interval[] {
  const out: Interval[] = [];
  // On part de la veille pour attraper les plages qui débordent sur le jour suivant.
  for (let day = addDays(startOfDay(new Date(from)), -1); day.getTime() < to; day = addDays(day, 1)) {
    const rules = window ? (overrideFor(window, day)?.rules ?? window.rules) : fallback;
    const weekday = day.getDay();
    for (const rule of rules) {
      if (rule.weekday !== weekday) continue;
      const s = parseHM(rule.start);
      let e = parseHM(rule.end);
      if (e <= s) e += 24 * 60;
      out.push({ start: atMinutes(day, s).getTime(), end: atMinutes(day, e).getTime() });
    }
  }
  return clip(normalize(out), from, to);
}

/** Plages concrètes de règles simples entre `from` et `to` (ms), sans période spéciale. */
export function windowIntervals(rules: WindowRule[], from: number, to: number): Interval[] {
  return windowAvailability(null, rules, from, to);
}

/** Une période spéciale vue à travers toutes les fenêtres qu'elle modifie. */
export interface SpecialPeriod {
  periodId: ID;
  name: string;
  from: ISODate;
  to: ISODate;
  /** Fenêtres modifiées et leurs règles pendant la période (vide = fermé). */
  windows: { windowId: ID; rules: WindowRule[] }[];
}

/** Périodes spéciales regroupées par `periodId`, triées par date de début. */
export function listPeriods(windows: TimeWindow[]): SpecialPeriod[] {
  const byId = new Map<ID, SpecialPeriod>();
  for (const w of windows) {
    for (const o of w.overrides ?? []) {
      const p = byId.get(o.periodId) ?? { periodId: o.periodId, name: o.name, from: o.from, to: o.to, windows: [] };
      p.windows.push({ windowId: w.id, rules: o.rules });
      byId.set(o.periodId, p);
    }
  }
  return [...byId.values()].sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name, 'fr'));
}
