import { describe, expect, it } from 'vitest';
import { createEntity } from '../src/core/entity';
import type { CycleDay, CycleMark, Flow } from '../src/core/types';
import { addDaysISO, forecast } from '../src/core/cycle';
import { DEFAULT_CYCLE_SETTINGS } from '../src/core/cycleCatalog';
import {
  bbtShift,
  byPhase,
  cycleSeries,
  dayContexts,
  flowProfile,
  measureByPhase,
  phaseHighlights,
  phaseIn,
  phaseLifts,
  timing,
} from '../src/core/insights';

const CREATED = new Date('2026-01-01T00:00:00');
const settings = DEFAULT_CYCLE_SETTINGS;

/** Jours notés, fusionnés par date. */
function book(...lists: Partial<CycleDay>[][]): CycleDay[] {
  const byDate = new Map<string, CycleDay>();
  for (const d of lists.flat()) {
    const cur = byDate.get(d.date!) ?? createEntity<CycleDay>({ date: d.date!, options: {} }, CREATED, d.date!);
    byDate.set(d.date!, { ...cur, ...d, options: { ...cur.options, ...d.options } });
  }
  return [...byDate.values()];
}

const period = (start: string, flows: Flow[]): Partial<CycleDay>[] => flows.map((flow, i) => ({ date: addDaysISO(start, i), flow }));
const on = (date: string, options: Record<string, string[]>, extra: Partial<CycleDay> = {}): Partial<CycleDay>[] => [
  { date, options, ...extra },
];

// Trois cycles de 28 jours, règles de 4 jours plus abondantes le J2.
const STARTS = ['2026-06-03', '2026-07-01', '2026-07-29', '2026-08-26'];
const periods = STARTS.flatMap((s) => period(s, ['medium', 'heavy', 'medium', 'light']));

describe('phases des jours passés', () => {
  const c = { start: '2026-07-01', periodDays: 4 };
  it('découpe un cycle de 28 jours en règles, folliculaire, fertile, lutéale et SPM', () => {
    const next = '2026-07-29';
    expect(phaseIn('2026-07-04', c, next, 3)).toBe('period');
    expect(phaseIn('2026-07-05', c, next, 3)).toBe('follicular');
    expect(phaseIn('2026-07-10', c, next, 3)).toBe('fertile');
    expect(phaseIn('2026-07-15', c, next, 3)).toBe('fertile'); // ovulation estimée : J15
    expect(phaseIn('2026-07-16', c, next, 3)).toBe('luteal');
    expect(phaseIn('2026-07-26', c, next, 3)).toBe('pms');
  });

  it('ignore les cycles exclus et place les jours du cycle en cours', () => {
    const days = book(periods, on('2026-07-10', { feelings: ['happy'] }), on('2026-08-30', { feelings: ['sad'] }));
    const marks = [createEntity<CycleMark>({ startDate: '2026-07-01', excluded: true }, CREATED, '2026-07-01')];
    const fc = forecast(days, marks, settings, '2026-09-01');
    const ctx = dayContexts(days, fc, 3);
    expect(ctx.has('2026-07-10')).toBe(false);
    expect(ctx.get('2026-08-30')).toMatchObject({ cycle: 3, cycleDay: 5, phase: 'follicular' });
  });
});

describe('abondance des règles', () => {
  it('donne le profil par jour, le jour le plus abondant et les dernières règles', () => {
    const fc = forecast(book(periods), [], settings, '2026-09-01');
    const p = flowProfile(book(periods), fc.cycles);
    expect(p.periods).toBe(4);
    expect(p.byDay[1]).toEqual({ light: 0, medium: 0, heavy: 4, very_heavy: 0 });
    expect(p.meanByDay.slice(0, 5)).toEqual([2, 3, 2, 1, null]);
    expect(p.heaviestDay).toBe(2);
    expect(p.heavyShare).toBe(1);
    expect(p.recent[0]).toEqual({ start: '2026-08-26', flows: ['medium', 'heavy', 'medium', 'light'] });
  });
});

describe('moment des symptômes', () => {
  // Crampes la veille et le J1 de chaque règles, d'intensité variable.
  const cramps = STARTS.slice(1).flatMap((s, i) => [
    ...on(addDaysISO(s, -1), { pain: ['period_cramps'] }),
    ...on(s, { pain: ['period_cramps'] }, { severity: { 'pain.period_cramps': i === 0 ? 'severe' : 'moderate' } }),
  ]);
  const days = book(periods, cramps, on('2026-07-12', { pain: ['headache'] }));
  const fc = forecast(days, [], settings, '2026-09-10');

  it('situe les crampes autour des règles et prévoit les prochaines', () => {
    const t = timing(days, fc, 'pain', 'period_cramps');
    expect(t.cycles).toBe(3);
    expect(t.tracked).toBe(4);
    expect(t.window).toEqual([-1, 1]);
    expect(t.severity).toEqual({ severe: 1, moderate: 2 });
    expect(fc.nextPeriod).toBe('2026-09-23');
    expect(t.next).toEqual(['2026-09-22', '2026-09-23']);
  });

  it('ne prévoit rien avec moins de 3 cycles concernés', () => {
    const t = timing(days, fc, 'pain', 'headache');
    expect(t).toMatchObject({ cycles: 1, window: [12, 12], next: undefined });
  });
});

describe('humeur et mesures par phase', () => {
  const days = book(
    periods,
    STARTS.slice(1).flatMap((s) => [
      ...on(addDaysISO(s, -2), { feelings: ['sensitive'] }),
      ...on(addDaysISO(s, -10), { feelings: ['happy'] }),
      ...on(addDaysISO(s, 1), { feelings: ['sad', 'sensitive'] }, { sleepMin: 420 }),
    ]),
    on('2026-07-08', { feelings: ['happy'] }, { sleepMin: 480 }),
  );
  const fc = forecast(days, [], settings, '2026-09-10');
  const ctx = dayContexts(days, fc, 3);

  it('répartit les émotions par phase et repère celles propres à une phase', () => {
    const shares = byPhase(days, ctx, 'feelings');
    expect(shares.find((s) => s.phase === 'pms')).toMatchObject({ days: 3, options: [{ option: 'sensitive', count: 3, share: 1 }] });
    expect(shares.find((s) => s.phase === 'period')!.options.map((o) => o.option)).toEqual(['sad', 'sensitive']);
    const lifts = phaseLifts(shares);
    // Tristesse : 100 % des jours de règles notés contre 30 % sur tout le cycle (×3,3).
    expect(lifts.slice(0, 2).map((l) => [l.option, l.phase])).toEqual([
      ['sad', 'period'],
      ['happy', 'luteal'],
    ]);
    expect(lifts[0].lift).toBeCloseTo(10 / 3);
  });

  it('moyenne le sommeil par phase', () => {
    const sleep = measureByPhase(days, ctx, (d) => d.sleepMin);
    expect(sleep.find((s) => s.phase === 'period')).toEqual({ phase: 'period', mean: 420, count: 3 });
    expect(sleep.find((s) => s.phase === 'follicular')).toEqual({ phase: 'follicular', mean: 480, count: 1 });
  });

  it('résume ce qui revient pendant une phase', () => {
    expect(phaseHighlights(days, ctx, 'period')).toEqual([
      { category: 'feelings', option: 'sad', cycles: 3, of: 3 },
      { category: 'feelings', option: 'sensitive', cycles: 3, of: 3 },
    ]);
  });
});

describe('température basale', () => {
  it('trouve le décalage thermique (3 au-dessus de 6)', () => {
    const temps = [36.4, 36.5, 36.4, 36.45, 36.5, 36.4, 36.45, 36.5, 36.4, 36.5, 36.8, 36.85, 36.9, 36.8];
    const days = book(
      period('2026-07-01', ['medium']),
      temps.map((t, i) => ({ date: addDaysISO('2026-07-04', i), bbt: t, options: {} })),
    );
    const fc = forecast(days, [], settings, '2026-07-20');
    const points = cycleSeries(days, fc.cycles[0], '2026-07-20', (d) => d.bbt);
    expect(points).toHaveLength(14);
    expect(bbtShift(points)).toEqual({ ovulationDay: 13, coverline: 36.5 });
    expect(bbtShift(points.slice(0, 11))).toBeUndefined();
  });
});
