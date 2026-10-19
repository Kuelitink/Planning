/**
 * Feuille « Noter un jour » du mode Cycle : règles, puis les catégories suivies (douleur,
 * émotions, sommeil…), comme dans Clue. Chaque choix est enregistré tout de suite ; les
 * champs texte et nombres le sont en quittant le champ ou la feuille.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { Flow, ISODate } from '../core/types';
import type { DayData } from '../core/clue';
import { addDaysISO } from '../core/cycle';
import {
  CATEGORIES,
  CATEGORY_BY_KEY,
  FLOW_OPTIONS,
  SEVERITY_OPTIONS,
  categoryLabel,
  optionLabel,
  type CycleCategory,
} from '../core/cycleCatalog';
import { useCycle } from '../state/cycle';
import { useStore } from '../state/store';
import { Segmented, Sheet } from '../ui/kit';
import { IconChevronLeft, IconChevronRight, IconDrop, IconPlus } from '../ui/icons';
import { dayShort } from '../modes/cycle/shared';
import '../modes/cycle.css';

const empty = (date: ISODate): DayData => ({ date, options: {} });

/** Catégorie inconnue du catalogue (import d'une version plus récente de Clue). */
const unknownCategory = (key: string): CycleCategory => ({
  key,
  label: categoryLabel(key),
  color: '#7A8290',
  kind: 'options',
  options: [],
});

const same = (a: DayData | undefined, b: DayData) => JSON.stringify(a ?? empty(b.date)) === JSON.stringify(b);

function strip(day: DayData & { id?: string; createdAt?: string; updatedAt?: string }): DayData {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = day;
  return rest;
}

export function CycleDaySheet({ date: initialDate, onClose }: { date: ISODate; onClose: () => void }) {
  const { saveCycleDay, updateCycleSettings } = useStore();
  const { settings, today, byDate, forecast: fc } = useCycle();
  const [date, setDate] = useState(initialDate);
  const stored = byDate.get(date);
  const [draft, setDraft] = useState<DayData>(() => (stored ? strip(stored) : empty(date)));
  const [more, setMore] = useState(false);
  const [newTag, setNewTag] = useState('');
  const latest = useRef(draft);
  latest.current = draft;
  const ids = { bbt: useId(), weight: useId(), note: useId(), tag: useId() };

  /** Enregistre si le jour a changé. */
  const save = (day: DayData) => {
    const current = byDate.get(day.date);
    if (!same(current ? strip(current) : undefined, day)) saveCycleDay(day);
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  // Enregistre le brouillon en fermant la feuille (champs texte en cours de saisie).
  useEffect(() => () => saveRef.current(latest.current), []);

  const commit = (next: DayData) => {
    setDraft(next);
    save(next);
  };

  const goTo = (d: ISODate) => {
    save(latest.current);
    const s = byDate.get(d);
    setDate(d);
    setDraft(s ? strip(s) : empty(d));
  };

  const setFlow = (flow: Flow) => commit({ ...draft, flow: draft.flow === flow ? undefined : flow });

  const toggle = (category: string, option: string) => {
    const list = draft.options[category] ?? [];
    const on = !list.includes(option);
    const nextList = on ? [...list, option] : list.filter((o) => o !== option);
    const options = { ...draft.options };
    if (nextList.length) options[category] = nextList;
    else delete options[category];
    let severity = draft.severity;
    if (!on && severity?.[`${category}.${option}`]) {
      const { [`${category}.${option}`]: _drop, ...rest } = severity;
      severity = Object.keys(rest).length ? rest : undefined;
    }
    commit({ ...draft, options, severity });
  };

  const setSeverity = (key: string, value: string) => commit({ ...draft, severity: { ...draft.severity, [key]: value } });

  const addTag = () => {
    const tag = newTag.trim();
    if (!tag) return;
    if (!settings.customTags.includes(tag)) updateCycleSettings({ customTags: [...settings.customTags, tag] });
    setNewTag('');
    if (!(draft.options.tags ?? []).includes(tag)) toggle('tags', tag);
  };

  // Catégories affichées : celles suivies, puis celles notées ce jour-là, puis (sur demande) les autres.
  const shownKeys = [...settings.categories];
  for (const k of Object.keys(draft.options)) if (!shownKeys.includes(k)) shownKeys.push(k);
  if (draft.sleepMin !== undefined && !shownKeys.includes('sleep_duration')) shownKeys.push('sleep_duration');
  if (draft.bbt !== undefined && !shownKeys.includes('bbt')) shownKeys.push('bbt');
  if (draft.weightKg !== undefined && !shownKeys.includes('weight')) shownKeys.push('weight');
  if (draft.note && !shownKeys.includes('notes')) shownKeys.push('notes');
  const shown = shownKeys.map((k) => CATEGORY_BY_KEY.get(k) ?? unknownCategory(k));
  const others = CATEGORIES.filter((c) => !shownKeys.includes(c.key));

  const cycleDay = (() => {
    const c = [...fc.cycles].reverse().find((x) => x.start <= date);
    return c && (!c.next || date < c.next) ? Math.floor((Date.parse(date) - Date.parse(c.start)) / 86_400_000) + 1 : undefined;
  })();

  const renderCategory = (cat: CycleCategory) => {
    if (cat.kind === 'minutes') {
      const min = draft.sleepMin;
      const h = min === undefined ? '' : String(Math.floor(min / 60));
      const m = min === undefined ? 0 : min % 60;
      const minuteOptions = [0, 15, 30, 45].includes(m) ? [0, 15, 30, 45] : [0, 15, 30, 45, m].sort((a, b) => a - b);
      const setSleep = (hours: string, minutes: number) =>
        commit({ ...draft, sleepMin: hours === '' ? undefined : Number(hours) * 60 + minutes });
      return (
        <div className="cy-measure">
          <select aria-label="Heures de sommeil" value={h} onChange={(e) => setSleep(e.target.value, m)}>
            <option value="">—</option>
            {Array.from({ length: 15 }, (_, i) => (
              <option key={i} value={i}>
                {i} h
              </option>
            ))}
          </select>
          <select aria-label="Minutes de sommeil" value={m} disabled={h === ''} onChange={(e) => setSleep(h, Number(e.target.value))}>
            {minuteOptions.map((x) => (
              <option key={x} value={x}>
                {String(x).padStart(2, '0')} min
              </option>
            ))}
          </select>
        </div>
      );
    }
    if (cat.kind === 'bbt' || cat.kind === 'weight') {
      const field = cat.kind === 'bbt' ? 'bbt' : 'weightKg';
      const id = cat.kind === 'bbt' ? ids.bbt : ids.weight;
      return (
        <div className="cy-measure">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            step={cat.kind === 'bbt' ? 0.01 : 0.1}
            min={cat.kind === 'bbt' ? 34 : 20}
            max={cat.kind === 'bbt' ? 42 : 300}
            aria-label={cat.label}
            placeholder={cat.kind === 'bbt' ? '36,50' : '60,0'}
            value={draft[field] ?? ''}
            onChange={(e) => setDraft({ ...draft, [field]: e.target.value === '' ? undefined : Number(e.target.value) })}
            onBlur={() => save(latest.current)}
          />
          <span>{cat.kind === 'bbt' ? '°C' : 'kg'}</span>
        </div>
      );
    }
    if (cat.kind === 'text') {
      return (
        <textarea
          id={ids.note}
          className="cy-note"
          aria-label="Notes"
          placeholder="Une note sur ta journée"
          value={draft.note ?? ''}
          onChange={(e) => setDraft({ ...draft, note: e.target.value || undefined })}
          onBlur={() => save(latest.current)}
        />
      );
    }
    const selected = draft.options[cat.key] ?? [];
    const options =
      cat.key === 'tags'
        ? [...new Set([...settings.customTags, ...selected])].map((t) => ({ key: t, label: t }))
        : [
            ...cat.options,
            ...selected.filter((o) => !cat.options.some((x) => x.key === o)).map((o) => ({ key: o, label: optionLabel(cat.key, o) })),
          ];
    return (
      <>
        <div className="cy-chips" role="group" aria-label={cat.label}>
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              className="chip"
              aria-pressed={selected.includes(o.key)}
              onClick={() => toggle(cat.key, o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
        {cat.key === 'tags' && (
          <form
            className="cy-measure"
            style={{ marginTop: 10 }}
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
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              style={{ flex: 1, width: 'auto', minWidth: 0 }}
            />
            <button type="submit" className="icon-btn icon-btn--card" aria-label="Ajouter l'étiquette" disabled={!newTag.trim()}>
              <IconPlus size={18} />
            </button>
          </form>
        )}
        {cat.key === 'pain' &&
          selected.map((o) => {
            const key = `pain.${o}`;
            return (
              <div key={key} className="cy-severity">
                <span>{optionLabel('pain', o)}</span>
                <Segmented<string>
                  label={`Intensité : ${optionLabel('pain', o)}`}
                  value={draft.severity?.[key] ?? ''}
                  onChange={(v) => setSeverity(key, v)}
                  options={SEVERITY_OPTIONS.map((s) => ({ value: s.key, label: s.label }))}
                />
              </div>
            );
          })}
      </>
    );
  };

  const title = `${dayShort(date)}${cycleDay ? ` · J${cycleDay}` : ''}`;

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="cy-daynav">
        <button type="button" className="icon-btn" aria-label="Jour précédent" onClick={() => goTo(addDaysISO(date, -1))}>
          <IconChevronLeft />
        </button>
        <span className="cy-daynav__label">{date === today ? "Aujourd'hui" : date === addDaysISO(today, -1) ? 'Hier' : ' '}</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Jour suivant"
          disabled={date >= today}
          onClick={() => goTo(addDaysISO(date, 1))}
        >
          <IconChevronRight />
        </button>
      </div>

      <section className="cy-cat">
        <h3 className="cy-cat__title">
          <span className="dot" style={{ background: 'var(--cy-period)' }} aria-hidden="true" />
          Règles
        </h3>
        <div className="cy-flow" role="group" aria-label="Règles">
          {FLOW_OPTIONS.map((o, i) => (
            <button key={o.key} type="button" aria-pressed={draft.flow === o.key} onClick={() => setFlow(o.key)}>
              <span style={{ display: 'flex', gap: 1 }} aria-hidden="true">
                {Array.from({ length: i + 1 }, (_, k) => (
                  <IconDrop key={k} size={12} />
                ))}
              </span>
              {o.label}
            </button>
          ))}
        </div>
      </section>

      {shown.map((cat) => (
        <section key={cat.key} className="cy-cat">
          <h3 className="cy-cat__title">
            <span className="dot" style={{ background: cat.color }} aria-hidden="true" />
            {cat.label}
          </h3>
          {renderCategory(cat)}
        </section>
      ))}

      {others.length > 0 && (
        <>
          <button type="button" className="link-btn" style={{ marginTop: 8 }} aria-expanded={more} onClick={() => setMore((v) => !v)}>
            {more ? 'Moins de catégories' : `Plus de catégories (${others.length})`}
          </button>
          {more &&
            others.map((cat) => (
              <section key={cat.key} className="cy-cat">
                <h3 className="cy-cat__title">
                  <span className="dot" style={{ background: cat.color }} aria-hidden="true" />
                  {cat.label}
                </h3>
                {renderCategory(cat)}
              </section>
            ))}
        </>
      )}

      <div className="sheet__actions">
        <button type="button" className="btn btn--primary btn--block" onClick={onClose}>
          Terminé
        </button>
      </div>
    </Sheet>
  );
}
