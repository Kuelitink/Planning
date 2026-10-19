/**
 * Import des données Clue : le zip « Télécharger mes données » (avec le mot de passe
 * affiché par Clue), ou les fichiers .json qu'il contient, ou une ancienne sauvegarde
 * .cluedata. Tout se passe sur le téléphone : rien n'est envoyé nulle part.
 */

import { useId, useRef, useState } from 'react';
import { loadClueFiles, type ClueImport } from '../core/clue';
import { ZipError } from '../core/zip';
import { categoryLabel } from '../core/cycleCatalog';
import { parseISODate } from '../core/time';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';
import { Sheet } from '../ui/kit';
import { IconUpload } from '../ui/icons';
import { plural } from '../modes/cycle/shared';
import '../modes/cycle.css';

type Picked = { name: string; bytes: Uint8Array }[];

const longDate = (d: string) => parseISODate(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export function CycleImportSheet({ onClose }: { onClose: () => void }) {
  const { importCycle } = useStore();
  const { showToast, setMode } = useNav();
  const fileRef = useRef<HTMLInputElement>(null);
  const passwordId = useId();
  const [files, setFiles] = useState<Picked | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [result, setResult] = useState<ClueImport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const read = (picked: Picked, pwd?: string) => {
    setError('');
    setResult(null);
    if (picked.some((f) => /\.rar$/i.test(f.name) || (f.bytes[0] === 0x52 && f.bytes[1] === 0x61 && f.bytes[2] === 0x72))) {
      setError("Les archives .rar ne sont pas lues : choisis le .zip reçu de Clue, ou les fichiers .json qu'il contient.");
      return;
    }
    try {
      setResult(loadClueFiles(picked, pwd));
      setNeedsPassword(false);
    } catch (err) {
      if (err instanceof ZipError && (err.code === 'password' || err.code === 'wrong-password')) {
        setNeedsPassword(true);
        if (err.code === 'wrong-password') setError('Mot de passe incorrect.');
      } else setError(err instanceof Error && err.message ? err.message : 'Fichier illisible.');
    }
  };

  const onPick = async (list: FileList | null) => {
    if (!list?.length) return;
    const picked = await Promise.all([...list].map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    setFiles(picked);
    setPassword('');
    setNeedsPassword(false);
    read(picked);
  };

  const doImport = async () => {
    if (!result) return;
    setBusy(true);
    try {
      await importCycle(result);
      showToast({ message: `Données Clue importées : ${plural(result.summary.days, 'jour')}` });
      setMode('cycle');
      onClose();
    } catch (err) {
      console.error(err);
      setError("L'import a échoué.");
    } finally {
      setBusy(false);
    }
  };

  const s = result?.summary;

  return (
    <Sheet title="Importer depuis Clue" onClose={onClose}>
      <ol className="cy-steps">
        <li>Dans Clue : Réglages › « Télécharger mes données ».</li>
        <li>Clue affiche un mot de passe : copie-le. Tu reçois ensuite un e-mail avec un lien vers un fichier .zip.</li>
        <li>Choisis ici ce .zip (ou les fichiers .json qu'il contient), puis saisis le mot de passe.</li>
      </ol>

      <button type="button" className="cy-file" onClick={() => fileRef.current?.click()}>
        <IconUpload />
        {files ? files.map((f) => f.name).join(', ') : 'Choisir le fichier Clue'}
        <small>.zip, .json ou .cluedata</small>
      </button>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".zip,.json,.cluedata,application/zip,application/json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const list = e.target.files;
          void onPick(list).finally(() => (e.target.value = ''));
        }}
      />

      {needsPassword && files && (
        <form
          style={{ marginTop: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            read(files, password);
          }}
        >
          <label htmlFor={passwordId} className="section-label" style={{ display: 'block', margin: '0 0 8px 2px' }}>
            Mot de passe de l'export
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id={passwordId}
              className="text-input"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe affiché par Clue"
            />
            <button type="submit" className="btn btn--primary" disabled={!password}>
              Ouvrir
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="cy-error" role="alert">
          {error}
        </p>
      )}

      {s && (
        <div className="cy-card" style={{ marginTop: 16, background: 'var(--bg)' }}>
          <h3 className="cy-card__title">Prêt à importer</h3>
          <p className="cy-card__sub" style={{ lineHeight: 1.5 }}>
            {s.days} jour{s.days > 1 ? 's' : ''} noté{s.days > 1 ? 's' : ''}
            {s.from && s.to && ` du ${longDate(s.from)} au ${longDate(s.to)}`}, {plural(s.periods, 'cycle')}
            {result.marks.length > 0 && ` dont ${result.marks.length} annoté${result.marks.length > 1 ? 's' : ''} (exclusion, note)`}.
          </p>
          {result.settings.categories && (
            <p className="cy-card__sub" style={{ lineHeight: 1.5 }}>
              Catégories : {result.settings.categories.map(categoryLabel).join(', ')}.
            </p>
          )}
          {s.unknown.length > 0 && (
            <p className="cy-card__sub" style={{ lineHeight: 1.5 }}>
              Ignoré (format inconnu) : {s.unknown.join(', ')}.
            </p>
          )}
          <p className="cy-card__sub" style={{ lineHeight: 1.5 }}>
            Les jours déjà notés ici sont complétés, rien n'est effacé. Les réglages de Clue (durées, affichage, rappels) sont repris.
          </p>
          <button
            type="button"
            className="btn btn--primary btn--block"
            style={{ marginTop: 12 }}
            disabled={busy}
            onClick={() => void doImport()}
          >
            {busy ? 'Import…' : 'Importer'}
          </button>
        </div>
      )}

      <p className="cy-foot">Le fichier est lu sur ce téléphone : rien n'est envoyé sur Internet.</p>
    </Sheet>
  );
}
