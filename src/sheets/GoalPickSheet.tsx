/**
 * Choisir les tâches de la checklist d'une période : les plus urgentes d'abord, ou par
 * recherche (titre ou liste, sans tenir compte des accents). Toucher une tâche
 * l'ajoute ou la retire tout de suite ; un titre introuvable peut être créé.
 */

import { useId, useMemo, useState } from 'react';
import type { GoalPeriod, ISODate, Task } from '../core/types';
import { parseDeadline } from '../core/scheduler';
import { DAY } from '../core/time';
import { useStore } from '../state/store';
import { byUrgency, fold, isLate, matchesQuery, pickedTaskIds } from '../state/urgency';
import { Dot, Sheet } from '../ui/kit';
import { IconCheck, IconFlag, IconPlus } from '../ui/icons';
import { PRIORITY_COLOR } from '../ui/palette';
import { plannedLabel, shortDeadline, usePlanIndex, type PlanIndex } from '../modes/TaskRow';
import { periodLabel } from '../modes/ChecklistMode';

/** Une échéance à moins de 3 jours s'affiche à la place du créneau prévu. */
const SOON_MS = 3 * DAY;

interface Meta {
  text: string;
  late: boolean;
  deadline: boolean;
}

function metaFor(task: Task, index: PlanIndex, late: boolean, now: Date): Meta | undefined {
  if (task.deadline && (late || parseDeadline(task.deadline).getTime() - now.getTime() < SOON_MS)) {
    return { text: shortDeadline(task.deadline, now), late, deadline: true };
  }
  const planned = plannedLabel(index, task.id, now);
  return planned ? { text: planned, late: false, deadline: false } : undefined;
}

function SearchIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

const rowStyle = (on: boolean) =>
  ({
    width: '100%',
    minHeight: 56,
    padding: '8px 12px',
    border: 'none',
    borderRadius: 14,
    background: on ? 'var(--picked)' : 'transparent',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    textAlign: 'left',
  }) as const;

export function GoalPickSheet({ period, periodStart, onClose }: { period: GoalPeriod; periodStart: ISODate; onClose: () => void }) {
  const { tasks, projects, goals, plan, addTask, pickTask, unpickTask } = useStore();
  const index = usePlanIndex();
  const searchId = useId();
  const [query, setQuery] = useState('');
  const now = new Date();

  const picked = new Set(pickedTaskIds(goals, period, periodStart));
  const projectOf = (id?: string) => (id ? projects.find((p) => p.id === id) : undefined);
  const urgent = useMemo(() => byUrgency(tasks, plan, new Date()), [tasks, plan]);

  const q = query.trim();
  const shown = q ? urgent.filter((t) => matchesQuery(t.title, q) || matchesQuery(projectOf(t.projectId)?.name ?? '', q)) : urgent;
  const canCreate = q !== '' && !tasks.some((t) => fold(t.title.trim()) === fold(q));

  const toggle = (task: Task) =>
    picked.has(task.id) ? unpickTask(task.id, period, periodStart) : pickTask(task.id, period, periodStart);

  const create = () => {
    const first = projects.filter((p) => !p.archived).sort((a, b) => a.order - b.order)[0];
    const task = addTask({ title: q, projectId: first?.id });
    pickTask(task.id, period, periodStart);
    setQuery('');
  };

  return (
    <Sheet title="Ajouter à la checklist" onClose={onClose}>
      <p className="subtitle" style={{ margin: '-4px 0 12px' }}>
        {periodLabel(period, periodStart, now)}
      </p>

      <div style={{ position: 'sticky', top: -8, zIndex: 1, background: 'var(--card)', padding: '8px 0 12px' }}>
        <label htmlFor={searchId} className="sr-only">
          Rechercher une tâche
        </label>
        <span style={{ position: 'absolute', left: 14, top: 8 + 16, color: 'var(--muted)', display: 'inline-flex' }}>
          <SearchIcon />
        </span>
        <input
          id={searchId}
          type="search"
          className="text-input"
          placeholder="Rechercher une tâche…"
          value={query}
          enterKeyHint="search"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canCreate && shown.length === 0) create();
          }}
          style={{ paddingLeft: 44, border: 'none', background: 'var(--bg)' }}
        />
      </div>

      {canCreate && (
        <button type="button" onClick={create} style={{ ...rowStyle(false), fontWeight: 600 }}>
          <span style={{ width: 24, display: 'inline-flex', justifyContent: 'center' }}>
            <IconPlus size={18} />
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Créer « {q} »
          </span>
        </button>
      )}

      {shown.length > 0 && <p className="section-label" style={{ marginTop: canCreate ? 16 : 4 }}>{q ? 'Résultats' : 'Les plus urgentes'}</p>}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {shown.map((t) => {
          const on = picked.has(t.id);
          const late = isLate(t, plan, now);
          const meta = metaFor(t, index, late, now);
          const project = projectOf(t.projectId);
          return (
            <li key={t.id}>
              <button type="button" aria-pressed={on} onClick={() => toggle(t)} style={rowStyle(on)}>
                <span
                  aria-hidden="true"
                  style={{ width: 12, height: 12, flex: 'none', borderRadius: 3, border: `2px solid ${PRIORITY_COLOR[t.priority]}` }}
                />
                <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.title}
                </span>
                {meta && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 13,
                      whiteSpace: 'nowrap',
                      color: meta.late ? 'var(--danger)' : 'var(--muted)',
                      fontWeight: meta.late ? 600 : 400,
                    }}
                  >
                    {meta.deadline && <IconFlag size={12} />}
                    {meta.text}
                  </span>
                )}
                {project && <Dot color={project.color} />}
                <span aria-hidden="true" style={{ width: 20, flex: 'none', display: 'inline-flex', justifyContent: 'center' }}>
                  {on && <IconCheck size={18} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {shown.length === 0 && !canCreate && (
        <p className="empty" style={{ padding: '24px 8px' }}>
          {q ? 'Aucune tâche trouvée.' : 'Aucune tâche à faire. Tape un titre pour en créer une.'}
        </p>
      )}

      <div style={{ position: 'sticky', bottom: 0, background: 'var(--card)', paddingTop: 12, marginTop: 12 }}>
        <button type="button" className="btn btn--primary btn--block" onClick={onClose}>
          Terminé ({picked.size})
        </button>
      </div>
    </Sheet>
  );
}
