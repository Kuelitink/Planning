/** Réglages : modes affichés, horaires, planification, sauvegarde des données. */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { toISODate } from '../core/time';
import { parseExport } from '../storage/repository';
import { canShareFiles, downloadFile, shareFiles } from '../ui/share';
import { formatDeadline } from '../ui/format';
import { useSync } from '../state/sync';
import { useStore } from '../state/store';
import { MODE_LABEL, MODES, useNav, type Mode } from '../state/nav';
import { cycleSettingsOf } from '../core/cycleCatalog';
import { Field, Header, MODE_ICON } from '../ui/kit';
import { IconChevronRight, IconPlus } from '../ui/icons';
import { summarizeRules } from '../sheets/RangesEditor';
import { formatPeriodDates, PeriodSheet, summarizePeriod, upcomingPeriods } from '../sheets/PeriodSheet';
import { BUILD_NUMBER, isNative } from '../native/platform';
import { installApk, latestApk, RELEASES_PAGE, updateWebApp, type ApkRelease } from '../native/update';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2 className="section-label">{title}</h2>
      <div className="card" style={{ padding: '0 16px' }}>
        {children}
      </div>
    </section>
  );
}

/**
 * Version et bouton « Mettre à jour l'application » : l'appli web recharge la nouvelle version
 * publiée ; l'appli Android télécharge la nouvelle APK et ouvre l'installateur.
 */
function AppVersion() {
  const { showToast } = useNav();
  const [update, setUpdate] = useState<ApkRelease | null>(null);
  const [checking, setChecking] = useState(false);
  /** Avancée du téléchargement de l'APK, en %. */
  const [progress, setProgress] = useState<number | null>(null);
  useEffect(() => {
    if (!isNative || !BUILD_NUMBER) return;
    let cancelled = false;
    void latestApk().then((r) => !cancelled && r && r.build > BUILD_NUMBER && setUpdate(r));
    return () => {
      cancelled = true;
    };
  }, []);

  const install = async (release: ApkRelease) => {
    setProgress(0);
    try {
      const result = await installApk(release, setProgress);
      if (result === 'permission')
        showToast({ message: 'Autorise Planning à installer des applis, puis reviens et réappuie sur « Mettre à jour »' });
      else if (result === 'installing') showToast({ message: `Version n°${release.build} téléchargée : touche « Installer »` });
      else if (result === 'failed') showToast({ message: 'Téléchargement impossible (pas de réseau ?)' });
    } finally {
      setProgress(null);
    }
  };

  const checkUpdate = async () => {
    setChecking(true);
    try {
      if (isNative) {
        const latest = await latestApk();
        if (!latest) showToast({ message: 'Vérification impossible (pas de réseau ?)' });
        else if (latest.build > BUILD_NUMBER) {
          setUpdate(latest);
          await install(latest);
        } else showToast({ message: "L'application est à jour" });
        return;
      }
      const result = await updateWebApp();
      if (result === 'updated') {
        showToast({ message: 'Nouvelle version installée, redémarrage…' });
        window.location.reload();
      } else if (result === 'current') showToast({ message: "L'application est à jour" });
      else if (result === 'offline') showToast({ message: 'Vérification impossible (pas de réseau ?)' });
      else window.location.reload();
    } finally {
      setChecking(false);
    }
  };

  const linkStyle = { color: 'var(--accent-text)', fontWeight: 700 } as const;
  return (
    <div style={{ margin: '32px 0 0', textAlign: 'center', fontSize: 13, color: 'var(--faint)', lineHeight: 1.6 }}>
      <button
        type="button"
        className="btn btn--secondary btn--block"
        disabled={checking}
        onClick={() => void checkUpdate()}
        style={{ marginBottom: 12, ...(checking ? { opacity: 0.6 } : {}) }}
      >
        {progress !== null
          ? `Téléchargement… ${progress} %`
          : checking
            ? 'Recherche d’une mise à jour…'
            : "Mettre à jour l'application"}
      </button>
      <p style={{ margin: 0 }}>Planning — v0.3{isNative && BUILD_NUMBER ? ` · appli Android n°${BUILD_NUMBER}` : ''}</p>
      {update && (
        <p style={{ margin: 0 }}>
          Nouvelle version disponible (n°{update.build}) : appuie sur « Mettre à jour ».
          <br />
          <a href={RELEASES_PAGE} target="_blank" rel="noopener" style={linkStyle}>
            Page des versions
          </a>
        </p>
      )}
      {!isNative && (
        <p style={{ margin: 0 }}>
          <a href={RELEASES_PAGE} target="_blank" rel="noopener" style={linkStyle}>
            Appli Android avec widgets (APK)
          </a>
        </p>
      )}
    </div>
  );
}

const rowButton = {
  width: '100%',
  minHeight: 60,
  padding: '8px 0',
  border: 'none',
  borderBottom: '1px solid var(--line)',
  background: 'transparent',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  textAlign: 'left',
} as const;

function ModeSwitch({ mode, checked, disabled, onChange }: { mode: Mode; checked: boolean; disabled: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  const Icon = MODE_ICON[mode];
  return (
    <Field
      htmlFor={id}
      label={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--ink)', fontSize: 16 }}>
          <Icon />
          {MODE_LABEL[mode]}
        </span>
      }
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={disabled ? { opacity: 0.5 } : undefined}
      />
    </Field>
  );
}

export function SettingsMode() {
  const { windows, settings, updateSettings, updateCycleSettings, cycleDays, exportData, importData, loadSample } = useStore();
  const { visibleModes, setVisibleModes, openSheet, showToast } = useNav();
  const { status: sync } = useSync();
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = { def: useId(), buffer: useId(), horizon: useId(), load: useId() };
  /** Période spéciale ouverte : `{}` = nouvelle, `{ id }` = édition. */
  const [period, setPeriod] = useState<{ id?: string } | null>(null);

  const toggleMode = (m: Mode, on: boolean) => {
    const next = on ? [...visibleModes, m] : visibleModes.filter((x) => x !== m);
    if (next.length) setVisibleModes(next);
  };

  const sortedWindows = [...windows].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const periods = upcomingPeriods(windows);

  /** Sauvegarde complète (toutes les données, cycle compris), réimportable avec « Importer ». */
  const exportFile = async () => {
    const data = await exportData();
    return new File([JSON.stringify(data, null, 2)], `planning-${toISODate(new Date())}.json`, { type: 'application/json' });
  };

  const doExport = async () => {
    try {
      showToast({ message: await downloadFile(await exportFile()) });
    } catch (err) {
      console.error(err);
      showToast({ message: "L'export a échoué." });
    }
  };

  /** Menu de partage du téléphone : Enregistrer dans Drive, Fichiers, e-mail… */
  const doShare = async () => {
    try {
      const file = await exportFile();
      if (!canShareFiles([file])) {
        await downloadFile(file);
        showToast({ message: 'Partage indisponible ici : export téléchargé' });
      } else if (await shareFiles([file], 'Sauvegarde Planning')) showToast({ message: 'Sauvegarde envoyée' });
    } catch (err) {
      console.error(err);
      showToast({ message: "L'export a échoué." });
    }
  };

  const doImport = async (file: File) => {
    try {
      const data = parseExport(JSON.parse(await file.text()));
      const replace = window.confirm('Remplacer toutes les données ? (Annuler = fusionner avec les données actuelles)');
      await importData(data, replace ? 'replace' : 'merge');
      showToast({ message: replace ? 'Données remplacées' : 'Données fusionnées' });
    } catch (err) {
      showToast({ message: err instanceof Error && err.message ? err.message : 'Fichier illisible.' });
    }
  };

  return (
    <>
      <Header />
      <h1 className="title">Réglages</h1>

      <Section title="Modes affichés">
        {MODES.map((m) => {
          const checked = visibleModes.includes(m);
          return (
            <ModeSwitch
              key={m}
              mode={m}
              checked={checked}
              disabled={checked && visibleModes.length === 1}
              onChange={(on) => toggleMode(m, on)}
            />
          );
        })}
      </Section>

      <Section title="Horaires">
        {sortedWindows.map((w) => (
          <button key={w.id} type="button" style={rowButton} onClick={() => openSheet({ kind: 'window', id: w.id })}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 16, fontWeight: 500 }}>{w.name}</span>
              <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{summarizeRules(w.rules)}</span>
            </span>
            <span style={{ color: 'var(--faint)', display: 'inline-flex' }}>
              <IconChevronRight size={18} />
            </span>
          </button>
        ))}
        <button type="button" style={{ ...rowButton, fontSize: 16, fontWeight: 600 }} onClick={() => openSheet({ kind: 'window' })}>
          <IconPlus size={18} />
          <span>Horaires</span>
        </button>
        <h3 className="section-label" style={{ margin: '16px 0 0' }}>
          Périodes spéciales
        </h3>
        {periods.map((p) => (
          <button key={p.periodId} type="button" style={rowButton} onClick={() => setPeriod({ id: p.periodId })}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 16, fontWeight: 500 }}>
                {p.name} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· {formatPeriodDates(p.from, p.to)}</span>
              </span>
              <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{summarizePeriod(p, windows)}</span>
            </span>
            <span style={{ color: 'var(--faint)', display: 'inline-flex' }}>
              <IconChevronRight size={18} />
            </span>
          </button>
        ))}
        <button
          type="button"
          style={{ ...rowButton, fontSize: 16, fontWeight: 600 }}
          onClick={() => setPeriod({})}
          disabled={windows.length === 0}
        >
          <IconPlus size={18} />
          <span>Période spéciale</span>
        </button>
        <Field label="Horaires par défaut" htmlFor={ids.def}>
          <select
            id={ids.def}
            value={settings.defaultWindowId ?? ''}
            onChange={(e) => updateSettings({ defaultWindowId: e.target.value || undefined })}
          >
            <option value="">
              Tous les jours {settings.dayStart}–{settings.dayEnd}
            </option>
            {sortedWindows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Planification">
        <Field label="Marge entre tâches" htmlFor={ids.buffer}>
          <select id={ids.buffer} value={settings.bufferMin} onChange={(e) => updateSettings({ bufferMin: Number(e.target.value) })}>
            {[0, 5, 10, 15].map((m) => (
              <option key={m} value={m}>
                {m ? `${m} min` : 'Aucune'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Planifier sur" htmlFor={ids.horizon}>
          <select id={ids.horizon} value={settings.horizonDays} onChange={(e) => updateSettings({ horizonDays: Number(e.target.value) })}>
            {[7, 14, 30].map((d) => (
              <option key={d} value={d}>
                {d} jours
              </option>
            ))}
          </select>
        </Field>
        {cycleDays.length > 0 && (
          // Libellé sur plusieurs lignes : `Field` garde le sien sur une seule.
          <div className="field">
            <label htmlFor={ids.load} className="field__label" style={{ flex: 1, minWidth: 0, padding: '10px 0' }}>
              Adapter la charge au cycle
              <span style={{ display: 'block', fontSize: 13, fontWeight: 400, marginTop: 2, lineHeight: 1.4 }}>
                Journées de plus en plus légères en phase lutéale jusqu'aux règles, pleines en phases folliculaire et
                ovulatoire. Les échéances passent avant.
              </span>
            </label>
            <input
              id={ids.load}
              type="checkbox"
              role="switch"
              className="switch"
              checked={cycleSettingsOf(settings).adaptLoad}
              onChange={(e) => updateCycleSettings({ adaptLoad: e.target.checked })}
            />
          </div>
        )}
      </Section>

      <Section title="Données">
        <button type="button" style={rowButton} onClick={() => openSheet({ kind: 'githubSync' })}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 16, fontWeight: 600 }}>Sauvegarde GitHub</span>
            <span style={{ display: 'block', fontSize: 13, color: sync.lastError ? 'var(--danger)' : 'var(--muted)', marginTop: 2 }}>
              {!sync.configured
                ? 'Chiffrée et automatique, dans un dépôt privé'
                : sync.lastError
                  ? sync.lastError
                  : `${sync.repoName} · ${sync.busy ? 'envoi…' : sync.lastPushAt ? `envoyée ${formatDeadline(sync.lastPushAt).toLowerCase()}` : 'pas encore envoyée'}${sync.auto ? '' : ' · manuelle'}`}
            </span>
          </span>
          <span style={{ color: 'var(--faint)', display: 'inline-flex' }}>
            <IconChevronRight size={18} />
          </span>
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 0' }}>
          <button type="button" className="btn btn--secondary btn--block" onClick={() => void doShare()}>
            Sauvegarder sur Drive ou partager
          </button>
          <button type="button" className="btn btn--secondary btn--block" onClick={() => void doExport()}>
            Télécharger l'export
          </button>
          <button type="button" className="btn btn--secondary btn--block" onClick={() => fileRef.current?.click()}>
            Importer
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void doImport(file);
            }}
          />
          <button
            type="button"
            className="btn btn--secondary btn--block"
            onClick={() => {
              loadSample();
              showToast({ message: 'Exemple chargé' });
            }}
          >
            Charger un exemple
          </button>
          <p style={{ margin: '4px 2px 0', fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>
            Les données restent sur ce téléphone. Sauvegarde-les de temps en temps : le fichier (cycle compris) se réimporte avec
            « Importer ». Pour le cycle seul au format Clue : onglet Cycle › réglages › Exporter au format Clue.
          </p>
        </div>
      </Section>

      <AppVersion />
      {period && <PeriodSheet key={period.id ?? 'new'} periodId={period.id} onClose={() => setPeriod(null)} />}
    </>
  );
}
