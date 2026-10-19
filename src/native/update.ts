/**
 * Mises à jour de l'appli Android : chaque push sur `main` publie une APK dans une « release »
 * GitHub (étiquette `apk-<numéro>`). L'appli compare son numéro à celui de la dernière.
 */

export const RELEASES_PAGE = 'https://github.com/Kuelitink/Planning/releases/latest';
const LATEST = 'https://api.github.com/repos/Kuelitink/Planning/releases/latest';

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
