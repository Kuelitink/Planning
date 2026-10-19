import { describe, expect, it } from 'vitest';
import { createEntity } from '../src/core/entity';
import type { CycleDay, CycleMark, Flow } from '../src/core/types';
import { addDaysISO, cycleStats, cyclesOf, dayMarks, forecast, patterns, periodsOf, regularity } from '../src/core/cycle';
import { DEFAULT_CYCLE_SETTINGS } from '../src/core/cycleCatalog';

const CREATED = new Date('2026-01-01T00:00:00');

const day = (date: string, fields: Partial<CycleDay> = {}): CycleDay =>
  createEntity<CycleDay>({ date, options: {}, ...fields }, CREATED, date);

/** `n` jours de règles à partir de `start`. */
const period = (start: string, n = 5, flow: Flow = 'medium') => Array.from({ length: n }, (_, i) => day(addDaysISO(start, i), { flow }));

const mark = (startDate: string, excluded: boolean, note?: string): CycleMark =>
  createEntity<CycleMark>({ startDate, excluded, note }, CREATED, startDate);

const settings = DEFAULT_CYCLE_SETTINGS;

describe('règles et cycles', () => {
  it('regroupe les jours de règles séparés de 2 jours au plus', () => {
    const days = [day('2026-01-01', { flow: 'heavy' }), day('2026-01-02', { flow: 'medium' }), day('2026-01-05', { flow: 'light' })];
    expect(periodsOf(days)).toEqual([{ start: '2026-01-01', end: '2026-01-05', days: 5 }]);
    const apart = [day('2026-01-01', { flow: 'heavy' }), day('2026-01-05', { flow: 'light' })];
    expect(periodsOf(apart).map((p) => p.start)).toEqual(['2026-01-01', '2026-01-05']);
  });

  it('ne commence pas de cycle sur du spotting', () => {
    const days = [...period('2026-01-01'), day('2026-01-15', { options: { spotting: ['brown'] } })];
    expect(cyclesOf(days)).toHaveLength(1);
  });

  it('calcule les durées et marque les cycles exclus ou atypiques', () => {
    const days = [...period('2026-01-01'), ...period('2026-01-29', 4), ...period('2026-02-05', 2), ...period('2026-03-08')];
    const cycles = cyclesOf(days, [mark('2026-01-29', true, 'Grippe')]);
    expect(cycles.map((c) => [c.start, c.length, c.periodDays, c.excluded, c.atypical])).toEqual([
      ['2026-01-01', 28, 5, false, false],
      ['2026-01-29', 7, 4, true, true],
      ['2026-02-05', 31, 2, false, false],
      ['2026-03-08', undefined, 5, false, false],
    ]);
    expect(cycles[1].note).toBe('Grippe');
  });
});

describe('moyennes', () => {
  it('reprend les durées des réglages sans historique', () => {
    const stats = cycleStats(cyclesOf(period('2026-01-01')), { cycleLength: 30, periodLength: 4 }, '2026-01-02');
    expect(stats).toMatchObject({ cycleLength: 30, periodLength: 4, sample: 0, variation: null });
  });

  it('moyenne les cycles retenus, hors exclus et atypiques', () => {
    const days = [
      ...period('2026-01-01', 4), // 26 j
      ...period('2026-01-27', 4), // 30 j
      ...period('2026-02-26', 2), // 6 j : atypique
      ...period('2026-03-04', 6), // 30 j
      ...period('2026-04-03', 9), // 37 j : exclu
      ...period('2026-05-10', 5), // en cours, règles terminées
    ];
    const stats = cycleStats(cyclesOf(days, [mark('2026-04-03', true)]), settings, '2026-05-20');
    // Cycles retenus : 26, 30, 30 ; règles : 4, 4, 6, 5 (ni l'exclu ni l'atypique).
    expect(stats.cycleLength).toBe(29);
    expect(stats.sample).toBe(3);
    expect(stats.variation).toBe(4);
    expect(stats.periodLength).toBe(5);
    expect(regularity(stats.variation)).toBe('regular');
    expect(regularity(8)).toBe('fairly');
    expect(regularity(12)).toBe('irregular');
  });
});

describe('prédictions', () => {
  const history = [...period('2026-07-01'), ...period('2026-07-29'), ...period('2026-08-26'), ...period('2026-09-23')];

  it('prévoit les prochaines règles, l’ovulation, la fenêtre fertile et le SPM', () => {
    const fc = forecast(history, [], settings, '2026-10-05');
    expect(fc.cycleDay).toBe(13);
    expect(fc.nextPeriod).toBe('2026-10-21');
    expect(fc.daysUntil).toBe(16);
    expect(fc.nextRange).toEqual(['2026-10-20', '2026-10-22']);
    expect(fc.ovulation).toBe('2026-10-07');
    expect(fc.fertile).toEqual(['2026-10-02', '2026-10-07']);
    expect(fc.pms).toEqual(['2026-10-18', '2026-10-20']);
    expect(fc.phase).toBe('fertile');
    expect(fc.upcoming[1].start).toBe('2026-11-18');
  });

  it('donne la phase du jour', () => {
    expect(forecast(history, [], settings, '2026-09-25').phase).toBe('period');
    expect(forecast(history, [], settings, '2026-09-29').phase).toBe('follicular');
    expect(forecast(history, [], settings, '2026-10-07').phase).toBe('ovulation');
    expect(forecast(history, [], settings, '2026-10-12').phase).toBe('luteal');
    expect(forecast(history, [], settings, '2026-10-19').phase).toBe('pms');
  });

  it('signale le retard et attend les règles à partir d’aujourd’hui', () => {
    const fc = forecast(history, [], settings, '2026-10-24');
    expect(fc.lateDays).toBe(3);
    expect(fc.phase).toBe('late');
    expect(fc.nextPeriod).toBe('2026-10-24');
    expect(fc.cycleDay).toBe(32);
    expect(fc.cycleLength).toBe(32);
    // L'ovulation estimée ne glisse pas avec le retard.
    expect(fc.ovulation).toBe('2026-10-07');
  });

  it('prolonge les règles en cours sur leur durée habituelle', () => {
    const days = [...history, day('2026-10-21', { flow: 'heavy' })];
    const fc = forecast(days, [], settings, '2026-10-21');
    expect(fc.phase).toBe('period');
    expect(fc.periodUntil).toBe('2026-10-25');
    const marks = dayMarks(days, fc, settings, '2026-10-20', '2026-10-27', '2026-10-21');
    expect(marks.get('2026-10-21')?.period).toBe('logged');
    expect(marks.get('2026-10-22')?.period).toBe('predicted');
    expect(marks.get('2026-10-25')?.period).toBe('predicted');
    expect(marks.get('2026-10-26')?.period).toBeUndefined();
  });

  it('ne prévoit plus rien quand le suivi est interrompu depuis plus de 90 jours', () => {
    const fc = forecast(history, [], settings, '2027-01-15');
    expect(fc).toMatchObject({ lastPeriod: '2026-09-23', upcoming: [], lateDays: 0 });
    expect(fc.cycleStart).toBeUndefined();
  });

  it('ne prévoit rien sans règles notées', () => {
    expect(forecast([day('2026-10-01', { note: 'rien' })], [], settings, '2026-10-05')).toMatchObject({ upcoming: [], lateDays: 0 });
  });
});

describe('marques du calendrier', () => {
  it('colore règles notées et prévues, fenêtre fertile, ovulation et SPM', () => {
    const days = [...period('2026-08-26'), ...period('2026-09-23'), day('2026-10-01', { options: { pain: ['headache'] } })];
    const fc = forecast(days, [], settings, '2026-10-05');
    const marks = dayMarks(days, fc, settings, '2026-09-01', '2026-11-30', '2026-10-05');
    expect(marks.get('2026-09-23')).toMatchObject({ period: 'logged', cycleDay: 1 });
    expect(marks.get('2026-10-01')).toMatchObject({ logged: true, cycleDay: 9 });
    expect(marks.get('2026-10-07')).toMatchObject({ fertile: true, ovulation: true });
    expect(marks.get('2026-10-19')?.pms).toBe(true);
    expect(marks.get('2026-10-21')).toMatchObject({ period: 'predicted', cycleDay: 1 });
    expect(marks.get('2026-11-18')?.period).toBe('predicted');
    // Fenêtre fertile estimée d'un cycle passé (règles suivantes − 14 j).
    expect(marks.get('2026-09-09')?.ovulation).toBe(true);
  });

  it('respecte les affichages désactivés', () => {
    const days = period('2026-09-23');
    const off = { ...settings, showFertile: false, showOvulation: false, showPms: false };
    const fc = forecast(days, [], off, '2026-10-05');
    const marks = dayMarks(days, fc, off, '2026-09-20', '2026-10-31', '2026-10-05');
    expect([...marks.values()].some((m) => m.fertile || m.ovulation || m.pms)).toBe(false);
  });
});

describe('tendances', () => {
  it('trouve les jours du cycle où une option revient', () => {
    const days = [
      ...period('2026-07-01'),
      ...period('2026-07-29'),
      ...period('2026-08-26'),
      day('2026-07-01', { flow: 'medium', options: { pain: ['period_cramps'] } }),
      day('2026-07-02', { flow: 'medium', options: { pain: ['period_cramps'] } }),
      day('2026-07-29', { flow: 'medium', options: { pain: ['period_cramps'] } }),
      day('2026-08-24', { options: { pms: ['yes'] } }),
    ];
    const byDate = new Map(days.map((d) => [d.date, d]));
    const list = patterns([...byDate.values()], cyclesOf([...byDate.values()]));
    const cramps = list.find((p) => p.option === 'period_cramps')!;
    expect(cramps).toMatchObject({ category: 'pain', count: 3, cycles: 2, peak: [1, 2] });
    expect(list.find((p) => p.category === 'pms')).toMatchObject({ count: 1, peak: [27, 27] });
  });
});
