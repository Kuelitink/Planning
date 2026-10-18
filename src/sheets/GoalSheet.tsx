/** Feuille Objectif : titre, période, objectif chiffré, tâches liées (accès rapide au chrono). */

import { useId, useState } from 'react';
import type { Goal, GoalPeriod, ID, ISODate } from '../core/types';
import { periodStartFor } from '../core/goals';
import { parseISODate } from '../core/time';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { Dot, Field, Segmented, Sheet } from '../ui/kit';
import { IconX } from '../ui/icons';
import { toneOf } from '../ui/palette';

const PERIODS: { value: GoalPeriod; label: string }[] = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
];

/** Comparaison sans casse ni accents. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function GoalSheet({
  id,
  period: initialPeriod,
  periodStart: initialStart,
  onClose,
}: {
  id?: ID;
  period?: GoalPeriod;
  periodStart?: ISODate;
  onClose: () => void;
}) {
  const { goals, tasks, projects, settings, addGoal, saveGoal, deleteGoal } = useStore();
  const { showToast } = useNav();
  const goal = id ? goals.find((g) => g.id === id) : undefined;
  const ids = { title: useId(), target: useId(), search: useId(), targetOn: useId(), done: useId() };

  /** Date de référence : la période reste celle qui contient ce jour. */
  const [baseDate] = useState<Date>(() =>
    goal ? parseISODate(goal.periodStart) : initialStart ? parseISODate(initialStart) : new Date(),
  );
  const [title, setTitle] = useState(goal?.title ?? '');
  const [period, setPeriod] = useState<GoalPeriod>(goal?.period ?? initialPeriod ?? 'week');
  const [hasTarget, setHasTarget] = useState(goal?.target !== undefined && goal.target > 0);
  const [target, setTarget] = useState<number>(goal?.target ?? 3);
  const [taskIds, setTaskIds] = useState<ID[]>(goal?.taskIds ?? []);
  const [done, setDone] = useState(goal?.done ?? false);
  const [search, setSearch] = useState('');

  const colorOf = (projectId?: ID) => toneOf(projects.find((p) => p.id === projectId)?.color).dot;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const linked = taskIds.map((tid) => byId.get(tid)).filter((t) => t !== undefined);

  const q = fold(search.trim());
  const candidates = tasks
    .filter((t) => t.status === 'todo' && !taskIds.includes(t.id) && (!q || fold(t.title).includes(q)))
    .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, 'fr'))
    .slice(0, 8);

  const toggleLink = (tid: ID, on: boolean) =>
    setTaskIds((list) => (on ? (list.includes(tid) ? list : [...list, tid]) : list.filter((x) => x !== tid)));

  const canSave = title.trim().length > 0 && (!hasTarget || target > 0);

  const save = () => {
    if (!canSave) return;
    const fields = {
      title: title.trim(),
      period,
      periodStart: periodStartFor(period, baseDate, settings.weekStartsOn),
      taskIds,
      target: hasTarget ? Math.round(target) : undefined,
      progress: hasTarget && goal?.progress !== undefined ? Math.min(goal.progress, Math.round(target)) : undefined,
      done,
    };
    if (goal) saveGoal({ ...goal, ...fields });
    else addGoal({ ...fields, done: false });
    onClose();
  };

  const remove = () => {
    if (!goal) return;
    const copy: Goal = { ...goal };
    deleteGoal(goal.id);
    onClose();
    showToast({ message: 'Objectif supprimé', action: { label: 'Annuler', run: () => saveGoal(copy) } });
  };

  return (
    <Sheet title={goal ? 'Objectif' : 'Nouvel objectif'} onClose={onClose}>
      <label htmlFor={ids.title} className="sr-only">
        Titre de l'objectif
      </label>
      <input
        id={ids.title}
        className="text-input text-input--title"
        placeholder="Ex. Envoyer le rapport"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus={!goal}
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />

      <div style={{ marginTop: 8 }}>
        <Field label="Période">
          <Segmented<GoalPeriod> label="Période" value={period} onChange={setPeriod} options={PERIODS} />
        </Field>
        <Field label="Objectif chiffré" htmlFor={ids.targetOn}>
          <input
            id={ids.targetOn}
            type="checkbox"
            role="switch"
            className="switch"
            checked={hasTarget}
            onChange={(e) => setHasTarget(e.target.checked)}
          />
        </Field>
        {hasTarget && (
          <Field label="Nombre visé" htmlFor={ids.target}>
            <input
              id={ids.target}
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              value={Number.isFinite(target) ? target : ''}
              onChange={(e) => setTarget(Number(e.target.value))}
            />
          </Field>
        )}
        {goal && (
          <Field label="Atteint" htmlFor={ids.done}>
            <input id={ids.done} type="checkbox" role="switch" className="switch" checked={done} onChange={(e) => setDone(e.target.checked)} />
          </Field>
        )}
      </div>

      <h3 className="section-label" style={{ marginTop: 20 }}>
        Tâches liées
      </h3>
      {linked.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {linked.map((t) => (
            <li key={t.id} style={{ minHeight: 52, display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--line)' }}>
              <Dot color={colorOf(t.projectId)} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 15,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: t.status === 'done' ? 'var(--faint)' : 'var(--ink)',
                  textDecoration: t.status === 'done' ? 'line-through' : undefined,
                }}
              >
                {t.title}
              </span>
              <button type="button" className="icon-btn" aria-label={`Retirer « ${t.title} »`} onClick={() => toggleLink(t.id, false)}>
                <IconX size={18} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--muted)' }}>
          Lie des tâches pour les chronométrer d'ici en un geste.
        </p>
      )}

      <label htmlFor={ids.search} className="sr-only">
        Chercher une tâche à lier
      </label>
      <input
        id={ids.search}
        className="text-input"
        type="search"
        placeholder="Chercher une tâche…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginTop: 12 }}
      />
      <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
        {candidates.map((t) => (
          <li key={t.id}>
            <label style={{ minHeight: 52, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                className="check"
                checked={false}
                onChange={(e) => toggleLink(t.id, e.target.checked)}
              />
              <span style={{ flex: 1, minWidth: 0, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.title}
              </span>
              <Dot color={colorOf(t.projectId)} />
            </label>
          </li>
        ))}
        {!candidates.length && (
          <li style={{ padding: '12px 0', fontSize: 14, color: 'var(--muted)' }}>{q ? 'Aucune tâche trouvée.' : 'Aucune autre tâche à faire.'}</li>
        )}
      </ul>

      <div className="sheet__actions">
        <button type="button" className="btn btn--primary btn--block" onClick={save} disabled={!canSave} style={{ opacity: canSave ? 1 : 0.4 }}>
          Enregistrer
        </button>
        {goal && (
          <button type="button" className="btn btn--danger btn--block" onClick={remove}>
            Supprimer l'objectif
          </button>
        )}
      </div>
    </Sheet>
  );
}
