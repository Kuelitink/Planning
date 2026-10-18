/** Objectifs du jour, de la semaine ou du mois. */

import type { Goal, GoalPeriod, ISODate, Task } from './types';
import { addDays, parseISODate, startOfDay, startOfMonth, startOfWeek, toISODate } from './time';

/** Début de la période contenant `date` : le jour, le 1er jour de la semaine, le 1er du mois. */
export function periodStartFor(period: GoalPeriod, date: Date, weekStartsOn: 0 | 1 = 1): ISODate {
  if (period === 'day') return toISODate(startOfDay(date));
  if (period === 'week') return toISODate(startOfWeek(date, weekStartsOn));
  return toISODate(startOfMonth(date));
}

/** Fin (exclue) de la période qui commence à `periodStart`. */
export function periodEnd(period: GoalPeriod, periodStart: ISODate): Date {
  const start = parseISODate(periodStart);
  if (period === 'day') return addDays(start, 1);
  if (period === 'week') return addDays(start, 7);
  return new Date(start.getFullYear(), start.getMonth() + 1, 1);
}

/** Objectifs de la période en cours. */
export function currentGoals(goals: Goal[], period: GoalPeriod, now: Date, weekStartsOn: 0 | 1 = 1): Goal[] {
  const start = periodStartFor(period, now, weekStartsOn);
  return goals.filter((g) => g.period === period && g.periodStart === start);
}

/** Tâches liées existantes, dans l'ordre de l'objectif. */
export function goalTasks(goal: Goal, tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return goal.taskIds.map((id) => byId.get(id)).filter((t): t is Task => Boolean(t));
}

export interface GoalProgress {
  done: number;
  total: number;
  /** Entre 0 et 1. */
  ratio: number;
  complete: boolean;
}

/**
 * Progression : objectif chiffré → `progress` saisi (sinon nombre de tâches liées faites)
 * sur `target` ; sinon tâches liées faites sur tâches liées.
 */
export function goalProgress(goal: Goal, tasks: Task[]): GoalProgress {
  const linked = goalTasks(goal, tasks);
  const doneCount = linked.filter((t) => t.status === 'done').length;
  const hasTarget = goal.target !== undefined && goal.target > 0;
  const done = hasTarget ? Math.min(goal.progress ?? doneCount, goal.target!) : doneCount;
  const total = hasTarget ? goal.target! : linked.length;
  const ratio = goal.done ? 1 : total > 0 ? done / total : 0;
  return { done, total, ratio, complete: goal.done || (total > 0 && done >= total) };
}
