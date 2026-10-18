import { describe, expect, it } from 'vitest';
import { createEntity } from '../src/core/entity';
import type { Goal } from '../src/core/types';
import type { ScheduleResult } from '../src/core/scheduler';
import { byUrgency, goalDeadlines, matchesQuery, pickedTaskIds } from '../src/state/urgency';
import { at, task } from './helpers';

const NOW = at('2026-10-19 10:00');
const EMPTY: ScheduleResult = { blocks: [], unscheduled: [], atRisk: [] };

const goal = (id: string, fields: Partial<Goal> & Pick<Goal, 'period' | 'periodStart' | 'taskIds'>, created = '2026-10-01T00:00:00') =>
  createEntity<Goal>({ title: 'Objectifs', done: false, ...fields }, new Date(created), id);

const titles = (list: { title: string }[]) => list.map((t) => t.title);

describe('tri par urgence', () => {
  it('en retard, puis échéance la plus proche, puis sans échéance', () => {
    const tasks = [
      task('Sans échéance', { priority: 1 }),
      task('Vendredi', { deadline: '2026-10-23' }),
      task('Hier', { priority: 4, deadline: '2026-10-18' }),
      task('Demain', { deadline: '2026-10-20' }),
    ];
    expect(titles(byUrgency(tasks, EMPTY, NOW))).toEqual(['Hier', 'Demain', 'Vendredi', 'Sans échéance']);
  });

  it('une tâche que le plan ne tient pas avant son échéance passe devant', () => {
    const tasks = [task('Demain', { deadline: '2026-10-20' }), task('Vendredi', { deadline: '2026-10-23' })];
    const plan: ScheduleResult = {
      ...EMPTY,
      atRisk: [{ taskId: 'Vendredi', reason: 'deadline', deadline: at('2026-10-24 00:00'), end: at('2026-10-26 10:00') }],
    };
    expect(titles(byUrgency(tasks, plan, NOW))).toEqual(['Vendredi', 'Demain']);
  });

  it('à échéance égale : priorité, puis créneau planifié, puis titre', () => {
    const tasks = [task('B planifiée tard'), task('Basse', { priority: 4 }), task('A non planifiée'), task('C planifiée tôt'), task('Urgente', { priority: 1 })];
    const plan: ScheduleResult = {
      ...EMPTY,
      blocks: [
        { taskId: 'B planifiée tard', start: at('2026-10-19 15:00'), end: at('2026-10-19 15:30') },
        { taskId: 'C planifiée tôt', start: at('2026-10-19 11:00'), end: at('2026-10-19 11:30') },
      ],
    };
    expect(titles(byUrgency(tasks, plan, NOW))).toEqual(['Urgente', 'C planifiée tôt', 'B planifiée tard', 'A non planifiée', 'Basse']);
  });

  it('ignore les tâches faites', () => {
    expect(byUrgency([task('Faite', { status: 'done' }), task('À faire')], EMPTY, NOW).map((t) => t.id)).toEqual(['À faire']);
  });
});

describe('recherche', () => {
  it('sans tenir compte de la casse ni des accents', () => {
    expect(matchesQuery("Réunion d'équipe", 'reunion')).toBe(true);
    expect(matchesQuery('Course à pied', 'COURSE A')).toBe(true);
    expect(matchesQuery('Courses', 'rapport')).toBe(false);
    expect(matchesQuery('Peu importe', '   ')).toBe(true);
  });
});

describe('tâches choisies comme objectifs', () => {
  const goals = [
    goal('jour-2', { period: 'day', periodStart: '2026-10-19', taskIds: ['C', 'A'] }, '2026-10-02T00:00:00'),
    goal('jour-1', { period: 'day', periodStart: '2026-10-19', taskIds: ['A', 'B'] }, '2026-10-01T00:00:00'),
    goal('hier', { period: 'day', periodStart: '2026-10-18', taskIds: ['X'] }),
    goal('semaine', { period: 'week', periodStart: '2026-10-19', taskIds: ['A', 'D'] }),
  ];

  it("union ordonnée et sans doublon des objectifs de la période", () => {
    expect(pickedTaskIds(goals, 'day', '2026-10-19')).toEqual(['A', 'B', 'C']);
    expect(pickedTaskIds(goals, 'week', '2026-10-19')).toEqual(['A', 'D']);
    expect(pickedTaskIds(goals, 'month', '2026-10-01')).toEqual([]);
  });

  it('échéance imposée : fin de la période la plus courte', () => {
    const ends = goalDeadlines(goals, NOW, 1);
    expect(ends.get('A')).toBe(at('2026-10-20 00:00').getTime());
    expect(ends.get('D')).toBe(at('2026-10-26 00:00').getTime());
    expect(ends.has('X')).toBe(false);
  });
});
