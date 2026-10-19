/** Ligne de tâche et briques communes aux modes Checklist et Listes. */

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { ID, Task } from '../core/types';
import type { ScheduledBlock, UnscheduledReason } from '../core/scheduler';
import { formatHM, isSameDay } from '../core/time';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { Dot, PriorityCheck } from '../ui/kit';
import { formatRelativeDay } from '../ui/format';
import { IconChevronDown, IconChevronRight } from '../ui/icons';

export const LIST_STYLE: CSSProperties = { listStyle: 'none', margin: 0, padding: 0 };

export const REASON_LABEL: Record<UnscheduledReason, string> = {
  'no-slot': 'Pas de créneau',
  dependency: 'Dépendance',
  cycle: 'Cycle',
  invalid: 'Durée invalide',
};

export interface PlanIndex {
  /** Premier bloc planifié de chaque tâche. */
  first: Map<ID, ScheduledBlock>;
  unscheduled: Map<ID, UnscheduledReason>;
  late: Set<ID>;
}

/** Index du plan par tâche : premier bloc, raison si non planifiée, retard. */
export function usePlanIndex(): PlanIndex {
  const { plan } = useStore();
  return useMemo(() => {
    const first = new Map<ID, ScheduledBlock>();
    for (const b of plan.blocks) {
      const cur = first.get(b.taskId);
      if (!cur || b.start < cur.start) first.set(b.taskId, b);
    }
    return {
      first,
      unscheduled: new Map(plan.unscheduled.map((u) => [u.taskId, u.reason])),
      late: new Set(plan.atRisk.map((r) => r.taskId)),
    };
  }, [plan]);
}

/** « Auj. 13:00 », « Demain », « Jeu. 22 oct. », ou la raison si non planifiée. */
export function plannedLabel(index: PlanIndex, taskId: ID, now: Date): string | undefined {
  const block = index.first.get(taskId);
  if (block) return isSameDay(block.start, now) ? `Auj. ${formatHM(block.start)}` : formatRelativeDay(block.start, now);
  const reason = index.unscheduled.get(taskId);
  return reason ? REASON_LABEL[reason] : undefined;
}

/** Ligne : case (priorité), titre (ouvre la fiche), info à droite, point de la liste. */
export function TaskRow({ task, meta, late }: { task: Task; meta?: string; late?: boolean }) {
  const { projects, setTaskDone, active } = useStore();
  const { openSheet, showToast } = useNav();
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : undefined;
  const done = task.status === 'done';
  const running = active?.taskId === task.id;

  const toggle = (checked: boolean) => {
    setTaskDone(task.id, checked);
    if (checked) {
      showToast({ message: 'Tâche terminée', action: { label: 'Annuler', run: () => setTaskDone(task.id, false) } });
    }
  };

  return (
    <li className={running ? 'row row--running' : 'row'}>
      <PriorityCheck
        priority={task.priority}
        checked={done}
        onChange={toggle}
        label={done ? `Remettre « ${task.title} » à faire` : `Terminer « ${task.title} »`}
      />
      <button
        type="button"
        className={done ? 'row__title row__title--done' : 'row__title'}
        onClick={() => openSheet({ kind: 'task', id: task.id })}
      >
        {task.title}
      </button>
      {late && !done && (
        <span className="row__meta" style={{ color: 'var(--danger)', fontWeight: 600 }}>
          En retard
        </span>
      )}
      {running ? <span className="row__meta row__meta--accent">en cours</span> : meta && <span className="row__meta">{meta}</span>}
      {project && <Dot color={project.color} />}
    </li>
  );
}

/** Section repliée par défaut : « Fait (3) ». Rien si vide. */
export function Collapsible({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
        <span>
          {label} ({count})
        </span>
      </button>
      {open && (
        <ul className="stack" style={{ ...LIST_STYLE, marginTop: 4 }}>
          {children}
        </ul>
      )}
    </div>
  );
}
