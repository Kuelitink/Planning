import type { ID, Project, Settings, Task, TimeWindow, WindowRule, Weekday } from './types';
import { normalize, clip, type Interval } from './intervals';
import { addDays, atMinutes, parseHM, startOfDay } from './time';

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/** Horaires utilisés quand aucun n'est défini : `dayStart`–`dayEnd` tous les jours. */
export function fallbackRules(settings: Settings): WindowRule[] {
  return ALL_DAYS.map((weekday) => ({ weekday, start: settings.dayStart, end: settings.dayEnd }));
}

/** Règles d'horaires d'une tâche : la sienne, sinon celle de sa liste, sinon celle des réglages. */
export function rulesForTask(
  task: Task,
  windows: TimeWindow[],
  projects: Project[],
  settings: Settings,
): { windowId: ID | null; rules: WindowRule[] } {
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : undefined;
  for (const id of [task.windowId, project?.defaultWindowId, settings.defaultWindowId]) {
    if (!id) continue;
    const w = windows.find((x) => x.id === id);
    if (w) return { windowId: w.id, rules: w.rules };
  }
  return { windowId: null, rules: fallbackRules(settings) };
}

/** Règles des horaires par défaut (réglages), avec repli sur `dayStart`–`dayEnd`. */
export function defaultRules(windows: TimeWindow[], settings: Settings): WindowRule[] {
  const w = settings.defaultWindowId ? windows.find((x) => x.id === settings.defaultWindowId) : undefined;
  return w ? w.rules : fallbackRules(settings);
}

/** Plages d'horaires concrètes entre `from` et `to` (ms). */
export function windowIntervals(rules: WindowRule[], from: number, to: number): Interval[] {
  const out: Interval[] = [];
  // On part de la veille pour attraper les plages qui débordent sur le jour suivant.
  for (let day = addDays(startOfDay(new Date(from)), -1); day.getTime() < to; day = addDays(day, 1)) {
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
