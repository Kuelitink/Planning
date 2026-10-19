/** Feuille d'un cycle : dates, durées, exclusion des prédictions, note, ce qui a été noté. */

import { useId, useMemo, useState } from 'react';
import type { ISODate } from '../core/types';
import { addDaysISO, MAX_CYCLE, MIN_CYCLE } from '../core/cycle';
import { categoryLabel, optionLabel } from '../core/cycleCatalog';
import { parseISODate } from '../core/time';
import { useCycle } from '../state/cycle';
import { useStore } from '../state/store';
import { Field, Sheet } from '../ui/kit';
import { formatDayLong } from '../ui/format';
import { plural } from '../modes/cycle/shared';
import '../modes/cycle.css';

export function CycleSheet({ start, onClose }: { start: ISODate; onClose: () => void }) {
  const { setCycleMark } = useStore();
  const { forecast: fc, byDate, today } = useCycle();
  const cycle = fc.cycles.find((c) => c.start === start);
  const [note, setNote] = useState(cycle?.note ?? '');
  const ids = { excluded: useId(), note: useId() };

  const tracked = useMemo(() => {
    if (!cycle) return [];
    const end = cycle.next ? addDaysISO(cycle.next, -1) : today;
    const counts = new Map<string, { category: string; option: string; n: number }>();
    for (const d of byDate.values()) {
      if (d.date < cycle.start || d.date > end) continue;
      for (const [category, options] of Object.entries(d.options)) {
        for (const option of options) {
          const key = `${category}.${option}`;
          const c = counts.get(key) ?? { category, option, n: 0 };
          c.n++;
          counts.set(key, c);
        }
      }
    }
    return [...counts.values()].sort((a, b) => b.n - a.n);
  }, [cycle, byDate, today]);

  if (!cycle) {
    return (
      <Sheet title="Cycle" onClose={onClose}>
        <p className="empty">Ce cycle n'existe plus (règles modifiées).</p>
      </Sheet>
    );
  }

  const end = cycle.next ? addDaysISO(cycle.next, -1) : undefined;
  const saveNote = () => {
    if (note.trim() !== (cycle.note ?? '')) setCycleMark(start, { note });
  };

  return (
    <Sheet
      title={`Cycle du ${parseISODate(start).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`}
      onClose={onClose}
    >
      <div>
        <Field label="Début">{formatDayLong(parseISODate(start))}</Field>
        <Field label="Fin">{end ? formatDayLong(parseISODate(end)) : 'En cours'}</Field>
        <Field label="Durée">{cycle.length !== undefined ? plural(cycle.length, 'jour') : `Jour ${fc.cycleDay}`}</Field>
        <Field label="Règles">{plural(cycle.periodDays, 'jour')}</Field>
        <Field label="Exclure des prédictions" htmlFor={ids.excluded}>
          <input
            id={ids.excluded}
            type="checkbox"
            role="switch"
            className="switch"
            checked={cycle.excluded}
            onChange={(e) => setCycleMark(start, { excluded: e.target.checked, note })}
          />
        </Field>
      </div>
      {cycle.atypical && (
        <p className="cy-foot">
          Cycle atypique ({cycle.length! < MIN_CYCLE ? `moins de ${MIN_CYCLE}` : `plus de ${MAX_CYCLE}`} jours) : il n'est pas compté dans
          les moyennes. Si ces règles n'en étaient pas, corrige les jours notés.
        </p>
      )}
      <p className="cy-foot" style={{ marginTop: 4 }}>
        Exclure un cycle inhabituel (maladie, stress, traitement, oubli de saisie) le retire des moyennes et des prédictions.
      </p>

      <h3 className="section-label" style={{ margin: '20px 0 8px 2px' }}>
        <label htmlFor={ids.note}>Note</label>
      </h3>
      <textarea
        id={ids.note}
        className="cy-note"
        placeholder="Ex. période de stress, traitement…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={saveNote}
      />

      {tracked.length > 0 && (
        <>
          <h3 className="section-label" style={{ margin: '20px 0 8px 2px' }}>
            Noté pendant ce cycle
          </h3>
          <div className="cy-chips">
            {tracked.map((t) => (
              <span key={`${t.category}.${t.option}`} className="cy-tag">
                {t.category === 'pms' ? 'SPM' : optionLabel(t.category, t.option)}
                <span style={{ color: 'var(--muted)' }}>
                  {t.category !== 'pms' && t.category !== 'tags' ? `· ${categoryLabel(t.category)} ` : ''}×{t.n}
                </span>
              </span>
            ))}
          </div>
        </>
      )}

      <div className="sheet__actions">
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => {
            saveNote();
            onClose();
          }}
        >
          Terminé
        </button>
      </div>
    </Sheet>
  );
}
