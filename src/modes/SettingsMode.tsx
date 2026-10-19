/** Réglages : modes affichés, horaires, planification, sauvegarde des données. */

import { useId, useRef, useState, type ReactNode } from 'react';
import { toISODate } from '../core/time';
import { parseExport } from '../storage/repository';
import { canShareFiles, downloadFile, shareFiles } from '../ui/share';
import { useStore } from '../state/store';
import { MODE_LABEL, MODES, useNav, type Mode } from '../state/nav';
import { Field, Header, MODE_ICON } from '../ui/kit';
import { IconChevronRight, IconPlus } from '../ui/icons';
import { summarizeRules } from '../sheets/RangesEditor';
import { formatPeriodDates, PeriodSheet, summarizePeriod, upcomingPeriods } from '../sheets/PeriodSheet';

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
  const { windows, settings, updateSettings, exportData, importData, loadSample } = useStore();
  const { visibleModes, setVisibleModes, openSheet, showToast } = useNav();
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = { def: useId(), buffer: useId(), horizon: useId() };
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
      downloadFile(await exportFile());
      showToast({ message: 'Export téléchargé' });
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
        downloadFile(file);
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
      </Section>

      <Section title="Données">
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

      <p style={{ margin: '32px 0 0', textAlign: 'center', fontSize: 13, color: 'var(--faint)' }}>Planning — v0.3</p>
      {period && <PeriodSheet key={period.id ?? 'new'} periodId={period.id} onClose={() => setPeriod(null)} />}
    </>
  );
}
