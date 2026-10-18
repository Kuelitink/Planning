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

/** Dépôt en mémoire (tests, ou repli si IndexedDB est indisponible). */
export class MemoryRepository implements Repository {
  private data = new Map<CollectionName, Map<ID, unknown>>(COLLECTIONS.map((c) => [c, new Map()]));
  private settings: Settings = { ...DEFAULT_SETTINGS };

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

  async remove(collection: CollectionName, id: ID): Promise<void> {
    this.data.get(collection)!.delete(id);
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
    return out;
  }

  async importAll(data: ExportData, mode: 'replace' | 'merge' = 'merge'): Promise<void> {
    for (const c of COLLECTIONS) {
      const store = this.data.get(c)!;
      if (mode === 'replace') store.clear();
      for (const item of data[c] as { id: ID; updatedAt: string }[]) {
        store.set(item.id, structuredClone(newer(store.get(item.id) as typeof item | undefined, item)));
      }
    }
    this.settings = pickSettings(this.settings, data.settings, mode);
  }
}
