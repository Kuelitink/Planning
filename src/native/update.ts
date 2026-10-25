/**
 * Mises à jour de l'application.
 *
 * - Appli web (PWA) : le service worker garde l'appli en cache ; on lui demande de vérifier
 *   s'il existe une nouvelle version sur GitHub Pages, et on recharge la page une fois installée.
 * - Appli Android : chaque push sur `main` publie une APK dans une « release » GitHub
 *   (étiquette `apk-<numéro>`). L'appli compare son numéro à celui de la dernière.
 */

export const RELEASES_PAGE = 'https://github.com/Kuelitink/Planning/releases/latest';
const LATEST = 'https://api.github.com/repos/Kuelitink/Planning/releases/latest';

/** Délai maximal d'installation d'une nouvelle version web avant de recharger quand même. */
const INSTALL_TIMEOUT_MS = 20_000;

export interface ApkRelease {
  build: number;
  /** Lien direct vers l'APK. */
  url: string;
}

/** Dernière APK publiée, ou `null` (pas encore de release, pas de réseau…). */
export async function latestApk(fetchFn: typeof fetch = fetch): Promise<ApkRelease | null> {
  try {
    const res = await fetchFn(LATEST, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (!res.ok) return null;
    const release = (await res.json()) as { tag_name?: string; assets?: { name: string; browser_download_url: string }[] };
    const build = Number(/^apk-(\d+)$/.exec(release.tag_name ?? '')?.[1]);
    const asset = release.assets?.find((a) => a.name.endsWith('.apk'));
    return build && asset ? { build, url: asset.browser_download_url } : null;
  } catch {
    return null;
  }
}

/**
 * Appli web : vérifie s'il existe une nouvelle version et attend qu'elle soit installée.
 * `updated` : il faut recharger la page ; `current` : déjà à jour ;
 * `unavailable` : pas de service worker (navigateur, mode développement) ; `offline` : vérification impossible.
 */
export async function updateWebApp(): Promise<'updated' | 'current' | 'unavailable' | 'offline'> {
  if (!('serviceWorker' in navigator)) return 'unavailable';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'unavailable';
  try {
    await reg.update();
  } catch {
    return 'offline';
  }
  const worker = reg.installing ?? reg.waiting;
  if (!worker) return 'current';
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, INSTALL_TIMEOUT_MS);
    const check = () => {
      if (worker.state === 'activated' || worker.state === 'redundant') {
        window.clearTimeout(timer);
        resolve();
      }
    };
    worker.addEventListener('statechange', check);
    // Version en attente : on lui demande de prendre la main tout de suite (message Workbox).
    if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' });
    check();
  });
  return 'updated';
}
