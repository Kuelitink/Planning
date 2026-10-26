import { describe, expect, it } from 'vitest';
import { advanceRecurring, describeRecurrence, isOccurrence, nextOccurrence, occurrenceAfterDone, revertRecurring } from '../src/core/recurrence';
import { at, task } from './helpers';
import type { TaskRecurrence } from '../src/core/types';

const rec = (r: Partial<TaskRecurrence>): TaskRecurrence => ({ freq: 'daily', interval: 1, start: '2026-10-19', ...r });

describe('récurrence des tâches', () => {
  it('tous les 2 jours', () => {
    const r = rec({ interval: 2 });
    expect(nextOccurrence(r, '2026-10-19')).toBe('2026-10-21');
    expect(isOccurrence(r, '2026-10-20')).toBe(false);
    expect(nextOccurrence(r, '2026-10-01')).toBe('2026-10-19');
  });

  it('une semaine sur deux, lundi et jeudi', () => {
    const r = rec({ freq: 'weekly', interval: 2, weekdays: [1, 4] });
    expect(nextOccurrence(r, '2026-10-19')).toBe('2026-10-22');
    expect(nextOccurrence(r, '2026-10-22')).toBe('2026-11-02');
  });

  it('tous les mois, le 31 devient le dernier jour du mois', () => {
    const r = rec({ freq: 'monthly', start: '2026-10-31' });
    expect(nextOccurrence(r, '2026-10-31')).toBe('2026-11-30');
    expect(nextOccurrence(r, '2026-11-30')).toBe('2026-12-31');
  });

  it("s'arrête après la date de fin", () => {
    const r = rec({ until: '2026-10-20' });
    expect(nextOccurrence(r, '2026-10-19')).toBe('2026-10-20');
    expect(nextOccurrence(r, '2026-10-20')).toBeUndefined();
  });

  it('une occurrence en retard cochée rattrape aujourd’hui', () => {
    const r = rec({});
    expect(occurrenceAfterDone(r, '2026-10-19', '2026-10-22')).toBe('2026-10-22');
    expect(occurrenceAfterDone(r, '2026-10-22', '2026-10-22')).toBe('2026-10-23');
  });

  it('se décrit en clair', () => {
    expect(describeRecurrence(rec({ interval: 3 }))).toBe('Tous les 3 jours');
    expect(describeRecurrence(rec({ freq: 'weekly', weekdays: [0, 1] }))).toBe('Toutes les semaines (lun., dim.)');
  });
});

describe('cocher une tâche récurrente', () => {
  it("passe à l'occurrence suivante, avec son créneau fixé, et revient avec « Annuler »", () => {
    const t = task('Sport', {
      recurrence: rec({ freq: 'weekly', weekdays: [1, 4] }),
      occurrence: '2026-10-19',
      pinned: { start: at('2026-10-19 18:00').toISOString(), end: at('2026-10-19 19:00').toISOString() },
    });
    const step = advanceRecurring(t, '2026-10-19')!;
    expect(step.occurrence).toBe('2026-10-22');
    expect(new Date(step.pinned!.start).getTime()).toBe(at('2026-10-22 18:00').getTime());
    const back = revertRecurring({ ...t, ...step })!;
    expect(back.occurrence).toBe('2026-10-19');
    expect(new Date(back.pinned!.start).getTime()).toBe(at('2026-10-19 18:00').getTime());
  });

  it('la dernière occurrence de la série termine la tâche', () => {
    const t = task('Sport', { recurrence: rec({ until: '2026-10-19' }), occurrence: '2026-10-19' });
    expect(advanceRecurring(t, '2026-10-19')).toBeUndefined();
  });
});
