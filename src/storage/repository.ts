/**
 * Accès aux données, indépendant du support. L'implémentation IndexedDB sert sur
 * le téléphone ; une implémentation synchronisée (multi-appareils) pourra être
 * branchée plus tard derrière la même interface.
 */

import type { CalendarEvent, CycleDay, CycleMark, Goal, ID, Project, Settings, Task, TimeEntry, TimeWindow } from '../core/types';
import { DEFAULT_SETTINGS } from '../core/types';

export interface Collections {
  projects: Project;
  windows: TimeWindow;
  tasks: Task;
  events: CalendarEvent;
  goals: Goal;
  timeEntries: TimeEntry;
  /** Mode Cycle : un enregistrement par jour noté, et les annotations de cycles. */
  cycleDays: CycleDay;
  cycleMarks: CycleMark;
}

export type CollectionName = keyof Collections;

export const COLLECTIONS: CollectionName[] = ['projects', 'windows', 'tasks', 'events', 'goals', 'timeEntries', 'cycleDays', 'cycleMarks'];

export interface Repository {
  list<K extends CollectionName>(collection: K): Promise<Collections[K][]>;
  get<K extends CollectionName>(collection: K, id: ID): Promise<Collections[K] | undefined>;
  put<K extends CollectionName>(collection: K, item: Collections[K]): Promise<void>;
  /** Écrit plusieurs éléments d'un coup (une seule transaction). */
  putMany<K extends CollectionName>(collection: K, items: Collections[K][]): Promise<void>;
  remove(collection: CollectionName, id: ID): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
  exportAll(): Promise<ExportData>;
  /** `replace` efface tout avant d'importer ; `merge` garde la version la plus récente (`updatedAt`). */
  importAll(data: ExportData, mode?: 'replace' | 'merge'): Promise<void>;
}

export const EXPORT_APP = 'planning';
export const EXPORT_VERSION = 1;

export type ExportData = {
  app: typeof EXPORT_APP;
  version: number;
  exportedAt: string;
  settings: Settings;
} & { [K in CollectionName]: Collections[K][] };

/** Vérifie la forme d'un export JSON (fichier choisi par l'utilisateur). */
export function parseExport(raw: unknown): ExportData {
  if (!raw || typeof raw !== 'object') throw new Error('Fichier invalide.');
  const data = raw as Record<string, unknown>;
  if (data.app !== EXPORT_APP) throw new Error("Ce fichier n'est pas un export de Planning.");
  if (typeof data.version !== 'number' || data.version > EXPORT_VERSION) {
    throw new Error("Version d'export non prise en charge.");
  }
  for (const c of COLLECTIONS) {
    const list = data[c] ?? [];
    if (!Array.isArray(list)) throw new Error(`Champ « ${c} » invalide.`);
    for (const item of list) {
      if (!item || typeof item !== 'object' || typeof (item as { id?: unknown }).id !== 'string') {
        throw new Error(`Élément sans identifiant dans « ${c} ».`);
      }
    }
    data[c] = list;
  }
  data.settings = { ...DEFAULT_SETTINGS, ...((data.settings as object) ?? {}) };
  return data as ExportData;
}

/** Fusion : l'élément au `updatedAt` le plus récent l'emporte. */
export function newer<T extends { updatedAt: string }>(current: T | undefined, incoming: T): T {
  if (!current) return incoming;
  return Date.parse(incoming.updatedAt) >= Date.parse(current.updatedAt) ? incoming : current;
}

/** Réglages à garder lors d'un import. */
export function pickSettings(current: Settings, incoming: Settings, mode: 'replace' | 'merge'): Settings {
  if (mode === 'replace' || !current.updatedAt) return { ...incoming };
  if (!incoming.updatedAt) return current;
  return Date.parse(incoming.updatedAt) >= Date.parse(current.updatedAt) ? { ...incoming } : current;
}
