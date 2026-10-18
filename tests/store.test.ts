import { describe, expect, it } from 'vitest';
import { createEntity } from '../src/core/entity';
import type { Goal, TimeEntry } from '../src/core/types';
import { schedule } from '../src/core/scheduler';
import { computePlan, tasksForScheduling, type AppData } from '../src/state/store';
import { at, blocksOf, settings, task } from './helpers';

const entry = (id: string, taskId: string, start: string, end?: string): TimeEntry =>
  createEntity<TimeEntry>(
    { taskId, start: at(start).toISOString(), end: end ? at(end).toISOString() : undefined },
    new Date('2026-10-01T00:00:00'),
    id,
  );

const data = (overrides: Partial<AppData>): AppData => ({
  projects: [],
  windows: [],
  tasks: [],
  events: [],
  goals: [],
  timeEntries: [],
  settings: settings(),
  ...overrides,
});

describe('tâches vues par le planificateur', () => {
  it('déduit le temps déjà chronométré de la durée', () => {
    const d = data({
      tasks: [task('Rapport', { durationMin: 90 })],
      timeEntries: [entry('e1', 'Rapport', '2026-10-19 08:00', '2026-10-19 08:40')],
    });
    const [t] = tasksForScheduling(d, at('2026-10-19 09:00'));
    expect(t.durationMin).toBe(50);
  });

  it('garde au moins un pas de grille quand tout le temps prévu est écoulé', () => {
    const d = data({
      tasks: [task('Rapport', { durationMin: 30 })],
      timeEntries: [entry('e1', 'Rapport', '2026-10-19 08:00', '2026-10-19 09:00')],
    });
    expect(tasksForScheduling(d, at('2026-10-19 09:30'))[0].durationMin).toBe(15);
  });

  it('fixe la tâche chronométrée sur sa session en cours', () => {
    const now = at('2026-10-19 10:12');
    const d = data({
      tasks: [task('Rapport', { durationMin: 90, priority: 4 }), task('Mails', { durationMin: 30, priority: 1 })],
      timeEntries: [entry('e1', 'Rapport', '2026-10-19 09:30')],
    });
    const tasks = tasksForScheduling(d, now);
    const result = schedule({ tasks, events: [], windows: [], settings: d.settings, now });
    expect(blocksOf(result, 'Rapport')).toEqual([['10-19 09:30', '10-19 11:00']]);
    expect(blocksOf(result, 'Mails')).toEqual([['10-19 11:00', '10-19 11:30']]);
  });

  it("prolonge la session au-delà de l'estimation si elle déborde", () => {
    const now = at('2026-10-19 11:20');
    const d = data({
      tasks: [task('Rapport', { durationMin: 60 })],
      timeEntries: [entry('e1', 'Rapport', '2026-10-19 09:30')],
    });
    const pinned = tasksForScheduling(d, now)[0].pinned!;
    expect(new Date(pinned.end).getTime()).toBeGreaterThan(now.getTime());
  });
});

const goal = (id: string, period: Goal['period'], periodStart: string, taskIds: string[]): Goal =>
  createEntity<Goal>({ title: 'Objectifs', period, periodStart, taskIds, done: false }, new Date('2026-10-01T00:00:00'), id);

describe('objectifs et planification', () => {
  it("un objectif du jour P4 passe avant une P2 sans échéance", () => {
    const d = data({
      tasks: [task('Mails', { priority: 2, durationMin: 30 }), task('Photos', { priority: 4, durationMin: 60 })],
      goals: [goal('jour', 'day', '2026-10-19', ['Photos'])],
    });
    const plan = computePlan(d, at('2026-10-19 08:00'));
    expect(blocksOf(plan, 'Photos')).toEqual([['10-19 08:00', '10-19 09:00']]);
    expect(blocksOf(plan, 'Mails')).toEqual([['10-19 09:00', '10-19 09:30']]);
  });

  it("une échéance réelle plus proche que la fin de la période reste respectée", () => {
    const d = data({
      tasks: [
        task('Objectif du jour', { priority: 1, durationMin: 60 }),
        task('Dans 2 h', { priority: 4, durationMin: 30, deadline: at('2026-10-19 10:00').toISOString() }),
      ],
      goals: [goal('jour', 'day', '2026-10-19', ['Objectif du jour']), goal('semaine', 'week', '2026-10-19', ['Dans 2 h'])],
    });
    const plan = computePlan(d, at('2026-10-19 08:00'));
    expect(blocksOf(plan, 'Dans 2 h')).toEqual([['10-19 08:00', '10-19 08:30']]);
    expect(tasksForScheduling(d, at('2026-10-19 08:00')).find((t) => t.id === 'Dans 2 h')!.deadline).toBe(
      at('2026-10-19 10:00').toISOString(),
    );
  });

  it("un objectif qui ne tient pas dans la journée n'est pas « en retard »", () => {
    const d = data({
      tasks: [task('Objectif', { durationMin: 60 }), task('Vraie échéance', { durationMin: 60, deadline: '2026-10-19' })],
      goals: [goal('jour', 'day', '2026-10-19', ['Objectif'])],
    });
    // 21:00 : plus de créneau aujourd'hui (horaires par défaut 08:00–20:00).
    const plan = computePlan(d, at('2026-10-19 21:00'));
    expect(blocksOf(plan, 'Objectif')[0][0]).toBe('10-20 08:00');
    expect(plan.atRisk.map((r) => r.taskId)).toEqual(['Vraie échéance']);
  });
});
