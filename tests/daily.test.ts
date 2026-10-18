import { describe, expect, it } from 'vitest';
import { schedule } from '../src/core/scheduler';
import { dayPlan } from '../src/core/daily';
import { formatHM } from '../src/core/time';
import { at, event, hours, settings, task } from './helpers';

describe('dayPlan', () => {
  const tasks = [
    task('Contrat', { status: 'done', doneAt: at('2026-10-19 08:55').toISOString() }),
    task('Rapport', { durationMin: 90, priority: 1 }),
    task('Mails', { durationMin: 30, priority: 2 }),
    task('Maquette', { durationMin: 120, splittable: true, minChunkMin: 30, priority: 3 }),
    task('Hier', { status: 'done', doneAt: at('2026-10-18 18:00').toISOString() }),
  ];
  const events = [
    event('Réunion', '2026-10-19 09:00', '2026-10-19 09:30'),
    event('Déjeuner', '2026-10-19 12:00', '2026-10-19 13:00'),
    event('Férié ?', '2026-10-19 00:00', '2026-10-20 00:00', { allDay: true }),
    event('Demain', '2026-10-20 09:00', '2026-10-20 10:00'),
  ];
  const now = at('2026-10-19 09:30');
  const result = schedule({ tasks, events, windows: [], settings: settings(), now });
  const plan = dayPlan(result, tasks, events, now);

  it('ordonne la journée (journée entière en tête, puis par heure)', () => {
    expect(plan.date).toBe('2026-10-19');
    expect(plan.items.map((i) => `${formatHM(i.start)} ${i.title}`)).toEqual([
      '00:00 Férié ?',
      '09:00 Réunion',
      '09:30 Rapport',
      '11:00 Mails',
      '11:30 Maquette',
      '12:00 Déjeuner',
      '13:00 Maquette',
    ]);
  });

  it('numérote les morceaux d’une tâche découpée', () => {
    const parts = plan.items.filter((i) => i.kind === 'task' && i.taskId === 'Maquette');
    expect(parts.map((p) => (p.kind === 'task' ? p.part : undefined))).toEqual([
      { index: 1, count: 2 },
      { index: 2, count: 2 },
    ]);
  });

  it('liste les tâches faites ce jour-là', () => {
    expect(plan.done.map((t) => t.id)).toEqual(['Contrat']);
  });

  it('calcule les totaux dans les horaires', () => {
    // Tâches : 90 + 30 + 120 = 240 ; événements : 30 + 60 = 90 ; horaires 08:00–20:00 = 720.
    expect(plan.totals).toEqual({ taskMin: 240, eventMin: 90, capacityMin: 720, freeMin: 390 });
  });

  it('utilise les horaires par défaut des réglages', () => {
    const s = settings({ defaultWindowId: 'bureau' });
    const windows = [hours('bureau', '09:00', '18:00', [1, 2, 3, 4, 5])];
    const r = schedule({ tasks: [task('A', { durationMin: 60 })], events: [], windows, settings: s, now: at('2026-10-19 08:00') });
    const monday = dayPlan(r, [task('A', { durationMin: 60 })], [], at('2026-10-19 12:00'), { windows, settings: s });
    expect(monday.totals).toEqual({ taskMin: 60, eventMin: 0, capacityMin: 540, freeMin: 480 });
    const sunday = dayPlan(r, [], [], at('2026-10-25 12:00'), { windows, settings: s });
    expect(sunday.totals.capacityMin).toBe(0);
  });
});
