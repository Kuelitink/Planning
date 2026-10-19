import type { Entity, ID, Priority, Task } from './types';

export function newId(): ID {
  return crypto.randomUUID();
}

/** Ajoute `id`, `createdAt` et `updatedAt` aux champs donnés. */
export function createEntity<T extends Entity>(fields: Omit<T, keyof Entity>, now = new Date(), id: ID = newId()): T {
  const iso = now.toISOString();
  return { ...fields, id, createdAt: iso, updatedAt: iso } as T;
}

/** Copie modifiée avec `updatedAt` à jour. */
export function touch<T extends Entity>(entity: T, changes: Partial<Omit<T, keyof Entity>> = {}, now = new Date()): T {
  return { ...entity, ...changes, updatedAt: now.toISOString() };
}

export type NewTask = Partial<Omit<Task, keyof Entity>> & { title: string };

/**
 * Tâche avec des valeurs par défaut raisonnables : priorité normale (3), 1 h, sans échéance,
 * découpable en morceaux d'au moins 15 min (mêmes valeurs que la fiche d'une nouvelle tâche).
 */
export function createTask(fields: NewTask, now = new Date(), id?: ID): Task {
  return createEntity<Task>(
    {
      priority: 3 as Priority,
      durationMin: 60,
      dependsOn: [],
      splittable: true,
      minChunkMin: 15,
      status: 'todo',
      ...fields,
    },
    now,
    id,
  );
}
