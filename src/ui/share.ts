/**
 * Sortie de fichiers : menu de partage du téléphone (Enregistrer dans Drive, Fichiers, e-mail…)
 * quand le navigateur le permet, sinon téléchargement.
 */

/** Le navigateur sait-il partager ces fichiers ? (Chrome Android refuse les .zip, accepte les .json.) */
export function canShareFiles(files: File[]): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files });
  } catch {
    return false;
  }
}

/** Ouvre le menu de partage. Renvoie `false` si on l'a fermé sans choisir. */
export async function shareFiles(files: File[], title: string): Promise<boolean> {
  try {
    await navigator.share({ files, title });
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return false;
    throw err;
  }
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
