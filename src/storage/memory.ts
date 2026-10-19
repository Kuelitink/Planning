import type { ID, Settings } from '../core/types';
import { DEFAULT_SETTINGS } from '../core/types';
import {
  COLLECTIONS,
  EXPORT_APP,
  EXPORT_VERSION,
  liveDeleted,
  markDeleted,
  mergeCollection,
  pickSettings,
  type CollectionName,
  type Collections,
  type Deleted,
  type ExportData,
  type Repository,
} from './repository';

/** Dépôt en mémoire (tests, ou repli si IndexedDB est indisponible). */
export class MemoryRepository implements Repository {
  private data = new Map<CollectionName, Map<ID, unknown>>(COLLECTIONS.map((c) => [c, new Map()]));
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private deleted: Deleted = {};

  async list<K extends CollectionName>(collection: K): Promise<Collections[K][]> {
    return [...this.data.get(collection)!.values()].map((x) => structuredClone(x)) as Collections[K][];
  }

  async get<K extends CollectionName>(collection: K, id: ID): Promise<Collections[K] | undefined> {
    const item = this.data.get(collection)!.get(id);
    return item === undefined ? undefined : (structuredClone(item) as Collections[K]);
  }

  async put<K extends CollectionName>(collection: K, item: Collections[K]): Promise<void> {
    this.data.get(collection)!.set(item.id, structuredClone(item));
  }

  async putMany<K extends CollectionName>(collection: K, items: Collections[K][]): Promise<void> {
    for (const item of items) await this.put(collection, item);
  }

  async remove(collection: CollectionName, id: ID): Promise<void> {
    await this.removeMany(collection, [id]);
  }

  async removeMany(collection: CollectionName, ids: ID[]): Promise<void> {
    if (!ids.length) return;
    for (const id of ids) this.data.get(collection)!.delete(id);
    this.deleted = markDeleted(this.deleted, collection, ids);
  }

  async getSettings(): Promise<Settings> {
    return { ...this.settings };
  }

  async saveSettings(settings: Settings): Promise<void> {
    this.settings = { ...settings };
  }

  async exportAll(): Promise<ExportData> {
    const out = {
      app: EXPORT_APP,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      settings: await this.getSettings(),
    } as ExportData;
    for (const c of COLLECTIONS) (out as Record<string, unknown>)[c] = await this.list(c);
    out.deleted = liveDeleted(this.deleted, out);
    return out;
  }

  async importAll(data: ExportData, mode: 'replace' | 'merge' = 'merge'): Promise<void> {
    if (mode === 'replace') this.deleted = {};
    const deleted: Deleted = {};
    for (const c of COLLECTIONS) {
      const store = this.data.get(c)!;
      if (mode === 'replace') store.clear();
      const merged = mergeCollection(await this.list(c), this.deleted[c], data[c], data.deleted?.[c]);
      for (const id of merged.remove) store.delete(id);
      for (const item of merged.put) store.set(item.id, structuredClone(item));
      deleted[c] = merged.deleted;
    }
    this.deleted = deleted;
    this.settings = pickSettings(this.settings, data.settings, mode);
  }
}
