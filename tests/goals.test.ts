import { describe, expect, it } from 'vitest';
import { createEntity } from '../src/core/entity';
import { currentGoals, goalProgress, goalTasks, periodEnd, periodStartFor } from '../src/core/goals';
import type { Goal } from '../src/core/types';
import { toISODate } from '../src/core/time';
import { at, task } from './helpers';

const goal = (id: string, fields: Partial<Goal>): Goal =>
  createEntity<Goal>({ title: id, period: 'week', periodStart: '2026-10-19', taskIds: [], done: false, ...fields }, at('2026-10-19 08:00'), id);

describe('objectifs', () => {
  it('calcule le début et la fin des périodes', () => {
    const wed = at('2026-10-21 15:00');
    expect(periodStartFor('day', wed)).toBe('2026-10-21');
    expect(periodStartFor('week', wed)).toBe('2026-10-19');
    expect(periodStartFor('week', wed, 0)).toBe('2026-10-18');
    expect(periodStartFor('month', wed)).toBe('2026-10-01');
    expect(toISODate(periodEnd('week', '2026-10-19'))).toBe('2026-10-26');
    expect(toISODate(periodEnd('month', '2026-12-01'))).toBe('2027-01-01');
  });

  it('filtre les objectifs de la période en cours', () => {
    const goals = [
      goal('Cette semaine', {}),
      goal('Semaine passée', { periodStart: '2026-10-12' }),
      goal('Ce mois', { period: 'month', periodStart: '2026-10-01' }),
    ];
    expect(currentGoals(goals, 'week', at('2026-10-25 20:00')).map((g) => g.id)).toEqual(['Cette semaine']);
    expect(currentGoals(goals, 'month', at('2026-10-25 20:00')).map((g) => g.id)).toEqual(['Ce mois']);
  });

  it('progression par tâches liées (tâches supprimées ignorées)', () => {
    const tasks = [task('Rédiger', { status: 'done' }), task('Envoyer')];
    const g = goal('Rapport', { taskIds: ['Rédiger', 'Envoyer', 'Supprimée'] });
    expect(goalTasks(g, tasks).map((t) => t.id)).toEqual(['Rédiger', 'Envoyer']);
    expect(goalProgress(g, tasks)).toEqual({ done: 1, total: 2, ratio: 0.5, complete: false });
  });

  it('objectif chiffré : saisie manuelle, sinon tâches faites', () => {
    const tasks = [task('Course', { status: 'done' })];
    expect(goalProgress(goal('Courir 3 fois', { target: 3, progress: 2, taskIds: ['Course'] }), tasks)).toMatchObject({ done: 2, total: 3, complete: false });
    expect(goalProgress(goal('Courir 3 fois', { target: 3, taskIds: ['Course'] }), tasks)).toMatchObject({ done: 1, total: 3 });
    expect(goalProgress(goal('Courir 3 fois', { target: 3, progress: 5 }), tasks)).toMatchObject({ done: 3, complete: true });
  });

  it('un objectif coché est complet', () => {
    expect(goalProgress(goal('Fait', { done: true }), [])).toEqual({ done: 0, total: 0, ratio: 1, complete: true });
  });
});
