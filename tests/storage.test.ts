import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '../src/storage/memory';
import { IndexedDBRepository } from '../src/storage/indexeddb';
import { mergeCollection, parseExport, type Repository } from '../src/storage/repository';
import { DEFAULT_SETTINGS } from '../src/core/types';
import { createEntity, touch } from '../src/core/entity';
import type { CycleDay } from '../src/core/types';
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
  it('note les suppressions et les exporte', async () => {
    const repo = make();
    await repo.put('tasks', task('A'));
    await repo.put('tasks', task('B'));
    await repo.remove('tasks', 'A');
    await repo.removeMany('cycleDays', ['2026-10-19']);
    const exported = await repo.exportAll();
    expect(exported.tasks.map((t) => t.id)).toEqual(['B']);
    expect(Object.keys(exported.deleted!.tasks!)).toEqual(['A']);
    expect(Object.keys(exported.deleted!.cycleDays!)).toEqual(['2026-10-19']);
  });

  it("fusion : une suppression faite ailleurs efface l'élément, sauf s'il a été modifié depuis", async () => {
    const repo = make();
    await repo.put('tasks', task('Supprimée ailleurs'));
    await repo.put('tasks', touch(task('Modifiée ici'), { title: 'Modifiée ici (après)' }, new Date(Date.now() + 60_000)));
    const exported = await repo.exportAll();
    const now = new Date().toISOString();
    exported.tasks = [];
    exported.deleted = { tasks: { 'Supprimée ailleurs': now, 'Modifiée ici': now } };
    await repo.importAll(exported, 'merge');
    expect((await repo.list('tasks')).map((t) => t.title)).toEqual(['Modifiée ici (après)']);
    // La suppression reçue est gardée, pour être renvoyée aux autres appareils.
    expect(Object.keys((await repo.exportAll()).deleted!.tasks!)).toEqual(['Supprimée ailleurs']);
  });

  it("fusion : une version plus ancienne reçue d'ailleurs ne fait pas revenir un élément supprimé ici", async () => {
    const repo = make();
    const old = task('A');
    await repo.put('tasks', old);
    await repo.remove('tasks', 'A');
    const exported = await repo.exportAll();
    exported.tasks = [old];
    exported.deleted = {};
    await repo.importAll(exported, 'merge');
    expect(await repo.list('tasks')).toEqual([]);
  });

  it('remplacement : reprend les suppressions de la sauvegarde, oublie celles de l’appareil', async () => {
    const repo = make();
    await repo.put('tasks', task('Ici'));
    await repo.remove('tasks', 'Ici');
    const exported = await repo.exportAll();
    exported.tasks = [task('Ici'), task('B')];
    exported.deleted = { tasks: { Autre: new Date().toISOString() } };
    await repo.importAll(exported, 'replace');
    expect((await repo.list('tasks')).map((t) => t.id).sort()).toEqual(['B', 'Ici']);
    expect(Object.keys((await repo.exportAll()).deleted!.tasks!)).toEqual(['Autre']);
  });
});

describe('mergeCollection', () => {
  const now = at('2026-10-19 12:00');
  it('oublie les suppressions de plus d’un an', () => {
    const { deleted } = mergeCollection([], { vieille: '2025-01-01T00:00:00.000Z', recente: '2026-10-01T00:00:00.000Z' }, [], {}, now);
    expect(Object.keys(deleted)).toEqual(['recente']);
  });

  it('garde la suppression la plus récente des deux appareils', () => {
    const { deleted } = mergeCollection([], { A: '2026-10-01T00:00:00.000Z' }, [], { A: '2026-10-02T00:00:00.000Z' }, now);
    expect(deleted.A).toBe('2026-10-02T00:00:00.000Z');
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

  it('ne garde que les suppressions bien formées', () => {
    const data = parseExport({
      app: 'planning',
      version: 1,
      exportedAt: '',
      deleted: { tasks: { A: '2026-10-19T10:00:00.000Z', B: 42, C: 'pas une date' }, inconnue: { D: '2026-10-19T10:00:00.000Z' } },
    });
    expect(data.deleted).toEqual({ tasks: { A: '2026-10-19T10:00:00.000Z' } });
  });
});

describe('mise à jour de la base (v1 → v2, mode Cycle)', () => {
  it('garde les données existantes et ajoute les collections du cycle', async () => {
    const { openDB } = await import('idb');
    const name = `upgrade-${++dbCounter}`;
    const v1 = await openDB(name, 1, {
      upgrade(db) {
        for (const c of ['projects', 'windows', 'tasks', 'events', 'goals', 'timeEntries']) db.createObjectStore(c, { keyPath: 'id' });
        db.createObjectStore('meta');
      },
    });
    await v1.put('tasks', task('Ancienne'));
    v1.close();

    const repo = new IndexedDBRepository(name);
    expect((await repo.list('tasks')).map((t) => t.id)).toEqual(['Ancienne']);
    const day = createEntity<CycleDay>({ date: '2026-10-01', flow: 'medium', options: { pain: ['period_cramps'] } }, at('2026-10-01 08:00'), '2026-10-01');
    await repo.putMany('cycleDays', [day]);
    const exported = parseExport(JSON.parse(JSON.stringify(await repo.exportAll())));
    expect(exported.cycleDays).toEqual([day]);
    expect(exported.cycleMarks).toEqual([]);
  });
});
