/**
 * Accès aux données, indépendant du support. L'implémentation IndexedDB sert sur
 * le téléphone ; une implémentation synchronisée (multi-appareils) pourra être
 * branchée plus tard derrière la même interface.
 */

import type { CalendarEvent, CycleDay, CycleMark, Goal, ID, ISODateTime, Project, Settings, Task, TimeEntry, TimeWindow } from '../core/types';
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
  /** Efface et note la suppression (pour la propager aux autres appareils). */
  remove(collection: CollectionName, id: ID): Promise<void>;
  removeMany(collection: CollectionName, ids: ID[]): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
  exportAll(): Promise<ExportData>;
  /**
   * `replace` efface tout avant d'importer ; `merge` garde la version la plus récente (`updatedAt`)
   * et applique les suppressions plus récentes que l'élément (voir `mergeCollection`).
   */
  importAll(data: ExportData, mode?: 'replace' | 'merge'): Promise<void>;
}

export const EXPORT_APP = 'planning';
export const EXPORT_VERSION = 1;

/** Suppressions par collection : identifiant → date de la suppression. */
export type Deleted = { [K in CollectionName]?: Record<ID, ISODateTime> };

export type ExportData = {
  app: typeof EXPORT_APP;
  version: number;
  exportedAt: string;
  settings: Settings;
  /** Absent des exports faits avant la synchronisation des suppressions. */
  deleted?: Deleted;
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
  data.deleted = parseDeleted(data.deleted);
  return data as ExportData;
}

/** Garde des suppressions reçues ce qui a la bonne forme (collection connue, date en texte). */
function parseDeleted(raw: unknown): Deleted {
  const out: Deleted = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const c of COLLECTIONS) {
    const list = (raw as Record<string, unknown>)[c];
    if (!list || typeof list !== 'object') continue;
    const entries = Object.entries(list).filter(([, at]) => typeof at === 'string' && !Number.isNaN(Date.parse(at as string)));
    if (entries.length) out[c] = Object.fromEntries(entries) as Record<ID, ISODateTime>;
  }
  return out;
}

/** Fusion : l'élément au `updatedAt` le plus récent l'emporte. */
export function newer<T extends { updatedAt: string }>(current: T | undefined, incoming: T): T {
  if (!current) return incoming;
  return Date.parse(incoming.updatedAt) >= Date.parse(current.updatedAt) ? incoming : current;
}

/** Une suppression est oubliée au bout d'un an : un appareil resté hors ligne plus longtemps pourrait la défaire. */
export const DELETED_KEEP_MS = 365 * 24 * 60 * 60 * 1000;

/** Note la suppression de `ids` maintenant. */
export function markDeleted(deleted: Deleted, collection: CollectionName, ids: ID[], now = new Date()): Deleted {
  const at = now.toISOString();
  return { ...deleted, [collection]: { ...deleted[collection], ...Object.fromEntries(ids.map((id) => [id, at])) } };
}

/**
 * Fusion d'une collection, suppressions comprises. La version la plus récente d'un élément
 * l'emporte (`newer`) ; puis une suppression plus récente que cette version l'efface, même si
 * elle vient d'un autre appareil, alors qu'un élément modifié après sa suppression revient.
 * Renvoie ce qu'il faut écrire et effacer localement, et les suppressions à garder (sans celles
 * dépassées par une modification ni celles de plus d'un an).
 */
export function mergeCollection<T extends { id: ID; updatedAt: string }>(
  local: T[],
  localDeleted: Record<ID, ISODateTime> = {},
  incoming: T[] = [],
  incomingDeleted: Record<ID, ISODateTime> = {},
  now = new Date(),
): { put: T[]; remove: ID[]; deleted: Record<ID, ISODateTime> } {
  const limit = now.getTime() - DELETED_KEEP_MS;
  const deleted: Record<ID, ISODateTime> = {};
  for (const source of [localDeleted, incomingDeleted]) {
    for (const [id, at] of Object.entries(source)) {
      const t = Date.parse(at);
      if (t >= limit && (!deleted[id] || t > Date.parse(deleted[id]))) deleted[id] = at;
    }
  }
  const mine = new Map(local.map((x) => [x.id, x]));
  const theirs = new Map(incoming.map((x) => [x.id, x]));
  const put: T[] = [];
  const remove: ID[] = [];
  for (const id of new Set([...mine.keys(), ...theirs.keys()])) {
    const current = mine.get(id);
    const other = theirs.get(id);
    const winner = other ? newer(current, other) : current!;
    const gone = deleted[id];
    if (gone && Date.parse(gone) >= Date.parse(winner.updatedAt)) {
      if (current) remove.push(id);
      continue;
    }
    if (gone) delete deleted[id];
    if (winner !== current) put.push(winner);
  }
  return { put, remove, deleted };
}

/** Suppressions à exporter : sans celles dépassées par une modification, ni les trop anciennes. */
export function liveDeleted(deleted: Deleted, items: { [K in CollectionName]: Collections[K][] }, now = new Date()): Deleted {
  const out: Deleted = {};
  for (const c of COLLECTIONS) {
    const kept = mergeCollection(items[c] as { id: ID; updatedAt: string }[], deleted[c], [], {}, now).deleted;
    if (Object.keys(kept).length) out[c] = kept;
  }
  return out;
}

/** Réglages à garder lors d'un import. */
export function pickSettings(current: Settings, incoming: Settings, mode: 'replace' | 'merge'): Settings {
  if (mode === 'replace' || !current.updatedAt) return { ...incoming };
  if (!incoming.updatedAt) return current;
  return Date.parse(incoming.updatedAt) >= Date.parse(current.updatedAt) ? { ...incoming } : current;
}
