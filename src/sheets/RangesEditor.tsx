/** Éditeur de plages horaires (jours + début + fin) et conversions plages ↔ règles du moteur. */

import { useId } from 'react';
import type { HHMM, Weekday, WindowRule } from '../core/types';
import { IconPlus, IconX } from '../ui/icons';

/** Ordre d'affichage : lundi → dimanche. */
export const WEEK: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
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

/** Heures seules, sans les jours : « 10:00–18:00 », « 08:00–12:00, 14:00–18:00 ». */
export function summarizeHours(rules: WindowRule[]): string {
  return [...new Set(rulesToRanges(rules).map((r) => `${r.start}–${r.end}`))].join(', ');
}

const timeInput = {
  height: 44,
  padding: '0 10px',
  border: '1px solid var(--line)',
  borderRadius: 12,
  background: 'var(--card)',
  fontSize: 16,
} as const;

function RangeRow({ range, index, onChange, onRemove, removable }: {
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
        <input id={startId} type="time" value={range.start} onChange={(e) => onChange({ ...range, start: e.target.value })} style={timeInput} />
        <span aria-hidden="true" style={{ color: 'var(--muted)' }}>
          →
        </span>
        <label htmlFor={endId} className="sr-only">
          Fin
        </label>
        <input id={endId} type="time" value={range.end} onChange={(e) => onChange({ ...range, end: e.target.value })} style={timeInput} />
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

/** Liste de plages modifiable, avec « Ajouter une plage ». Il reste toujours au moins une plage. */
export function RangesEditor({ ranges, onChange }: { ranges: Range[]; onChange: (ranges: Range[]) => void }) {
  return (
    <>
      {ranges.map((r, i) => (
        <RangeRow
          key={i}
          range={r}
          index={i}
          removable={ranges.length > 1}
          onChange={(next) => onChange(ranges.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(ranges.filter((_, j) => j !== i))}
        />
      ))}
      <button
        type="button"
        className="link-btn"
        style={{ marginTop: 4, color: 'var(--ink)', fontWeight: 600 }}
        onClick={() => onChange([...ranges, { days: [6, 0], start: '10:00', end: '18:00' }])}
      >
        <IconPlus size={18} />
        <span>Ajouter une plage</span>
      </button>
    </>
  );
}
