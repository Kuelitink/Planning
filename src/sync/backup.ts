/**
 * Sauvegarde de toutes les données sur GitHub, chiffrée. Le fichier distant est une enveloppe
 * (`crypto.ts`) qui contient l'export complet de l'appli (`ExportData`).
 *
 * - Envoi : on n'écrit que si les données ont changé depuis le dernier envoi (empreinte). Si le
 *   fichier distant a changé entre-temps (autre appareil), on fusionne d'abord sa version
 *   (l'élément modifié le plus récemment gagne), puis on envoie le résultat.
 * - Restauration : on lit, déchiffre et vérifie la sauvegarde ; l'appelant l'importe.
 * Les suppressions voyagent avec les données (`ExportData.deleted`) : un élément supprimé sur un
 * appareil disparaît des autres à la fusion, sauf s'il y a été modifié après la suppression.
 */

import type { ExportData } from '../storage/repository';
import { parseExport } from '../storage/repository';
import { digest, open, parseEnvelope, seal, type Kdf } from './crypto';
import { GitHubError, getFile, putFile, type GitHubTarget } from './github';

export interface BackupDeps {
  target: GitHubTarget;
  key: CryptoKey;
  kdf: Kdf;
  exportData(): Promise<ExportData>;
  importData(data: ExportData, mode: 'replace' | 'merge'): Promise<void>;
  fetch?: typeof fetch;
}

export interface BackupState {
  /** Version du fichier distant à laquelle correspond notre dernier envoi. */
  sha?: string;
  /** Empreinte des données envoyées. */
  hash?: string;
}

/** Empreinte des données, sans la date d'export (qui change à chaque fois). */
export const dataHash = (data: ExportData) => digest(JSON.stringify({ ...data, exportedAt: '' }));

const message = (now: Date) => `Sauvegarde Planning ${now.toISOString().slice(0, 16).replace('T', ' ')} (UTC)`;

/** Lit et déchiffre la sauvegarde distante (`null` s'il n'y en a pas). */
export async function pullBackup(
  deps: Pick<BackupDeps, 'target' | 'key' | 'fetch'>,
): Promise<{ data: ExportData; sha: string; savedAt: string } | null> {
  const file = await getFile(deps.target, deps.fetch);
  if (!file) return null;
  const env = parseEnvelope(file.text);
  const data = parseExport(JSON.parse(await open(env, deps.key)));
  return { data, sha: file.sha, savedAt: env.savedAt };
}

/** Envoie les données si elles ont changé ; fusionne d'abord la version distante si elle a bougé. */
export async function pushBackup(deps: BackupDeps, state: BackupState, now = new Date()): Promise<BackupState & { pushed: boolean }> {
  let sha = state.sha;
  for (let attempt = 0; attempt < 3; attempt++) {
    const data = await deps.exportData();
    const hash = await dataHash(data);
    if (hash === state.hash && sha === state.sha) return { ...state, pushed: false };
    const env = await seal(JSON.stringify(data), deps.key, deps.kdf, now);
    try {
      const newSha = await putFile(deps.target, JSON.stringify(env), sha, message(now), deps.fetch);
      return { sha: newSha, hash, pushed: true };
    } catch (err) {
      // 409 / 422 : le fichier a changé ailleurs (ou existe déjà) : fusion, puis nouvel essai.
      if (!(err instanceof GitHubError) || (err.status !== 409 && err.status !== 422)) throw err;
      const remote = await pullBackup(deps);
      if (remote) {
        await deps.importData(remote.data, 'merge');
        sha = remote.sha;
      } else sha = undefined;
    }
  }
  throw new Error('La sauvegarde GitHub change sans arrêt : réessaie plus tard.');
}
