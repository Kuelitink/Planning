/** Mode Checklist : la to-do du jour, auto-planifiée, une ligne par tâche. */

import { useMemo } from 'react';
import type { ID, Task } from '../core/types';
import { dayPlan } from '../core/daily';
import { formatDuration, formatHM, isSameDay, startOfDay, toISODate } from '../core/time';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { Fab, Header, useNow } from '../ui/kit';
import { formatRelativeDay } from '../ui/format';
import { IconZap } from '../ui/icons';
import { Collapsible, LIST_STYLE, REASON_LABEL, TaskRow, usePlanIndex } from './TaskRow';

export function ChecklistMode() {
  const { plan, tasks, events, windows, settings, replan } = useStore();
  const { openSheet, showToast } = useNav();
  const now = useNow(60_000);
  const dayKey = toISODate(now);
  const index = usePlanIndex();

  const day = useMemo(
    () => dayPlan(plan, tasks, events, startOfDay(now), { windows, settings }),
    // `dayKey` : on ne recalcule qu'au changement de jour, pas à chaque minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, tasks, events, windows, settings, dayKey],
  );

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  /** Tâches planifiées aujourd'hui (un morceau découpé = la ligne du premier). */
  const today = useMemo(() => {
    const seen = new Set<ID>();
    const rows: { task: Task; start: Date }[] = [];
    for (const item of day.items) {
      if (item.kind !== 'task' || seen.has(item.taskId)) continue;
      const task = byId.get(item.taskId);
      if (!task || task.status !== 'todo') continue;
      seen.add(item.taskId);
      rows.push({ task, start: item.start });
    }
    return rows;
  }, [day, byId]);

  /** À faire mais pas aujourd'hui : planifiées plus tard, puis non planifiables. */
  const later = useMemo(() => {
    const todayIds = new Set(today.map((r) => r.task.id));
    const rows: { task: Task; meta?: string; order: number }[] = [];
    for (const task of tasks) {
      if (task.status !== 'todo' || todayIds.has(task.id)) continue;
      const block = index.first.get(task.id);
      if (block) {
        const meta = isSameDay(block.start, now) ? formatHM(block.start) : formatRelativeDay(block.start, now);
        rows.push({ task, meta, order: block.start.getTime() });
      } else {
        const reason = index.unscheduled.get(task.id);
        rows.push({ task, meta: reason ? REASON_LABEL[reason] : undefined, order: Number.MAX_SAFE_INTEGER });
      }
    }
    return rows.sort((a, b) => a.order - b.order || a.task.priority - b.task.priority);
  }, [tasks, today, index, now]);

  const subtitle = `${formatDuration(day.totals.taskMin)} planifiées · ${formatDuration(day.totals.freeMin)} libres`;

  return (
    <>
      <Header />
      <div className="title-row">
        <h1 className="title">Aujourd'hui</h1>
        <button
          type="button"
          className="pill pill--md"
          onClick={() => {
            replan();
            showToast({ message: 'Journée replanifiée' });
          }}
        >
          <IconZap size={18} />
          <span>Auto-planifier</span>
        </button>
      </div>
      <p className="subtitle">{subtitle}</p>

      <div style={{ marginTop: 20 }}>
        {today.length ? (
          <ul className="stack" style={LIST_STYLE}>
            {today.map(({ task, start }) => (
              <TaskRow key={task.id} task={task} meta={formatHM(start)} late={index.late.has(task.id)} />
            ))}
          </ul>
        ) : (
          <p className="empty">Rien de prévu aujourd'hui. Ajoute une tâche avec +</p>
        )}
      </div>

      <Collapsible label="Fait" count={day.done.length}>
        {day.done.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </Collapsible>
      <Collapsible label="Plus tard" count={later.length}>
        {later.map(({ task, meta }) => (
          <TaskRow key={task.id} task={task} meta={meta} late={index.late.has(task.id)} />
        ))}
      </Collapsible>

      <Fab onClick={() => openSheet({ kind: 'task', defaults: {} })} label="Ajouter une tâche" />
    </>
  );
}
