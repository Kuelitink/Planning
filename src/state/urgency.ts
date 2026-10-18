/**
 * Objectifs et urgence : tâches choisies pour une période, échéances que ces choix
 * imposent au planificateur, tri « les plus urgentes d'abord » et recherche.
 */

import type { Goal, GoalPeriod, ID, ISODate, Task } from '../core/types';
import { parseDeadline, type ScheduleResult } from '../core/scheduler';
import { periodEnd, periodStartFor } from '../core/goals';

const PERIODS: GoalPeriod[] = ['day', 'week', 'month'];

/** Objectifs de la période, dans l'ordre d'ajout. */
export function goalsOf(goals: Goal[], period: GoalPeriod, periodStart: ISODate): Goal[] {
  return goals
    .filter((g) => g.period === period && g.periodStart === periodStart)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Tâches choisies pour la période : union ordonnée, sans doublon, des tâches de ses objectifs. */
export function pickedTaskIds(goals: Goal[], period: GoalPeriod, periodStart: ISODate): ID[] {
  const out: ID[] = [];
  const seen = new Set<ID>();
  for (const g of goalsOf(goals, period, periodStart)) {
    for (const id of g.taskIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Échéance imposée par les objectifs en cours : la fin de la période la plus courte
 * (jour, semaine, mois) pour laquelle la tâche est choisie, en ms.
 */
export function goalDeadlines(goals: Goal[], now: Date, weekStartsOn: 0 | 1 = 1): Map<ID, number> {
  const out = new Map<ID, number>();
  for (const period of PERIODS) {
    const start = periodStartFor(period, now, weekStartsOn);
    const end = periodEnd(period, start).getTime();
    for (const id of pickedTaskIds(goals, period, start)) {
      const cur = out.get(id);
      if (cur === undefined || end < cur) out.set(id, end);
    }
  }
  return out;
}

/** Minuscules sans accents : « Réunion » → « reunion ». */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** `text` contient `query`, sans tenir compte de la casse ni des accents (requête vide : oui). */
export function matchesQuery(text: string, query: string): boolean {
  const q = fold(query.trim());
  return !q || fold(text).includes(q);
}

/** En retard : échéance réelle déjà passée, ou que le plan ne tient pas. */
export function isLate(task: Task, plan: ScheduleResult, now: Date): boolean {
  if (!task.deadline || task.status !== 'todo') return false;
  return parseDeadline(task.deadline).getTime() <= now.getTime() || plan.atRisk.some((r) => r.taskId === task.id);
}

/**
 * Tâches à faire, les plus urgentes d'abord : en retard, puis échéance la plus proche
 * (sans échéance à la fin), puis priorité, puis premier créneau planifié (non
 * planifiées après), puis titre.
 */
export function byUrgency(tasks: Task[], plan: ScheduleResult, now: Date): Task[] {
  const firstStart = new Map<ID, number>();
  for (const b of plan.blocks) {
    const t = b.start.getTime();
    const cur = firstStart.get(b.taskId);
    if (cur === undefined || t < cur) firstStart.set(b.taskId, t);
  }
  const key = (t: Task) => ({
    late: isLate(t, plan, now) ? 0 : 1,
    deadline: t.deadline ? parseDeadline(t.deadline).getTime() : Infinity,
    start: firstStart.get(t.id) ?? Infinity,
  });
  const keys = new Map(tasks.map((t) => [t.id, key(t)]));
  const cmp = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);
  return tasks
    .filter((t) => t.status === 'todo')
    .sort((a, b) => {
      const ka = keys.get(a.id)!;
      const kb = keys.get(b.id)!;
      return (
        ka.late - kb.late ||
        cmp(ka.deadline, kb.deadline) ||
        a.priority - b.priority ||
        cmp(ka.start, kb.start) ||
        a.title.localeCompare(b.title, 'fr')
      );
    });
}
