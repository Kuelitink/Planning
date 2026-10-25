/**
 * Checklist d'une période (jour, semaine, mois) façon Google Keep : une liste ordonnée
 * (en haut = la plus urgente) où une ligne décalée à droite devient la sous-tâche de la
 * ligne du dessus, et suit sa tâche mère quand on la déplace.
 *
 * La checklist est vue comme une suite de lignes « à plat » (`ChecklistRow`), de
 * profondeur 0 (tâche) ou 1 (sous-tâche). Les opérations (déplacer, décaler) travaillent
 * sur cette suite ; `checklistChanges` en déduit l'ordre des tâches de la période et les
 * tâches dont la mère ou le rang a changé.
 */

import type { ID, Task } from './types';

export interface ChecklistRow {
  id: ID;
  depth: 0 | 1;
  /** Sous-tâche affichée seule : sa tâche mère n'est pas dans la checklist. */
  orphan: boolean;
}

/** Sous-tâches d'une tâche, dans leur ordre. */
export function subtasksOf(tasks: Task[], parentId: ID): Task[] {
  return tasks
    .filter((t) => t.parentId === parentId)
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/**
 * Lignes de la checklist : chaque tâche choisie, suivie de ses sous-tâches. Une
 * sous-tâche choisie dont la mère l'est aussi n'apparaît qu'une fois, sous sa mère.
 */
export function checklistRows(pickedIds: ID[], tasks: Task[]): ChecklistRow[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const picked = new Set(pickedIds);
  const seen = new Set<ID>();
  const rows: ChecklistRow[] = [];
  for (const id of pickedIds) {
    const task = byId.get(id);
    if (!task || seen.has(id)) continue;
    const parent = task.parentId ? byId.get(task.parentId) : undefined;
    if (parent && picked.has(parent.id)) continue;
    seen.add(id);
    rows.push({ id, depth: 0, orphan: Boolean(parent) });
    if (parent) continue;
    for (const sub of subtasksOf(tasks, id)) {
      if (seen.has(sub.id)) continue;
      seen.add(sub.id);
      rows.push({ id: sub.id, depth: 1, orphan: false });
    }
  }
  return rows;
}

/** Indices `[début, fin)` du bloc de la ligne `i` : une tâche et ses sous-tâches, ou une sous-tâche seule. */
export function blockOf(rows: ChecklistRow[], i: number): [number, number] {
  if (rows[i].depth === 1) return [i, i + 1];
  let end = i + 1;
  while (end < rows.length && rows[end].depth === 1) end++;
  return [i, end];
}

/** Tâche mère possible pour une ligne placée à l'indice `i` : la tâche (non orpheline) juste au-dessus. */
function parentIndexBefore(rows: ChecklistRow[], i: number): number {
  for (let j = i - 1; j >= 0; j--) {
    if (rows[j].depth === 0) return rows[j].orphan ? -1 : j;
  }
  return -1;
}

/**
 * Déplace le bloc de la ligne `from` pour qu'il commence à l'indice `to` de la liste
 * sans ce bloc. Une tâche et ses sous-tâches ne se posent qu'entre deux tâches ; une
 * sous-tâche reste une sous-tâche (de la tâche au-dessus), sauf posée tout en haut ou
 * sous une sous-tâche orpheline.
 */
export function moveRow(rows: ChecklistRow[], from: number, to: number): ChecklistRow[] {
  const [start, end] = blockOf(rows, from);
  const block = rows.slice(start, end);
  const rest = [...rows.slice(0, start), ...rows.slice(end)];
  let at = Math.max(0, Math.min(to, rest.length));
  if (block[0].depth === 0) {
    while (at < rest.length && rest[at].depth === 1) at++;
    return [...rest.slice(0, at), ...block, ...rest.slice(at)];
  }
  const row = { ...block[0] };
  if (parentIndexBefore(rest, at) < 0) {
    row.depth = 0;
    row.orphan = false;
  }
  return [...rest.slice(0, at), row, ...rest.slice(at)];
}

/** La ligne peut-elle devenir une sous-tâche de la tâche au-dessus ? */
export function canIndent(rows: ChecklistRow[], i: number): boolean {
  return rows[i]?.depth === 0 && parentIndexBefore(rows, i) >= 0;
}

/** Décale à droite : la tâche devient une sous-tâche de celle du dessus (ses sous-tâches aussi). */
export function indentRow(rows: ChecklistRow[], i: number): ChecklistRow[] {
  if (!canIndent(rows, i)) return rows;
  return rows.map((r, j) => (j === i ? { ...r, depth: 1, orphan: false } : r));
}

/**
 * Décale à gauche : la sous-tâche redevient une tâche, et les sous-tâches qui la
 * suivaient deviennent les siennes (comme dans Keep).
 */
export function outdentRow(rows: ChecklistRow[], i: number): ChecklistRow[] {
  if (rows[i]?.depth !== 1) return rows;
  return rows.map((r, j) => (j === i ? { ...r, depth: 0, orphan: false } : r));
}

export interface ChecklistChanges {
  /** Tâches de la période, dans l'ordre (sans les sous-tâches rangées sous leur mère). */
  order: ID[];
  /** Tâches dont la mère ou le rang change. */
  tasks: { id: ID; parentId: ID | undefined; order: number | undefined }[];
}

/** Ordre de la période et tâches modifiées, d'après les lignes. */
export function checklistChanges(rows: ChecklistRow[], tasks: Task[]): ChecklistChanges {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const order: ID[] = [];
  const changed: ChecklistChanges['tasks'] = [];
  let parent: ID | undefined;
  let rank = 0;
  for (const row of rows) {
    const task = byId.get(row.id);
    if (!task) continue;
    if (row.depth === 0) {
      order.push(row.id);
      parent = row.orphan ? undefined : row.id;
      rank = 0;
      // Une orpheline garde sa mère ; sinon la ligne n'est plus une sous-tâche.
      if (!row.orphan && task.parentId !== undefined) changed.push({ id: row.id, parentId: undefined, order: undefined });
      continue;
    }
    if (parent === undefined) continue;
    if (task.parentId !== parent || task.order !== rank) changed.push({ id: row.id, parentId: parent, order: rank });
    rank++;
  }
  return { order, tasks: changed };
}
