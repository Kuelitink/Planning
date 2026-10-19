import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ID, Settings } from '../core/types';
import { DEFAULT_SETTINGS } from '../core/types';
import {
  COLLECTIONS,
  EXPORT_APP,
  EXPORT_VERSION,
  newer,
  pickSettings,
  type CollectionName,
  type Collections,
  type ExportData,
  type Repository,
} from './repository';

interface PlanningDB extends DBSchema {
  projects: { key: string; value: Collections['projects'] };
  windows: { key: string; value: Collections['windows'] };
  tasks: { key: string; value: Collections['tasks'] };
  events: { key: string; value: Collections['events'] };
  goals: { key: string; value: Collections['goals'] };
  timeEntries: { key: string; value: Collections['timeEntries'] };
  cycleDays: { key: string; value: Collections['cycleDays'] };
  cycleMarks: { key: string; value: Collections['cycleMarks'] };
  meta: { key: string; value: unknown };
}

/** 2 : collections du mode Cycle (créées à la mise à jour, sans toucher aux autres). */
const DB_VERSION = 2;
const SETTINGS_KEY = 'settings';

/** Stockage local sur l'appareil (IndexedDB). */
export class IndexedDBRepository implements Repository {
  private db: Promise<IDBPDatabase<PlanningDB>>;

  constructor(name = 'planning') {
    this.db = openDB<PlanningDB>(name, DB_VERSION, {
      upgrade(db) {
        for (const c of COLLECTIONS) if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      },
    });
  }

  async list<K extends CollectionName>(collection: K): Promise<Collections[K][]> {
    return (await (await this.db).getAll(collection)) as Collections[K][];
  }

  async get<K extends CollectionName>(collection: K, id: ID): Promise<Collections[K] | undefined> {
    return (await (await this.db).get(collection, id)) as Collections[K] | undefined;
  }

  async put<K extends CollectionName>(collection: K, item: Collections[K]): Promise<void> {
    await (await this.db).put(collection, item as never);
  }

  async putMany<K extends CollectionName>(collection: K, items: Collections[K][]): Promise<void> {
    const tx = (await this.db).transaction(collection, 'readwrite');
    for (const item of items) void tx.store.put(item as never);
    await tx.done;
  }

  async remove(collection: CollectionName, id: ID): Promise<void> {
    await (await this.db).delete(collection, id);
  }

  async getSettings(): Promise<Settings> {
    const stored = (await (await this.db).get('meta', SETTINGS_KEY)) as Partial<Settings> | undefined;
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async saveSettings(settings: Settings): Promise<void> {
    await (await this.db).put('meta', settings, SETTINGS_KEY);
  }

  async exportAll(): Promise<ExportData> {
    const out = {
      app: EXPORT_APP,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      settings: await this.getSettings(),
    } as ExportData;
    for (const c of COLLECTIONS) (out as Record<string, unknown>)[c] = await this.list(c);
    return out;
  }

  async importAll(data: ExportData, mode: 'replace' | 'merge' = 'merge'): Promise<void> {
    const db = await this.db;
    const settings = pickSettings(await this.getSettings(), data.settings, mode);
    const tx = db.transaction([...COLLECTIONS, 'meta'], 'readwrite');
    for (const c of COLLECTIONS) {
      const store = tx.objectStore(c);
      if (mode === 'replace') await store.clear();
      for (const item of data[c] as { id: ID; updatedAt: string }[]) {
        const current = (await store.get(item.id)) as typeof item | undefined;
        await store.put(newer(current, item) as never);
      }
    }
    await tx.objectStore('meta').put(settings, SETTINGS_KEY);
    await tx.done;
  }
}
