import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadClueFiles, mergeDay, parseClueFiles } from '../src/core/clue';
import { readZip, zipIsEncrypted, ZipError } from '../src/core/zip';

/** Export Clue synthétique (même forme qu'un vrai export, valeurs inventées). */
const FIXTURES = join(__dirname, 'fixtures');
const DIR = join(FIXTURES, 'ClueDataDownload-2026-01-01');
const bytes = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)));
const folder = () => new Map(readdirSync(DIR).map((f) => [f, readFileSync(join(DIR, f), 'utf8')]));

describe('zip', () => {
  it('lit une archive non chiffrée', () => {
    const files = readZip(bytes('clue-plain.zip'));
    expect([...files.keys()].some((n) => n.endsWith('measurements.json'))).toBe(true);
    expect(zipIsEncrypted(bytes('clue-plain.zip'))).toBe(false);
  });

  it('déchiffre une archive ZipCrypto avec le bon mot de passe', () => {
    const zip = bytes('clue-encrypted.zip');
    expect(zipIsEncrypted(zip)).toBe(true);
    const files = readZip(zip, 'secret');
    const name = [...files.keys()].find((n) => n.endsWith('measurements.json'))!;
    expect(new TextDecoder().decode(files.get(name))).toBe(readFileSync(join(DIR, 'measurements.json'), 'utf8'));
  });

  it('accepte les entrées avec descripteur de données (bit 3)', () => {
    const files = readZip(bytes('clue-descriptor.zip'), 'secret');
    expect(new TextDecoder().decode([...files.values()][0])).toBe(readFileSync(join(DIR, 'measurements.json'), 'utf8'));
  });

  it('demande le mot de passe, puis refuse un mauvais', () => {
    const zip = bytes('clue-encrypted.zip');
    expect(() => readZip(zip)).toThrow(expect.objectContaining({ code: 'password' }));
    expect(() => readZip(zip, 'faux')).toThrow(expect.objectContaining({ code: 'wrong-password' }));
    expect(() => readZip(new Uint8Array([1, 2, 3]))).toThrow(ZipError);
  });
});

describe('import Clue', () => {
  it('lit les mesures de toutes les formes', () => {
    const { days, summary } = parseClueFiles(folder());
    const byDate = new Map(days.map((d) => [d.date, d]));
    expect(byDate.get('2026-01-05')).toMatchObject({
      flow: 'medium',
      options: { pain: ['period_cramps', 'headache'] },
      severity: { 'pain.period_cramps': 'moderate' },
    });
    expect(byDate.get('2026-02-02')?.flow).toBe('very_heavy');
    expect(byDate.get('2026-02-03')).toMatchObject({
      sleepMin: 450,
      bbt: 36.55,
      weightKg: 58.2,
      note: 'Journée chargée',
      options: { tags: ['Migraine du soir'] },
    });
    expect(byDate.get('2026-02-10')?.options).toEqual({ spotting: ['brown'] });
    expect(byDate.get('2026-02-01')?.options).toEqual({ pms: ['yes'] });
    // Type inconnu à liste d'options : gardé ; forme inconnue : signalée.
    expect(byDate.get('2026-03-03')?.options).toEqual({ leisure: ['reading'] });
    expect(summary.unknown).toEqual(['hot_flashes']);
    expect(summary).toMatchObject({ measurements: 18, periods: 4, from: '2026-01-05', to: '2026-03-30' });
  });

  it('reprend les cycles annotés, le profil, les étiquettes et les rappels', () => {
    const { marks, settings, summary } = parseClueFiles(folder());
    expect(marks).toEqual([
      { startDate: '2026-01-05', excluded: false, note: 'Vacances' },
      { startDate: '2026-02-02', excluded: true, note: undefined },
    ]);
    expect(settings).toMatchObject({
      cycleLength: 30,
      periodLength: 4,
      pmsDays: 2,
      showFertile: true,
      showOvulation: false,
      checkInTime: '21:00',
      remindPeriodDays: 2,
      customTags: ['Migraine du soir', 'Course'],
    });
    // Catégories du profil (émotions, mental) et celles qui ont des données.
    expect(settings.categories).toEqual([
      'spotting',
      'pain',
      'feelings',
      'pms',
      'mind',
      'sleep_duration',
      'tags',
      'bbt',
      'weight',
      'notes',
      'leisure',
    ]);
    expect(summary.files.sort()).toEqual([
      'cycle_attributes.json',
      'measurements.json',
      'notifications.json',
      'profile.json',
      'tags_tracked.json',
    ]);
  });

  it('importe le zip chiffré tel que Clue le fournit', () => {
    const zip = { name: 'ClueDataDownload-2026-01-01.zip', bytes: bytes('clue-encrypted.zip') };
    expect(() => loadClueFiles([zip])).toThrow(expect.objectContaining({ code: 'password' }));
    const result = loadClueFiles([zip], 'secret');
    expect(result.summary.days).toBe(parseClueFiles(folder()).summary.days);
  });

  it('importe des fichiers .json choisis un par un', () => {
    const file = (name: string) => ({ name, bytes: new Uint8Array(readFileSync(join(DIR, name))) });
    const result = loadClueFiles([file('measurements.json'), file('cycle_attributes.json')]);
    expect(result.summary.periods).toBe(4);
    expect(result.marks).toHaveLength(2);
    expect(() => loadClueFiles([{ name: 'autre.json', bytes: new TextEncoder().encode('{"a":1}') }])).toThrow();
  });

  it("lit l'ancienne sauvegarde .cluedata", () => {
    const backup = {
      version: 5,
      settings: {
        user_defaults: [
          {
            app_state: { user_created_tags: ['Fatigue'] },
            defaults: { user_defined_averages: { cycleLength: 27, periodLength: 5, PMSLength: 3 } },
          },
        ],
      },
      data: [
        {
          day: '2019-01-03T00:00:00Z',
          period: 'heavy',
          pain: ['cramps'],
          mood: ['happy', 'pms'],
          social: ['conflict_social'],
          sleep: '6_to_9_hours',
          tags: [],
        },
        {
          day: '2019-01-04T00:00:00Z',
          period: 'spotting',
          party: ['drinks_party'],
          marks_excluded_cycle: true,
          cycle_exclusion_notes: 'Malade',
        },
      ],
    };
    const { days, marks, settings } = parseClueFiles(new Map([['ClueBackup-2019.cluedata', JSON.stringify(backup)]]));
    expect(days[0]).toMatchObject({
      flow: 'heavy',
      sleepMin: 450,
      options: { pain: ['period_cramps'], feelings: ['happy'], pms: ['yes'], social_life: ['argumentative'] },
    });
    expect(days[1].options).toEqual({ spotting: ['spotting'], partying: ['alcohol'] });
    expect(marks).toEqual([{ startDate: '2019-01-04', excluded: true, note: 'Malade' }]);
    expect(settings).toMatchObject({ cycleLength: 27, periodLength: 5, pmsDays: 3, customTags: ['Fatigue'] });
  });

  it('fusionne un jour importé avec le jour déjà noté', () => {
    const merged = mergeDay(
      { date: '2026-01-05', options: { pain: ['headache'], feelings: ['happy'] }, note: 'Noté dans Planning' },
      { date: '2026-01-05', flow: 'medium', options: { pain: ['period_cramps', 'headache'] }, note: 'Note Clue' },
    );
    expect(merged).toMatchObject({
      flow: 'medium',
      options: { pain: ['headache', 'period_cramps'], feelings: ['happy'] },
      note: 'Noté dans Planning\nNote Clue',
    });
    expect(mergeDay(merged, { date: '2026-01-05', options: {}, note: 'Note Clue' }).note).toBe(merged.note);
  });
});
