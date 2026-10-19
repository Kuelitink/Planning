/**
 * Sortie de fichiers : menu de partage du téléphone (Enregistrer dans Drive, Fichiers, e-mail…)
 * quand le navigateur le permet, sinon téléchargement. Dans l'appli Android, les fichiers passent
 * par le stockage de l'appli (plugins Filesystem et Share de Capacitor).
 */

import { isNative } from '../native/platform';

/** Le navigateur sait-il partager ces fichiers ? (Chrome Android refuse les .zip, accepte les .json.) */
export function canShareFiles(files: File[]): boolean {
  if (isNative) return true;
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files });
  } catch {
    return false;
  }
}

/** Ouvre le menu de partage. Renvoie `false` si on l'a fermé sans choisir. */
export async function shareFiles(files: File[], title: string): Promise<boolean> {
  if (isNative) return nativeShare(files, title);
  try {
    await navigator.share({ files, title });
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return false;
    throw err;
  }
}

/** Enregistre le fichier ; renvoie le message à afficher. */
export async function downloadFile(file: File): Promise<string> {
  if (isNative) return nativeSave(file);
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'Export téléchargé';
}

async function base64Of(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function nativeShare(files: File[], title: string): Promise<boolean> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const uris: string[] = [];
  for (const file of files) {
    const written = await Filesystem.writeFile({ path: `partage/${file.name}`, data: await base64Of(file), directory: Directory.Cache, recursive: true });
    uris.push(written.uri);
  }
  try {
    await Share.share({ title, files: uris });
    return true;
  } catch (err) {
    // Menu de partage fermé sans choisir.
    if (err instanceof Error && /cancel/i.test(err.message)) return false;
    throw err;
  }
}

/** Dossier Documents › Planning du téléphone. */
async function nativeSave(file: File): Promise<string> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  // Android 10 et avant : permission d'écrire dans le stockage partagé.
  const { publicStorage } = await Filesystem.requestPermissions();
  if (publicStorage !== 'granted') throw new Error('Permission refusée pour enregistrer dans Documents.');
  await Filesystem.writeFile({ path: `Planning/${file.name}`, data: await base64Of(file), directory: Directory.Documents, recursive: true });
  return 'Enregistré dans Documents › Planning';
}
