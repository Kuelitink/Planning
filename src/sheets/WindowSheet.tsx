/** Feuille Horaires : un nom et des plages (jours + heures), converties en règles pour le moteur. */

import { useId, useState } from 'react';
import type { HHMM, ID, Weekday, WindowRule } from '../core/types';
import { useStore } from '../state/store';
import { Sheet } from '../ui/kit';
import { IconPlus, IconX } from '../ui/icons';

/** Ordre d'affichage : lundi → dimanche. */
const WEEK: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const LETTER: Record<Weekday, string> = { 1: 'L', 2: 'M', 3: 'M', 4: 'J', 5: 'V', 6: 'S', 0: 'D' };
const SHORT: Record<Weekday, string> = { 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam', 0: 'Dim' };
const FULL: Record<Weekday, string> = { 1: 'lundi', 2: 'mardi', 3: 'mercredi', 4: 'jeudi', 5: 'vendredi', 6: 'samedi', 0: 'dimanche' };

export interface Range {
  days: Weekday[];
  start: HHMM;
  end: HHMM;
}

/** Regroupe les règles de mêmes heures en plages. */
export function rulesToRanges(rules: WindowRule[]): Range[] {
  const groups = new Map<string, Range>();
  for (const r of rules) {
    const key = `${r.start}-${r.end}`;
    const g = groups.get(key) ?? { days: [], start: r.start, end: r.end };
    if (!g.days.includes(r.weekday)) g.days.push(r.weekday);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, days: WEEK.filter((d) => g.days.includes(d)) }))
    .sort((a, b) => WEEK.indexOf(a.days[0]) - WEEK.indexOf(b.days[0]) || a.start.localeCompare(b.start));
}

export function rangesToRules(ranges: Range[]): WindowRule[] {
  return ranges.flatMap((r) => (r.start && r.end && r.start !== r.end ? r.days.map((weekday) => ({ weekday, start: r.start, end: r.end })) : []));
}

/** « Lun–Ven », « Tous les jours », « Lun, Mer, Sam ». */
function formatDays(days: Weekday[]): string {
  const idx = WEEK.filter((d) => days.includes(d)).map((d) => WEEK.indexOf(d));
  if (idx.length === 7) return 'Tous les jours';
  const parts: string[] = [];
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
    const a = SHORT[WEEK[idx[i]]];
    const b = SHORT[WEEK[idx[j]]];
    if (j - i >= 2) parts.push(`${a}–${b}`);
    else for (let k = i; k <= j; k++) parts.push(SHORT[WEEK[idx[k]]]);
    i = j + 1;
  }
  return parts.join(', ');
}

/** Résumé lisible : « Lun–Ven 09:00–18:00 ». */
export function summarizeRules(rules: WindowRule[]): string {
  if (!rules.length) return 'Aucune plage';
  return rulesToRanges(rules)
    .map((r) => `${formatDays(r.days)} ${r.start}–${r.end}`)
    .join(' · ');
}

function RangeEditor({ range, index, onChange, onRemove, removable }: {
  range: Range;
  index: number;
  onChange: (r: Range) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const startId = useId();
  const endId = useId();
  const toggleDay = (d: Weekday) =>
    onChange({ ...range, days: range.days.includes(d) ? range.days.filter((x) => x !== d) : WEEK.filter((x) => x === d || range.days.includes(x)) });

  return (
    <fieldset style={{ margin: 0, padding: '14px 0', border: 'none', borderBottom: '1px solid var(--line)' }}>
      <legend className="sr-only">Plage {index + 1}</legend>
      <div role="group" aria-label="Jours" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {WEEK.map((d) => (
          <button
            key={d}
            type="button"
            className="chip"
            aria-pressed={range.days.includes(d)}
            aria-label={FULL[d]}
            onClick={() => toggleDay(d)}
            style={{ width: 40, height: 40, padding: 0, justifyContent: 'center' }}
          >
            {LETTER[d]}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <label htmlFor={startId} className="sr-only">
          Début
        </label>
        <input
          id={startId}
          type="time"
          value={range.start}
          onChange={(e) => onChange({ ...range, start: e.target.value })}
          style={{ height: 44, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--card)', fontSize: 16 }}
        />
        <span aria-hidden="true" style={{ color: 'var(--muted)' }}>
          →
        </span>
        <label htmlFor={endId} className="sr-only">
          Fin
        </label>
        <input
          id={endId}
          type="time"
          value={range.end}
          onChange={(e) => onChange({ ...range, end: e.target.value })}
          style={{ height: 44, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--card)', fontSize: 16 }}
        />
        <span style={{ flex: 1 }} />
        {removable && (
          <button type="button" className="icon-btn" aria-label={`Retirer la plage ${index + 1}`} onClick={onRemove}>
            <IconX size={18} />
          </button>
        )}
      </div>
    </fieldset>
  );
}

export function WindowSheet({ id, onClose }: { id?: ID; onClose: () => void }) {
  const { windows, addWindow, saveWindow, deleteWindow } = useStore();
  const win = id ? windows.find((w) => w.id === id) : undefined;
  const nameId = useId();
  const [name, setName] = useState(win?.name ?? '');
  const [ranges, setRanges] = useState<Range[]>(() =>
    win && win.rules.length ? rulesToRanges(win.rules) : [{ days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }],
  );

  const rules = rangesToRules(ranges);
  const canSave = name.trim().length > 0 && rules.length > 0;

  const save = () => {
    if (!canSave) return;
    if (win) saveWindow({ ...win, name: name.trim(), rules });
    else addWindow({ name: name.trim(), rules });
    onClose();
  };

  const remove = () => {
    if (!win) return;
    if (!window.confirm('Supprimer ces horaires ? Les tâches et listes qui les utilisent reprendront les horaires par défaut.')) return;
    deleteWindow(win.id);
    onClose();
  };

  return (
    <Sheet title={win ? 'Horaires' : 'Nouveaux horaires'} onClose={onClose}>
      <label htmlFor={nameId} className="sr-only">
        Nom des horaires
      </label>
      <input
        id={nameId}
        className="text-input text-input--title"
        placeholder="Ex. Bureau, Soir…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus={!win}
      />
      <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--muted)' }}>
        Les tâches liées à ces horaires ne seront planifiées que sur ces créneaux.
      </p>

      {ranges.map((r, i) => (
        <RangeEditor
          key={i}
          range={r}
          index={i}
          removable={ranges.length > 1}
          onChange={(next) => setRanges((list) => list.map((x, j) => (j === i ? next : x)))}
          onRemove={() => setRanges((list) => list.filter((_, j) => j !== i))}
        />
      ))}

      <button
        type="button"
        className="link-btn"
        style={{ marginTop: 4, color: 'var(--ink)', fontWeight: 600 }}
        onClick={() => setRanges((list) => [...list, { days: [6, 0], start: '10:00', end: '18:00' }])}
      >
        <IconPlus size={18} />
        <span>Ajouter une plage</span>
      </button>

      <div className="sheet__actions">
        <button type="button" className="btn btn--primary btn--block" onClick={save} disabled={!canSave} style={{ opacity: canSave ? 1 : 0.4 }}>
          Enregistrer
        </button>
        {win && (
          <button type="button" className="btn btn--danger btn--block" onClick={remove}>
            Supprimer ces horaires
          </button>
        )}
      </div>
    </Sheet>
  );
}
