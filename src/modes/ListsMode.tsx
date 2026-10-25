/**
 * Mode Listes : les listes / projets, puis les tâches d'une liste, dans leur ordre (en haut =
 * la plus urgente, à priorité égale) : appui long + glisser pour réordonner, glisser à droite
 * pour une sous-tâche, comme dans la Checklist.
 */

import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import type { ID } from '../core/types';
import { formatDuration } from '../core/time';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { Dot, Fab, Header } from '../ui/kit';
import { NEUTRAL_TONE } from '../ui/palette';
import { IconChevronLeft, IconChevronRight, IconPlus } from '../ui/icons';
import { checklistRows, listChanges, listTopIds, type ChecklistRow } from '../core/checklist';
import { Collapsible, LIST_STYLE, TaskRow } from './TaskRow';
import { INDENT_PX, SortableTaskList } from './SortableTasks';

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
  const { projects, tasks, addTask, reorderTasks } = useStore();
  const { openSheet, setOpenListId } = useNav();
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
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const inList = useMemo(
    () => tasks.filter((t) => (isNone ? !t.projectId || !known.has(t.projectId) : t.projectId === id)),
    [tasks, isNone, known, id],
  );

  // Dans l'ordre de la liste (en haut = la plus urgente), chaque tâche suivie de ses sous-tâches ;
  // les tâches faites (avec leurs sous-tâches) dans « Fait ».
  const { todoRows, doneRows } = useMemo(() => {
    const todo: ChecklistRow[] = [];
    const done: ChecklistRow[] = [];
    let target = todo;
    for (const r of checklistRows(listTopIds(inList), tasks)) {
      if (r.depth === 0) target = byId.get(r.id)?.status === 'done' ? done : todo;
      target.push(r);
    }
    return { todoRows: todo, doneRows: done };
  }, [inList, tasks, byId]);

  if (missing) return null;

  const todoTasks = inList.filter((t) => t.status === 'todo');
  const name = project?.name ?? 'Sans liste';
  const color = project?.color ?? NEUTRAL_TONE.dot;
  const remainingMin = todoTasks.reduce((sum, t) => sum + t.durationMin, 0);
  const subtitle = todoTasks.length ? `${todoTasks.length} à faire · ${formatDuration(remainingMin)}` : 'Rien à faire';
  const projectId = project?.id;
  const doneCount = doneRows.filter((r) => r.depth === 0).length;

  const saveRows = (next: ChecklistRow[]) => reorderTasks(listChanges([...next, ...doneRows], tasks));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    // Nouvelle tâche en bas de la liste : l'ordre affiché devient l'ordre enregistré.
    const top = listTopIds(inList);
    reorderTasks(
      top
        .map((tid, i) => ({ id: tid, parentId: byId.get(tid)?.parentId, order: i }))
        .filter((l) => byId.get(l.id)?.order !== l.order),
    );
    addTask({ title, projectId, order: top.length });
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

      <div style={{ marginTop: 20 }}>
        {todoRows.length > 0 && <SortableTaskList rows={todoRows} tasks={byId} onRows={saveRows} />}
      </div>

      <form onSubmit={submit} className="cl-add">
        <label htmlFor={inputId} className="sr-only">
          Ajouter une tâche à {name}
        </label>
        <input
          id={inputId}
          className="text-input"
          placeholder="+ Ajouter une tâche…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          enterKeyHint="done"
          autoComplete="off"
        />
      </form>
      {todoRows.length > 1 && <p className="cl-tip">Appui long pour déplacer · glisser à droite pour une sous-tâche</p>}

      <Collapsible label="Fait" count={doneCount}>
        {doneRows.map((r) => {
          const task = byId.get(r.id);
          return task ? <TaskRow key={r.id} task={task} indent={r.depth ? INDENT_PX : 0} /> : null;
        })}
      </Collapsible>

      <Fab onClick={() => openSheet({ kind: 'task', defaults: { projectId } })} label="Ajouter une tâche" />
    </>
  );
}
