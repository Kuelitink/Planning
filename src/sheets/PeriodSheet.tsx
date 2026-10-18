/**
 * Période spéciale (vacances…) : pendant quelques jours, chaque fenêtre d'horaires reste
 * normale, est fermée, ou prend d'autres plages. Prioritaire sur les règles habituelles.
 */

import { useId, useState } from 'react';
import type { ID, ISODate, TimeWindow, WindowOverride, WindowRule } from '../core/types';
import { addDays, parseISODate, startOfWeek, toISODate } from '../core/time';
import { listPeriods, type SpecialPeriod } from '../core/windows';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { Field, Segmented, Sheet } from '../ui/kit';
import { formatDayMonth } from '../ui/format';
import { RangesEditor, rangesToRules, rulesToRanges, summarizeHours, type Range } from './RangesEditor';

type Choice = 'normal' | 'closed' | 'custom';

/** « 26 oct. – 1 nov. » (un seul jour : « 26 oct. »). */
export function formatPeriodDates(from: ISODate, to: ISODate): string {
  const a = formatDayMonth(parseISODate(from));
  return from === to ? a : `${a} – ${formatDayMonth(parseISODate(to))}`;
}

/** « Bureau fermé · Journée 10:00–18:00 » */
export function summarizePeriod(period: SpecialPeriod, windows: TimeWindow[]): string {
  return period.windows
    .map(({ windowId, rules }) => {
      const name = windows.find((w) => w.id === windowId)?.name ?? '?';
      return rules.length ? `${name} ${summarizeHours(rules)}` : `${name} fermé`;
    })
    .join(' · ');
}

/** Périodes en cours ou à venir. */
export function upcomingPeriods(windows: TimeWindow[], today = toISODate(new Date())): SpecialPeriod[] {
  return listPeriods(windows).filter((p) => p.to >= today);
}

interface WindowChoice {
  choice: Choice;
  ranges: Range[];
}

export function PeriodSheet({ periodId, onClose }: { periodId?: ID; onClose: () => void }) {
  const { windows, saveWindow } = useStore();
  const { showToast } = useNav();
  const ids = { name: useId(), from: useId(), to: useId() };
  const sorted = [...windows].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const existing = periodId ? listPeriods(windows).find((p) => p.periodId === periodId) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [from, setFrom] = useState<ISODate>(() => existing?.from ?? toISODate(addDays(startOfWeek(new Date(), 1), 7)));
  const [to, setTo] = useState<ISODate>(() => existing?.to ?? toISODate(addDays(startOfWeek(new Date(), 1), 13)));
  const [choices, setChoices] = useState<Record<ID, WindowChoice>>(() => {
    const init: Record<ID, WindowChoice> = {};
    for (const w of windows) {
      const o = existing?.windows.find((x) => x.windowId === w.id);
      const base = o && o.rules.length ? o.rules : w.rules;
      init[w.id] = { choice: !o ? 'normal' : o.rules.length ? 'custom' : 'closed', ranges: rulesToRanges(base) };
    }
    return init;
  });

  const choiceOf = (id: ID): WindowChoice => choices[id] ?? { choice: 'normal', ranges: [] };
  const setChoice = (id: ID, next: Partial<WindowChoice>) => setChoices((c) => ({ ...c, [id]: { ...choiceOf(id), ...next } }));

  const rulesFor = (id: ID): WindowRule[] | null => {
    const c = choiceOf(id);
    if (c.choice === 'normal') return null;
    return c.choice === 'closed' ? [] : rangesToRules(c.ranges);
  };

  const datesOk = Boolean(from && to && from <= to);
  const anyChange = sorted.some((w) => choiceOf(w.id).choice !== 'normal');
  const customOk = sorted.every((w) => choiceOf(w.id).choice !== 'custom' || rangesToRules(choiceOf(w.id).ranges).length > 0);
  const canSave = name.trim().length > 0 && datesOk && anyChange && customOk;

  const save = () => {
    if (!canSave) return;
    const pid = periodId ?? crypto.randomUUID();
    for (const w of windows) {
      const kept = (w.overrides ?? []).filter((o) => o.periodId !== pid);
      const rules = rulesFor(w.id);
      const overrides: WindowOverride[] = rules ? [...kept, { periodId: pid, name: name.trim(), from, to, rules }] : kept;
      if (JSON.stringify(overrides) !== JSON.stringify(w.overrides ?? [])) saveWindow({ ...w, overrides });
    }
    showToast({ message: periodId ? 'Période modifiée' : 'Période ajoutée' });
    onClose();
  };

  const remove = () => {
    if (!periodId) return;
    const before = windows.filter((w) => (w.overrides ?? []).some((o) => o.periodId === periodId));
    for (const w of before) saveWindow({ ...w, overrides: (w.overrides ?? []).filter((o) => o.periodId !== periodId) });
    showToast({ message: 'Période supprimée', action: { label: 'Annuler', run: () => before.forEach((w) => saveWindow(w)) } });
    onClose();
  };

  return (
    <Sheet title="Période spéciale" onClose={onClose}>
      <label htmlFor={ids.name} className="sr-only">
        Nom de la période
      </label>
      <input
        id={ids.name}
        className="text-input text-input--title"
        placeholder="Vacances"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus={!periodId}
      />
      <p style={{ margin: '4px 0 8px', fontSize: 14, color: 'var(--muted)' }}>
        Pendant ces jours, ces horaires remplacent les horaires habituels.
      </p>

      <Field label="Du" htmlFor={ids.from}>
        <input
          id={ids.from}
          type="date"
          value={from}
          onChange={(e) => {
            const v = e.target.value;
            setFrom(v);
            if (v && to && to < v) setTo(v);
          }}
        />
      </Field>
      <Field label="Au" htmlFor={ids.to}>
        <input id={ids.to} type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
      </Field>

      <h3 className="section-label" style={{ margin: '20px 0 0' }}>
        Horaires pendant la période
      </h3>
      {sorted.map((w) => {
        const c = choiceOf(w.id);
        return (
          <div key={w.id} style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>{w.name}</span>
              <Segmented<Choice>
                label={`Horaires « ${w.name} » pendant la période`}
                value={c.choice}
                onChange={(choice) => setChoice(w.id, { choice, ranges: c.ranges.length ? c.ranges : rulesToRanges(w.rules) })}
                options={[
                  { value: 'normal', label: 'Normal' },
                  { value: 'closed', label: 'Fermé' },
                  { value: 'custom', label: 'Autre' },
                ]}
              />
            </div>
            {c.choice === 'custom' && <RangesEditor ranges={c.ranges} onChange={(ranges) => setChoice(w.id, { ranges })} />}
          </div>
        );
      })}

      <div className="sheet__actions">
        <button type="button" className="btn btn--primary btn--block" onClick={save} disabled={!canSave}>
          Enregistrer
        </button>
        {periodId && (
          <button type="button" className="btn btn--danger btn--block" onClick={remove}>
            Supprimer la période
          </button>
        )}
      </div>
    </Sheet>
  );
}
