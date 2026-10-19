/** Mode Listes : les listes / projets, puis les tâches d'une liste. */

import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import type { ID } from '../core/types';
import { formatDuration } from '../core/time';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { Dot, Fab, Header, useNow } from '../ui/kit';
import { NEUTRAL_TONE } from '../ui/palette';
import { IconChevronLeft, IconChevronRight, IconPlus } from '../ui/icons';
import { Collapsible, LIST_STYLE, TaskRow, plannedLabel, usePlanIndex } from './TaskRow';

/** Identifiant de la pseudo-liste des tâches sans liste. */
export const NO_LIST = '__none__';

export function ListsMode() {
  const { openListId } = useNav();
  return openListId ? <ListDetail id={openListId} /> : <ListOverview />;
}

function ListOverview() {
  const { projects, tasks } = useStore();
  const { openSheet, setOpenListId } = useNav();

  const lists = useMemo(() => projects.filter((p) => !p.archived).sort((a, b) => a.order - b.order), [projects]);
  const known = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);
  const todoCount = (id: ID) =>
    tasks.filter((t) => t.status === 'todo' && (id === NO_LIST ? !t.projectId || !known.has(t.projectId) : t.projectId === id)).length;
  const hasOrphans = tasks.some((t) => !t.projectId || !known.has(t.projectId));

  const rows = [
    ...lists.map((p) => ({ id: p.id, name: p.name, color: p.color })),
    ...(hasOrphans ? [{ id: NO_LIST, name: 'Sans liste', color: NEUTRAL_TONE.dot }] : []),
  ];

  return (
    <>
      <Header />
      <div className="title-row">
        <h1 className="title">Listes</h1>
        <button type="button" className="icon-btn icon-btn--card" aria-label="Nouvelle liste" onClick={() => openSheet({ kind: 'project' })}>
          <IconPlus />
        </button>
      </div>

      {rows.length ? (
        <ul className="stack" style={{ ...LIST_STYLE, marginTop: 20 }}>
          {rows.map((r) => {
            const count = todoCount(r.id);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  className="row"
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => setOpenListId(r.id)}
                  aria-label={`${r.name}, ${count} à faire`}
                >
                  <Dot color={r.color} large />
                  <span className="row__title">{r.name}</span>
                  <span className="row__meta">{count}</span>
                  <IconChevronRight size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty">Aucune liste. Crée-en une avec +</p>
      )}
    </>
  );
}

function ListDetail({ id }: { id: ID }) {
  const { projects, tasks, addTask } = useStore();
  const { openSheet, setOpenListId } = useNav();
  const now = useNow(60_000);
  const index = usePlanIndex();
  const inputId = useId();
  const [draft, setDraft] = useState('');

  const isNone = id === NO_LIST;
  const project = isNone ? undefined : projects.find((p) => p.id === id);
  const missing = !isNone && !project;

  // Liste supprimée entre-temps : retour à la vue d'ensemble.
  useEffect(() => {
    if (missing) setOpenListId(null);
  }, [missing, setOpenListId]);

  const known = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);
  const inList = useMemo(
    () => tasks.filter((t) => (isNone ? !t.projectId || !known.has(t.projectId) : t.projectId === id)),
    [tasks, isNone, known, id],
  );

  const todo = useMemo(() => {
    const order = (taskId: ID) => index.first.get(taskId)?.start.getTime() ?? Number.MAX_SAFE_INTEGER;
    return inList
      .filter((t) => t.status === 'todo')
      .sort((a, b) => order(a.id) - order(b.id) || a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
  }, [inList, index]);

  const done = useMemo(
    () => inList.filter((t) => t.status === 'done').sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')),
    [inList],
  );

  if (missing) return null;

  const name = project?.name ?? 'Sans liste';
  const color = project?.color ?? NEUTRAL_TONE.dot;
  const remainingMin = todo.reduce((sum, t) => sum + t.durationMin, 0);
  const subtitle = todo.length ? `${todo.length} à faire · ${formatDuration(remainingMin)}` : 'Rien à faire';
  const projectId = project?.id;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    addTask({ title, projectId });
    setDraft('');
  };

  return (
    <>
      <Header />
      <button type="button" className="link-btn" style={{ marginLeft: -8, marginTop: -12 }} onClick={() => setOpenListId(null)}>
        <IconChevronLeft size={18} />
        <span>Listes</span>
      </button>
      <div className="title-row" style={{ marginTop: 4 }}>
        <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <Dot color={color} large />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        </h1>
        {project && (
          <button type="button" className="pill pill--sm" onClick={() => openSheet({ kind: 'project', id: project.id })}>
            Modifier
          </button>
        )}
      </div>
      <p className="subtitle">{subtitle}</p>

      <ul className="stack" style={{ ...LIST_STYLE, marginTop: 20 }}>
        {todo.map((task) => (
          <TaskRow key={task.id} task={task} meta={plannedLabel(index, task.id, now)} late={index.late.has(task.id)} />
        ))}
      </ul>

      <form onSubmit={submit} style={{ marginTop: todo.length ? 8 : 0 }}>
        <label htmlFor={inputId} className="sr-only">
          Ajouter une tâche à {name}
        </label>
        <input
          id={inputId}
          className="text-input"
          placeholder="Ajouter une tâche…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          enterKeyHint="done"
          autoComplete="off"
        />
      </form>

      <Collapsible label="Fait" count={done.length}>
        {done.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </Collapsible>

      <Fab onClick={() => openSheet({ kind: 'task', defaults: { projectId } })} label="Ajouter une tâche" />
    </>
  );
}
