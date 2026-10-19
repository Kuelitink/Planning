/**
 * Réglages de la sauvegarde GitHub, gardés sur l'appareil seulement (jamais dans les exports) :
 * dépôt, clé d'accès, paramètres de chiffrement, état du dernier envoi. La clé de chiffrement
 * est gardée telle quelle (CryptoKey non exportable) : le mot de passe n'est pas conservé.
 */

import { openDB } from 'idb';
import type { Kdf } from './crypto';

export interface SyncConfig {
  owner: string;
  repo: string;
  path: string;
  token: string;
  /** Envoi automatique après chaque modification. */
  auto: boolean;
  kdf: Kdf;
  /** Version distante de notre dernier envoi, et empreinte des données envoyées. */
  sha?: string;
  hash?: string;
  lastPushAt?: string;
  lastCheckAt?: string;
  lastError?: string;
}

const db = () =>
  openDB('planning-sync', 1, {
    upgrade(d) {
      d.createObjectStore('kv');
    },
  });

export async function loadSync(): Promise<{ config?: SyncConfig; key?: CryptoKey }> {
  try {
    const d = await db();
    return { config: (await d.get('kv', 'config')) as SyncConfig | undefined, key: (await d.get('kv', 'key')) as CryptoKey | undefined };
  } catch (err) {
    console.error('Réglages de sauvegarde illisibles', err);
    return {};
  }
}

export async function saveSync(config: SyncConfig, key?: CryptoKey): Promise<void> {
  const d = await db();
  await d.put('kv', config, 'config');
  if (key) await d.put('kv', key, 'key');
}

export async function clearSync(): Promise<void> {
  const d = await db();
  await d.clear('kv');
}
