/** Feuille Horaires : un nom et des plages (jours + heures), converties en règles pour le moteur. */

import { useId, useState } from 'react';
import type { ID } from '../core/types';
import { toISODate } from '../core/time';
import { useStore } from '../state/store';
import { Sheet } from '../ui/kit';
import { RangesEditor, rangesToRules, rulesToRanges, summarizeHours, type Range } from './RangesEditor';
import { formatPeriodDates } from './PeriodSheet';

export { summarizeRules } from './RangesEditor';

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
  const today = toISODate(new Date());
  const upcoming = (win?.overrides ?? []).filter((o) => o.to >= today).sort((a, b) => a.from.localeCompare(b.from));

  const save = () => {
    if (!canSave) return;
    // `...win` conserve les périodes spéciales de la fenêtre.
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

      <RangesEditor ranges={ranges} onChange={setRanges} />

      {upcoming.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 className="section-label" style={{ margin: '0 0 4px' }}>
            Périodes spéciales
          </h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {upcoming.map((o) => (
              <li key={o.periodId} style={{ fontSize: 14, color: 'var(--muted)', padding: '4px 0' }}>
                {o.name} · {formatPeriodDates(o.from, o.to)} · {o.rules.length ? summarizeHours(o.rules) : 'fermé'}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sheet__actions">
        <button type="button" className="btn btn--primary btn--block" onClick={save} disabled={!canSave}>
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
