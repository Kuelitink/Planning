/**
 * Export des données du cycle au format Clue : zip (dossier `ClueDataDownload-…` et fichiers
 * .json), réimportable ici ou dans une autre appli qui lit les exports Clue. On l'envoie vers
 * Drive par le menu de partage du téléphone, ou on le télécharge.
 */

import { useMemo, useState } from 'react';
import { clueExportName, clueZip, toClueFiles } from '../core/clueExport';
import { parseISODate } from '../core/time';
import { useCycle } from '../state/cycle';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';
import { Sheet } from '../ui/kit';
import { IconUpload } from '../ui/icons';
import { canShareFiles, downloadFile, shareFiles } from '../ui/share';
import { plural } from '../modes/cycle/shared';
import '../modes/cycle.css';

const longDate = (d: string) => parseISODate(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export function CycleExportSheet({ onClose }: { onClose: () => void }) {
  const { cycleMarks } = useStore();
  const { days, settings } = useCycle();
  const { showToast } = useNav();
  const [busy, setBusy] = useState(false);
  const sorted = useMemo(() => [...days].sort((a, b) => a.date.localeCompare(b.date)), [days]);

  /** Le zip, et les mêmes fichiers .json à part (pour les navigateurs qui ne partagent pas les zip). */
  const build = () => {
    const now = new Date();
    const name = clueExportName(now);
    const files = toClueFiles(days, cycleMarks, settings, now);
    const zip = new File([clueZip(files, name) as BlobPart], `${name}.zip`, { type: 'application/zip' });
    const jsons = Object.entries(files).map(([file, content]) => new File([JSON.stringify(content)], file, { type: 'application/json' }));
    return { zip, jsons };
  };

  const share = async () => {
    setBusy(true);
    try {
      const { zip, jsons } = build();
      const files = canShareFiles([zip]) ? [zip] : canShareFiles(jsons) ? jsons : null;
      if (!files) {
        downloadFile(zip);
        showToast({ message: 'Partage indisponible ici : export téléchargé' });
      } else if (await shareFiles(files, 'Données du cycle (format Clue)')) showToast({ message: 'Export envoyé' });
    } catch (err) {
      console.error(err);
      showToast({ message: "L'export a échoué." });
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    try {
      downloadFile(build().zip);
      showToast({ message: 'Export téléchargé' });
    } catch (err) {
      console.error(err);
      showToast({ message: "L'export a échoué." });
    }
  };

  const empty = sorted.length === 0;

  return (
    <Sheet title="Exporter au format Clue" onClose={onClose}>
      <p className="cy-card__sub" style={{ lineHeight: 1.5 }}>
        {empty
          ? 'Rien à exporter pour l’instant.'
          : `${sorted.length} jour${sorted.length > 1 ? 's' : ''} noté${sorted.length > 1 ? 's' : ''} du ${longDate(sorted[0].date)} au ${longDate(
              sorted[sorted.length - 1].date,
            )}${cycleMarks.length ? `, ${plural(cycleMarks.length, 'cycle')} annoté${cycleMarks.length > 1 ? 's' : ''}` : ''}, et les réglages du cycle.`}
      </p>
      <ul className="cy-steps" style={{ marginTop: 12 }}>
        <li>
          Même format que « Télécharger mes données » de Clue : un dossier ClueDataDownload avec measurements.json et les autres fichiers
          .json.
        </li>
        <li>Se réimporte ici (Réglages du cycle › Importer depuis Clue), ou dans une autre appli qui lit les exports Clue.</li>
        <li>« Enregistrer sur Drive » ouvre le menu de partage du téléphone : choisis Drive (ou Fichiers, e-mail…).</li>
      </ul>
      <div className="sheet__actions">
        <button type="button" className="btn btn--primary btn--block" disabled={empty || busy} onClick={() => void share()}>
          <IconUpload size={18} />
          Enregistrer sur Drive ou partager
        </button>
        <button type="button" className="btn btn--secondary btn--block" disabled={empty} onClick={download}>
          Télécharger le .zip
        </button>
      </div>
      <p className="cy-foot">
        Le fichier contient des données de santé et n'est pas protégé par un mot de passe : range-le dans un espace privé.
      </p>
    </Sheet>
  );
}
