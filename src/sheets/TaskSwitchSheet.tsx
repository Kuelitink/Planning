/**
 * « Changer de tâche » (mode Chrono) : les tâches les plus probables d'abord — checklist du
 * jour dans son ordre, tâches prévues aujourd'hui, checklist de la semaine, puis les plus
 * urgentes —, et une recherche sur toutes les tâches à faire.
 */

import { useId, useMemo, useState } from 'react';
import type { ID, Task } from '../core/types';
import { formatDuration, formatHM, isSameDay, MINUTE } from '../core/time';
import { useStore } from '../state/store';
import { byUrgency, checklistPicks, matchesQuery } from '../state/urgency';
import { Dot, Sheet } from '../ui/kit';
import { toneOf } from '../ui/palette';

/** Nombre de propositions sans recherche. */
const SUGGESTED = 6;

const PERIOD_REASON = { day: 'Checklist du jour', week: 'Checklist de la semaine', month: 'Checklist du mois' } as const;

export function TaskSwitchSheet({ currentId, onPick, onClose }: { currentId?: ID; onPick: (id: ID) => void; onClose: () => void }) {
  const { tasks, projects, goals, plan, settings, timeSpent } = useStore();
  const searchId = useId();
  const [query, setQuery] = useState('');
  const now = new Date();

  const projectOf = (id?: ID) => (id ? projects.find((p) => p.id === id) : undefined);

  /** Propositions, chacune avec sa raison. */
  const suggestions = useMemo(() => {
    const at = new Date();
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const out: { task: Task; why: string }[] = [];
    const seen = new Set<ID>(currentId ? [currentId] : []);
    const add = (task: Task | undefined, why: string) => {
      if (!task || task.status !== 'todo' || seen.has(task.id)) return;
      seen.add(task.id);
      out.push({ task, why });
    };
    const picks = [...checklistPicks(goals, at, settings.weekStartsOn)].sort(
      ([, a], [, b]) => a.end - b.end || a.index - b.index,
    );
    for (const [id, pick] of picks) if (pick.period === 'day') add(byId.get(id), `${PERIOD_REASON.day} · ${pick.index + 1}${pick.index ? 'e' : 're'}`);
    for (const b of [...plan.blocks].sort((x, y) => x.start.getTime() - y.start.getTime())) {
      if (isSameDay(b.start, at)) add(byId.get(b.taskId), `Prévue à ${formatHM(b.start)}`);
    }
    for (const [id, pick] of picks) if (pick.period !== 'day') add(byId.get(id), PERIOD_REASON[pick.period]);
    for (const t of byUrgency(tasks, plan, at)) add(t, projectOf(t.projectId)?.name ?? 'Sans liste');
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, goals, plan, settings.weekStartsOn, currentId, projects]);

  const q = query.trim();
  const shown = q
    ? suggestions.filter(({ task }) => matchesQuery(task.title, q) || matchesQuery(projectOf(task.projectId)?.name ?? '', q))
    : suggestions.slice(0, SUGGESTED);

  return (
    <Sheet title="Changer de tâche" onClose={onClose}>
      <label htmlFor={searchId} className="sr-only">
        Rechercher une tâche
      </label>
      <input
        id={searchId}
        type="search"
        className="text-input"
        placeholder="Rechercher une tâche…"
        value={query}
        enterKeyHint="search"
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
        style={{ border: 'none', background: 'var(--bg)' }}
      />
      <p className="section-label" style={{ marginTop: 16 }}>
        {q ? 'Résultats' : 'Les plus probables'}
      </p>
      {shown.length ? (
        <ul className="switch-list">
          {shown.map(({ task, why }) => {
            const spentMin = Math.floor(timeSpent(task.id, now) / MINUTE);
            return (
              <li key={task.id}>
                <button type="button" className="switch-list__row" onClick={() => onPick(task.id)}>
                  <Dot color={toneOf(projectOf(task.projectId)?.color).dot} />
                  <span className="switch-list__main">
                    <span className="switch-list__title">{task.title}</span>
                    <span className="switch-list__why">{why}</span>
                  </span>
                  {spentMin > 0 && <span className="switch-list__time">{formatDuration(spentMin)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty" style={{ padding: '24px 8px' }}>
          {q ? 'Aucune tâche trouvée.' : 'Aucune tâche à faire.'}
        </p>
      )}
    </Sheet>
  );
}
