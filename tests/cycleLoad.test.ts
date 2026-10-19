import { describe, expect, it } from 'vitest';
import { createEntity } from '../src/core/entity';
import type { CycleDay } from '../src/core/types';
import { addDaysISO } from '../src/core/cycle';
import { DEFAULT_CYCLE_SETTINGS } from '../src/core/cycleCatalog';
import { cycleLoad, LOAD_FULL, LOAD_LATE, LOAD_LUTEAL_END, LOAD_LUTEAL_START, LOAD_PERIOD } from '../src/core/cycleLoad';
import { planDayLoad, type AppData } from '../src/state/store';
import { at, settings } from './helpers';

// Données synthétiques : cycles réguliers de 28 jours, règles de 5 jours.
const CREATED = new Date('2026-01-01T00:00:00');
const day = (date: string, fields: Partial<CycleDay> = {}): CycleDay =>
  createEntity<CycleDay>({ date, options: {}, ...fields }, CREATED, date);
const period = (start: string, n = 5) => Array.from({ length: n }, (_, i) => day(addDaysISO(start, i), { flow: 'medium' }));

// Dernières règles le 26 sept. → prochaines prévues le 24 oct., ovulation le 10 oct.
const DAYS = [...period('2026-08-01'), ...period('2026-08-29'), ...period('2026-09-26')];
const cs = DEFAULT_CYCLE_SETTINGS;

describe('cycleLoad — facteurs de charge', () => {
  const load = cycleLoad(DAYS, [], cs, '2026-10-05', '2026-10-31');

  it('pleine charge en phase folliculaire, fenêtre fertile et ovulation', () => {
    for (const d of ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-10']) expect(load[d]).toBe(LOAD_FULL);
  });

  it('phase lutéale : pente décroissante jusqu’à la veille des règles', () => {
    expect(load['2026-10-11']).toBeCloseTo(LOAD_LUTEAL_START);
    expect(load['2026-10-23']).toBeCloseTo(LOAD_LUTEAL_END);
    const luteal = Array.from({ length: 13 }, (_, i) => load[addDaysISO('2026-10-11', i)]);
    for (let i = 1; i < luteal.length; i++) expect(luteal[i]).toBeLessThan(luteal[i - 1]);
    // Linéaire : pas constant.
    expect(luteal[1] - luteal[0]).toBeCloseTo(luteal[12] - luteal[11]);
  });

  it('règles prévues allégées, puis retour à la pleine charge', () => {
    for (const d of ['2026-10-24', '2026-10-26', '2026-10-28']) expect(load[d]).toBe(LOAD_PERIOD);
    expect(load['2026-10-29']).toBe(LOAD_FULL);
    expect(load['2026-10-31']).toBe(LOAD_FULL);
  });

  it('règles en cours (notées) allégées', () => {
    const now = cycleLoad(DAYS, [], cs, '2026-09-28', '2026-10-02');
    expect(now).toEqual({
      '2026-09-28': LOAD_PERIOD,
      '2026-09-29': LOAD_PERIOD,
      '2026-09-30': LOAD_PERIOD,
      '2026-10-01': LOAD_FULL,
      '2026-10-02': LOAD_FULL,
    });
  });

  it('règles en retard : comme la fin de la phase lutéale', () => {
    const late = cycleLoad(DAYS, [], cs, '2026-10-26', '2026-10-31');
    expect(late['2026-10-26']).toBe(LOAD_LATE);
    expect(late['2026-10-27']).toBe(LOAD_PERIOD);
  });

  it('rien sans données de cycle ni quand le suivi est interrompu', () => {
    expect(cycleLoad([], [], cs, '2026-10-05', '2026-10-31')).toEqual({});
    expect(cycleLoad(period('2026-01-01'), [], cs, '2026-10-05', '2026-10-31')).toEqual({});
  });
});

describe('planDayLoad — branchement dans le plan', () => {
  const data = (overrides: Partial<AppData>): AppData => ({
    projects: [],
    windows: [],
    tasks: [],
    events: [],
    goals: [],
    timeEntries: [],
    cycleDays: DAYS,
    cycleMarks: [],
    settings: settings(),
    ...overrides,
  });
  const now = at('2026-10-19 08:00');

  it('couvre l’horizon quand le réglage est actif (par défaut)', () => {
    const load = planDayLoad(data({}), now)!;
    expect(load['2026-10-19']).toBeLessThan(LOAD_LUTEAL_START);
    expect(load['2026-10-24']).toBe(LOAD_PERIOD);
    expect(Object.keys(load).length).toBeGreaterThanOrEqual(14);
  });

  it('absent quand le réglage est coupé ou sans données', () => {
    expect(planDayLoad(data({ settings: settings({ cycle: { adaptLoad: false } }) }), now)).toBeUndefined();
    expect(planDayLoad(data({ cycleDays: [] }), now)).toBeUndefined();
  });
});
