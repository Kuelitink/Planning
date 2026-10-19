/**
 * Sauvegarde automatique sur GitHub (chiffrée) : envoi une minute après la dernière
 * modification et quand l'app passe en arrière-plan ; au démarrage, récupération de la version
 * envoyée par un autre appareil. Rien ne part tant que la sauvegarde n'est pas configurée.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MINUTE } from '../core/time';
import { deriveKey, newKdf, open, parseEnvelope } from '../sync/crypto';
import { getFile, getRepo, parseRepo, type GitHubTarget } from '../sync/github';
import { dataHash, pullBackup, pushBackup, type BackupDeps } from '../sync/backup';
import { clearSync, loadSync, saveSync, type SyncConfig } from '../sync/config';
import { useStore } from './store';

export const BACKUP_PATH = 'planning-sauvegarde.json';
/** Délai entre la dernière modification et l'envoi. */
const PUSH_DELAY = MINUTE;
/** Au retour dans l'app, on regarde s'il y a du nouveau sur GitHub au plus toutes les 10 min. */
const CHECK_EVERY = 10 * MINUTE;

export interface SyncStatus {
  configured: boolean;
  repoName?: string;
  auto: boolean;
  lastPushAt?: string;
  lastError?: string;
  busy: boolean;
  /** Des modifications attendent d'être envoyées. */
  pending: boolean;
}

export interface SyncApi {
  status: SyncStatus;
  /** Vérifie le dépôt et le mot de passe ; `remote` = une sauvegarde existe déjà (à récupérer). */
  connect(input: { repo: string; token: string; password: string; auto: boolean }): Promise<{ remote?: { savedAt: string } }>;
  restore(mode: 'merge' | 'replace'): Promise<void>;
  pushNow(): Promise<void>;
  setAuto(on: boolean): Promise<void>;
  disconnect(): Promise<void>;
}

const SyncContext = createContext<SyncApi | null>(null);

export function useSync(): SyncApi {
  const s = useContext(SyncContext);
  if (!s) throw new Error('useSync hors de <SyncProvider>');
  return s;
}

const target = (c: SyncConfig): GitHubTarget => ({ owner: c.owner, repo: c.repo, path: c.path, token: c.token });
const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'Sauvegarde impossible.');

export function SyncProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const { ready, exportData, importData } = store;
  const [config, setConfig] = useState<SyncConfig>();
  const [key, setKey] = useState<CryptoKey>();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const cfg = useRef(config);
  cfg.current = config;
  const keyRef = useRef(key);
  keyRef.current = key;
  const running = useRef<Promise<void> | null>(null);

  useEffect(() => {
    void loadSync().then(({ config: c, key: k }) => {
      if (c && k) {
        setConfig(c);
        setKey(k);
      }
    });
  }, []);

  const update = useCallback(async (changes: Partial<SyncConfig>) => {
    const next = { ...cfg.current!, ...changes };
    cfg.current = next;
    setConfig(next);
    await saveSync(next);
  }, []);

  const deps = useCallback(
    (c: SyncConfig, k: CryptoKey): BackupDeps => ({ target: target(c), key: k, kdf: c.kdf, exportData, importData }),
    [exportData, importData],
  );

  /** Une seule opération à la fois ; les erreurs sont gardées dans l'état (et renvoyées). */
  const exclusive = useCallback(
    async (job: () => Promise<void>) => {
      while (running.current) await running.current.catch(() => undefined);
      const p = (async () => {
        setBusy(true);
        try {
          await job();
          if (cfg.current?.lastError) await update({ lastError: undefined });
        } catch (err) {
          if (cfg.current) await update({ lastError: errorText(err) });
          throw err;
        } finally {
          setBusy(false);
        }
      })();
      running.current = p;
      try {
        await p;
      } finally {
        if (running.current === p) running.current = null;
      }
    },
    [update],
  );

  const pushNow = useCallback(
    () =>
      exclusive(async () => {
        const c = cfg.current;
        const k = keyRef.current;
        if (!c || !k) return;
        setPending(false);
        const out = await pushBackup(deps(c, k), { sha: c.sha, hash: c.hash });
        await update({ sha: out.sha, hash: out.hash, ...(out.pushed && { lastPushAt: new Date().toISOString() }) });
      }),
    [exclusive, deps, update],
  );

  /** Récupère la version d'un autre appareil si le fichier distant a changé depuis notre envoi. */
  const check = useCallback(
    () =>
      exclusive(async () => {
        const c = cfg.current;
        const k = keyRef.current;
        if (!c || !k) return;
        const file = await getFile(target(c));
        await update({ lastCheckAt: new Date().toISOString() });
        if (!file || file.sha === c.sha) return;
        const remote = await pullBackup(deps(c, k));
        if (!remote) return;
        await importData(remote.data, 'merge');
        const out = await pushBackup(deps(c, k), { sha: remote.sha, hash: await dataHash(remote.data) });
        await update({ sha: out.sha, hash: out.hash, ...(out.pushed && { lastPushAt: new Date().toISOString() }) });
      }),
    [exclusive, deps, importData, update],
  );

  const restore = useCallback(
    (mode: 'merge' | 'replace') =>
      exclusive(async () => {
        const c = cfg.current;
        const k = keyRef.current;
        if (!c || !k) return;
        const remote = await pullBackup(deps(c, k));
        if (!remote) throw new Error('Aucune sauvegarde sur GitHub pour l’instant.');
        await importData(remote.data, mode);
        // Ce téléphone part de cette version : le prochain envoi la remplace sans conflit.
        const out = await pushBackup(deps(c, k), { sha: remote.sha, hash: await dataHash(remote.data) });
        await update({ sha: out.sha, hash: out.hash, ...(out.pushed && { lastPushAt: new Date().toISOString() }) });
      }),
    [exclusive, deps, importData, update],
  );

  const connect = useCallback<SyncApi['connect']>(
    async ({ repo, token, password, auto }) => {
      const parsed = parseRepo(repo);
      if (!parsed) throw new Error('Dépôt à écrire sous la forme compte/nom, par exemple Kuelitink/planning-donnees.');
      const t: GitHubTarget = { ...parsed, path: BACKUP_PATH, token: token.trim() };
      setBusy(true);
      try {
        const info = await getRepo(t);
        if (!info.private) throw new Error('Ce dépôt est public : tout le monde pourrait lire la sauvegarde. Choisis un dépôt privé.');
        if (!info.canPush) throw new Error('La clé d’accès ne permet pas d’écrire dans ce dépôt (Contents : Read and write).');
        const file = await getFile(t);
        if (file) {
          // Une sauvegarde existe : même mot de passe exigé (on vérifie en la déchiffrant).
          const env = parseEnvelope(file.text);
          const k = await deriveKey(password, env.kdf);
          await open(env, k);
          const c: SyncConfig = { ...t, auto, kdf: env.kdf };
          await saveSync(c, k);
          cfg.current = c;
          keyRef.current = k;
          setConfig(c);
          setKey(k);
          return { remote: { savedAt: env.savedAt } };
        }
        const kdf = newKdf();
        const k = await deriveKey(password, kdf);
        const c: SyncConfig = { ...t, auto, kdf };
        await saveSync(c, k);
        cfg.current = c;
        keyRef.current = k;
        setConfig(c);
        setKey(k);
      } finally {
        setBusy(false);
      }
      await pushNow();
      return {};
    },
    [pushNow],
  );

  const setAuto = useCallback((on: boolean) => update({ auto: on }), [update]);

  const disconnect = useCallback(async () => {
    await clearSync();
    cfg.current = undefined;
    keyRef.current = undefined;
    setConfig(undefined);
    setKey(undefined);
    setPending(false);
  }, []);

  // --- Envoi automatique -------------------------------------------------------------
  const active = Boolean(ready && config && key && config.auto);
  const { projects, windows, tasks, events, goals, timeEntries, cycleDays, cycleMarks, settings } = store;
  const first = useRef(true);
  const timer = useRef<number>();
  useEffect(() => {
    if (!active) return;
    // Le premier rendu est le chargement des données, pas une modification.
    if (first.current) {
      first.current = false;
      return;
    }
    setPending(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void pushNow().catch(() => undefined), PUSH_DELAY);
  }, [active, projects, windows, tasks, events, goals, timeEntries, cycleDays, cycleMarks, settings, pushNow]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => {
    if (!active) return;
    // Au démarrage : récupérer ce qu'un autre appareil aurait envoyé.
    void check().catch(() => undefined);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && pendingRef.current) {
        window.clearTimeout(timer.current);
        void pushNow().catch(() => undefined);
      } else if (document.visibilityState === 'visible') {
        const last = cfg.current?.lastCheckAt ? Date.parse(cfg.current.lastCheckAt) : 0;
        if (Date.now() - last > CHECK_EVERY) void check().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
    // Une seule fois par activation (pas à chaque modification).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const status = useMemo<SyncStatus>(
    () => ({
      configured: Boolean(config && key),
      repoName: config ? `${config.owner}/${config.repo}` : undefined,
      auto: config?.auto ?? false,
      lastPushAt: config?.lastPushAt,
      lastError: config?.lastError,
      busy,
      pending,
    }),
    [config, key, busy, pending],
  );

  const value: SyncApi = { status, connect, restore, pushNow, setAuto, disconnect };
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
