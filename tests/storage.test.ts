import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '../src/storage/memory';
import { IndexedDBRepository } from '../src/storage/indexeddb';
import { parseExport, type Repository } from '../src/storage/repository';
import { DEFAULT_SETTINGS } from '../src/core/types';
import { touch } from '../src/core/entity';
import { at, task } from './helpers';

let dbCounter = 0;
const implementations: [string, () => Repository][] = [
  ['mémoire', () => new MemoryRepository()],
  ['IndexedDB', () => new IndexedDBRepository(`test-${++dbCounter}`)],
];

describe.each(implementations)('dépôt %s', (_name, make) => {
  it('lit, écrit et supprime', async () => {
    const repo = make();
    await repo.put('tasks', task('A'));
    await repo.put('tasks', task('B'));
    expect((await repo.list('tasks')).map((t) => t.id).sort()).toEqual(['A', 'B']);
    expect((await repo.get('tasks', 'A'))?.title).toBe('A');
    await repo.remove('tasks', 'A');
    expect(await repo.get('tasks', 'A')).toBeUndefined();
  });

  it('garde les réglages', async () => {
    const repo = make();
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
    await repo.saveSettings({ ...DEFAULT_SETTINGS, granularityMin: 5 });
    expect((await repo.getSettings()).granularityMin).toBe(5);
  });

  it('exporte puis réimporte (remplacement)', async () => {
    const source = make();
    await source.put('tasks', task('A'));
    await source.saveSettings({ ...DEFAULT_SETTINGS, horizonDays: 30 });
    const exported = parseExport(JSON.parse(JSON.stringify(await source.exportAll())));

    const target = make();
    await target.put('tasks', task('Ancienne'));
    await target.importAll(exported, 'replace');
    expect((await target.list('tasks')).map((t) => t.id)).toEqual(['A']);
    expect((await target.getSettings()).horizonDays).toBe(30);
  });

  it('fusion : la version la plus récente gagne', async () => {
    const repo = make();
    const original = task('A');
    const recent = touch(original, { title: 'A (récente)' }, at('2026-10-19 10:00'));
    await repo.put('tasks', recent);
    await repo.put('tasks', task('Locale'));

    const exported = await repo.exportAll();
    exported.tasks = [original, task('Importée')];
    await repo.importAll(exported, 'merge');

    const titles = (await repo.list('tasks')).map((t) => t.title).sort();
    expect(titles).toEqual(['A (récente)', 'Importée', 'Locale']);
  });
});

describe('parseExport', () => {
  it('refuse les fichiers étrangers ou abîmés', () => {
    expect(() => parseExport(null)).toThrow();
    expect(() => parseExport({ app: 'autre' })).toThrow();
    expect(() => parseExport({ app: 'planning', version: 99 })).toThrow();
    expect(() => parseExport({ app: 'planning', version: 1, tasks: [{}] })).toThrow();
  });

  it('complète les collections et réglages manquants', () => {
    const data = parseExport({ app: 'planning', version: 1, exportedAt: '', tasks: [] });
    expect(data.goals).toEqual([]);
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
  });
});
