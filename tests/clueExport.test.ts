import { describe, expect, it } from 'vitest';
import { createEntity } from '../src/core/entity';
import type { CycleDay, CycleMark } from '../src/core/types';
import { DEFAULT_CYCLE_SETTINGS } from '../src/core/cycleCatalog';
import { clueExportName, clueZip, toClueFiles } from '../src/core/clueExport';
import { loadClueFiles } from '../src/core/clue';
import { readZip } from '../src/core/zip';

const CREATED = new Date('2026-10-01T00:00:00');
const day = (date: string, fields: Partial<CycleDay>) => createEntity<CycleDay>({ date, options: {}, ...fields }, CREATED, date);

const days: CycleDay[] = [
  day('2026-09-04', {
    flow: 'heavy',
    options: { pain: ['period_cramps', 'headache'], collection_method: ['menstrual_cup'] },
    severity: { 'pain.period_cramps': 'severe' },
  }),
  day('2026-09-05', { flow: 'medium', options: { pms: ['yes'], feelings: ['sensitive'] }, note: 'Journée chargée' }),
  day('2026-09-06', { flow: 'light', sleepMin: 450, bbt: 36.55, weightKg: 58.2, options: { tags: ['Voyage'], iud: ['thread_checked'] } }),
  day('2026-09-12', { options: { spotting: ['brown'], leisure: ['reading'] } }),
  day('2026-10-02', { flow: 'very_heavy', options: {} }),
];
const marks: CycleMark[] = [createEntity<CycleMark>({ startDate: '2026-09-04', excluded: true, note: 'Malade' }, CREATED, '2026-09-04')];
const settings = {
  ...DEFAULT_CYCLE_SETTINGS,
  cycleLength: 30,
  periodLength: 4,
  pmsDays: 2,
  showOvulation: false,
  categories: ['spotting', 'pain', 'feelings', 'leisure'],
  customTags: ['Voyage', 'Sport'],
  remindPeriodDays: 3,
  remindPms: true,
  remindFertile: false,
  checkInTime: '20:10',
};

describe('export au format Clue', () => {
  it('écrit les mesures comme Clue', () => {
    const files = toClueFiles(days, marks, settings, new Date('2026-10-19T08:00:00Z'));
    const m = files['measurements.json'] as { type: string; date: string; value: unknown }[];
    expect(m.find((x) => x.date === '2026-09-04' && x.type === 'period')?.value).toEqual({ option: 'heavy' });
    expect(m.find((x) => x.date === '2026-09-04' && x.type === 'pain')?.value).toEqual([
      { option: 'period_cramps', extent: { severity: 'severe' } },
      { option: 'headache' },
    ]);
    expect(m.find((x) => x.type === 'pms')?.value).toEqual({ option: 'yes' });
    expect(m.find((x) => x.type === 'sleep_duration')?.value).toEqual({ minutes: 450 });
    expect(Object.keys(m[0])).toEqual(['type', 'id', 'date', 'value']);
    expect(files['cycle_attributes.json']).toEqual([{ id: '2026-09-04', startDate: '2026-09-04', excluded: true, note: 'Malade' }]);
  });

  it('se réimporte à l’identique (zip)', () => {
    const now = new Date('2026-10-19T08:00:00Z');
    const name = clueExportName(now);
    expect(name).toBe('ClueDataDownload-2026-10-19');
    const zip = clueZip(toClueFiles(days, marks, settings, now), name);
    expect([...readZip(zip).keys()].every((n) => n.startsWith(`${name}/`))).toBe(true);

    const back = loadClueFiles([{ name: `${name}.zip`, bytes: zip }]);
    const strip = ({ id: _i, createdAt: _c, updatedAt: _u, ...rest }: CycleDay) => rest;
    expect(back.days).toEqual(days.map(strip));
    expect(back.marks).toEqual([{ startDate: '2026-09-04', excluded: true, note: 'Malade' }]);
    expect(back.settings).toMatchObject({
      cycleLength: 30,
      periodLength: 4,
      pmsDays: 2,
      showFertile: true,
      showOvulation: false,
      customTags: ['Voyage', 'Sport'],
      remindPeriodDays: 3,
      remindPms: true,
      checkInTime: '20:10',
    });
    expect(back.settings.remindFertile).toBeUndefined();
    expect(back.summary.unknown).toEqual([]);
  });
});
