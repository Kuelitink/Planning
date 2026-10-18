import { describe, expect, it } from 'vitest';
import { createEntity } from '../src/core/entity';
import type { TimeEntry } from '../src/core/types';
import { schedule } from '../src/core/scheduler';
import { tasksForScheduling, type AppData } from '../src/state/store';
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
