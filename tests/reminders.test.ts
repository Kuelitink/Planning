import { describe, expect, it } from 'vitest';
import { createEntity } from '../src/core/entity';
import type { CycleDay } from '../src/core/types';
import { addDaysISO, forecast } from '../src/core/cycle';
import { DEFAULT_CYCLE_SETTINGS } from '../src/core/cycleCatalog';
import { cycleReminders } from '../src/core/reminders';

const period = (start: string): CycleDay[] =>
  Array.from({ length: 5 }, (_, i) =>
    createEntity<CycleDay>({ date: addDaysISO(start, i), flow: 'medium', options: {} }, new Date('2026-01-01T00:00:00'), addDaysISO(start, i)),
  );
const days = [...period('2026-08-26'), ...period('2026-09-23')];
const settings = { ...DEFAULT_CYCLE_SETTINGS, remindPms: true, remindFertile: true, checkInTime: '20:00' };
const keys = (today: string, time = '12:00', logged = true) =>
  cycleReminders(forecast(days, [], settings, today), settings, today, time, logged, (d) => d).map((r) => r.key);

describe('rappels du cycle', () => {
  it('annonce les règles proches, puis prévues le jour même, puis le retard', () => {
    expect(keys('2026-10-18')).toEqual(['pms']);
    expect(keys('2026-10-19')).toEqual(['period-soon', 'pms']);
    expect(keys('2026-10-21')).toEqual(['period-today']);
    expect(keys('2026-10-23')).toEqual(['late']);
  });

  it('signale la fenêtre fertile la veille et pendant', () => {
    expect(keys('2026-10-01')).toEqual(['fertile-soon']);
    expect(keys('2026-10-04')).toEqual(['fertile']);
  });

  it('rappelle de noter la journée après l’heure choisie si rien n’est noté', () => {
    expect(keys('2026-10-12', '19:59', false)).toEqual([]);
    expect(keys('2026-10-12', '20:00', false)).toEqual(['checkin']);
    expect(keys('2026-10-12', '21:00', true)).toEqual([]);
  });

  it('se tait pendant les règles', () => {
    expect(keys('2026-09-24')).toEqual([]);
  });
});
