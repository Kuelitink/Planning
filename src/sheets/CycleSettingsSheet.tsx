/** Réglages du mode Cycle : prédictions, rappels, catégories suivies, étiquettes, données. */

import { useId, useState, type ReactNode } from 'react';
import type { CycleSettings } from '../core/types';
import { CATEGORIES, categoryLabel } from '../core/cycleCatalog';
import { useCycle } from '../state/cycle';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';
import { Field, Sheet } from '../ui/kit';
import { IconPlus, IconUpload, IconX } from '../ui/icons';
import '../modes/cycle.css';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 16 }}>
      <h3 className="section-label" style={{ margin: '0 0 0 2px' }}>
        {title}
      </h3>
      <div>{children}</div>
    </section>
  );
}

function Switch({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <input id={id} type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </Field>
  );
}

function NumberSelect({
  label,
  value,
  values,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  values: number[];
  unit: string;
  onChange: (n: number) => void;
}) {
  const id = useId();
  const list = values.includes(value) ? values : [...values, value].sort((a, b) => a - b);
  return (
    <Field label={label} htmlFor={id}>
      <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {list.map((n) => (
          <option key={n} value={n}>
            {n} {unit}
          </option>
        ))}
      </select>
    </Field>
  );
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function CycleSettingsSheet({ onClose }: { onClose: () => void }) {
  const { updateCycleSettings, clearCycle, cycleDays } = useStore();
  const { openSheet, showToast } = useNav();
  const { settings: s } = useCycle();
  const [tag, setTag] = useState('');
  const ids = { remind: useId(), checkin: useId(), tag: useId() };
  const set = (changes: Partial<CycleSettings>) => updateCycleSettings(changes);

  const toggleCategory = (key: string, on: boolean) => {
    const next = on
      ? CATEGORIES.map((c) => c.key).filter((k) => k === key || s.categories.includes(k))
      : s.categories.filter((k) => k !== key);
    // Les catégories inconnues du catalogue (import) gardent leur place à la fin.
    const extra = s.categories.filter((k) => !CATEGORIES.some((c) => c.key === k) && k !== key);
    set({ categories: on ? [...next, ...extra] : next });
  };

  const setNotify = async (on: boolean) => {
    if (!on) return set({ notify: false });
    if (typeof Notification === 'undefined') {
      showToast({ message: 'Notifications non disponibles sur cet appareil.' });
      return;
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission === 'granted') set({ notify: true });
    else showToast({ message: 'Notifications refusées : autorise-les dans les réglages du téléphone.' });
  };

  const addTag = () => {
    const t = tag.trim();
    if (t && !s.customTags.includes(t)) set({ customTags: [...s.customTags, t] });
    setTag('');
  };

  const clear = async () => {
    if (!window.confirm(`Effacer toutes les données du cycle (${cycleDays.length} jours notés) ? C'est définitif.`)) return;
    await clearCycle();
    showToast({ message: 'Données du cycle effacées' });
  };

  const unknown = s.categories.filter((k) => !CATEGORIES.some((c) => c.key === k));

  return (
    <Sheet title="Réglages du cycle" onClose={onClose}>
      <Group title="Prédictions">
        <NumberSelect
          label="Cycle par défaut"
          value={s.cycleLength}
          values={range(20, 45)}
          unit="j"
          onChange={(n) => set({ cycleLength: n })}
        />
        <NumberSelect
          label="Règles par défaut"
          value={s.periodLength}
          values={range(2, 10)}
          unit="j"
          onChange={(n) => set({ periodLength: n })}
        />
        <NumberSelect label="Jours de SPM" value={s.pmsDays} values={range(1, 10)} unit="j" onChange={(n) => set({ pmsDays: n })} />
        <Switch label="Fenêtre fertile" checked={s.showFertile} onChange={(on) => set({ showFertile: on })} />
        <Switch label="Ovulation" checked={s.showOvulation} onChange={(on) => set({ showOvulation: on })} />
        <Switch label="SPM" checked={s.showPms} onChange={(on) => set({ showPms: on })} />
        <Switch label="Règles dans le Calendrier" checked={s.onCalendar} onChange={(on) => set({ onCalendar: on })} />
        <p className="cy-foot">Les durées par défaut servent tant que les cycles notés ne suffisent pas à calculer tes moyennes.</p>
      </Group>

      <Group title="Rappels">
        <Field label="Avant les règles" htmlFor={ids.remind}>
          <select id={ids.remind} value={s.remindPeriodDays} onChange={(e) => set({ remindPeriodDays: Number(e.target.value) })}>
            <option value={0}>Désactivé</option>
            {[1, 2, 3, 5, 7].map((n) => (
              <option key={n} value={n}>
                {n} jour{n > 1 ? 's' : ''} avant
              </option>
            ))}
          </select>
        </Field>
        <Switch label="Pendant le SPM" checked={s.remindPms} onChange={(on) => set({ remindPms: on })} />
        <Switch label="Fenêtre fertile" checked={s.remindFertile} onChange={(on) => set({ remindFertile: on })} />
        <Field label="Noter ma journée à partir de" htmlFor={ids.checkin}>
          <input
            id={ids.checkin}
            type="time"
            value={s.checkInTime ?? ''}
            onChange={(e) => set({ checkInTime: e.target.value || undefined })}
          />
        </Field>
        <Switch label="Notifications du téléphone" checked={s.notify} onChange={(on) => void setNotify(on)} />
        <p className="cy-foot">
          Les rappels s'affichent dans l'onglet Cycle, et en notification quand l'app est ouverte (l'app n'a pas de serveur pour les envoyer
          quand elle est fermée).
        </p>
      </Group>

      <Group title="Catégories suivies">
        {CATEGORIES.map((c) => (
          <Switch
            key={c.key}
            label={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--ink)' }}>
                <span className="dot" style={{ background: c.color }} aria-hidden="true" />
                {c.label}
              </span>
            }
            checked={s.categories.includes(c.key)}
            onChange={(on) => toggleCategory(c.key, on)}
          />
        ))}
        {unknown.map((k) => (
          <Switch key={k} label={`${categoryLabel(k)} (importée)`} checked onChange={() => toggleCategory(k, false)} />
        ))}
        <p className="cy-foot">Les autres catégories restent accessibles dans « Plus de catégories » en notant un jour.</p>
      </Group>

      <Group title="Étiquettes perso">
        {s.customTags.length > 0 && (
          <div className="cy-chips" style={{ margin: '12px 0 4px' }}>
            {s.customTags.map((t) => (
              <span key={t} className="cy-tag" style={{ paddingRight: 4 }}>
                {t}
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 24, height: 24, color: 'var(--muted)' }}
                  aria-label={`Retirer l'étiquette « ${t} »`}
                  onClick={() => set({ customTags: s.customTags.filter((x) => x !== t) })}
                >
                  <IconX size={14} />
                </button>
              </span>
            ))}
          </div>
        )}
        <form
          className="cy-measure"
          style={{ margin: '8px 0' }}
          onSubmit={(e) => {
            e.preventDefault();
            addTag();
          }}
        >
          <input
            id={ids.tag}
            type="text"
            aria-label="Nouvelle étiquette"
            placeholder="Nouvelle étiquette"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            style={{ flex: 1, width: 'auto', minWidth: 0 }}
          />
          <button type="submit" className="icon-btn icon-btn--card" aria-label="Ajouter l'étiquette" disabled={!tag.trim()}>
            <IconPlus size={18} />
          </button>
        </form>
        <p className="cy-foot" style={{ marginTop: 0 }}>
          Retirer une étiquette de la liste ne l'efface pas des jours où elle a été notée.
        </p>
      </Group>

      <Group title="Données">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn btn--secondary btn--block" onClick={() => openSheet({ kind: 'cycleImport' })}>
            <IconUpload size={18} />
            Importer depuis Clue
          </button>
          <button type="button" className="btn btn--danger btn--block" disabled={cycleDays.length === 0} onClick={() => void clear()}>
            Effacer les données du cycle
          </button>
        </div>
        <p className="cy-foot">Les données du cycle restent sur ce téléphone et sont incluses dans l'export de Réglages › Données.</p>
      </Group>
    </Sheet>
  );
}
