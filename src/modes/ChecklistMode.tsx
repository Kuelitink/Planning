/**
 * Mode Checklist : les tâches qu'on juge importantes pour le jour, la semaine ou le mois,
 * dans l'ordre (en haut = la plus urgente). Elles sont planifiées en priorité dans la
 * période : ASAP pour le jour, priorité haute pour la semaine, normale pour le mois.
 *
 * Comme dans Google Keep : appui long puis glisser pour réordonner ; glisser une ligne
 * vers la droite en fait une sous-tâche de celle du dessus (elle suit alors sa tâche
 * mère), vers la gauche la remet au premier niveau (ou retire la tâche de la checklist).
 */

import { useId, useMemo, useState, type FormEvent } from 'react';
import type { GoalPeriod, ID, Task } from '../core/types';
import { periodEnd, periodStartFor } from '../core/goals';
import { checklistChanges, checklistRows, type ChecklistRow } from '../core/checklist';
import { addDays, formatHM, parseISODate, startOfDay, toISODate } from '../core/time';
import { dayPlan } from '../core/daily';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { pickedTaskIds } from '../state/urgency';
import { Fab, Header, useNow } from '../ui/kit';
import { IconChevronLeft, IconChevronRight, IconZap } from '../ui/icons';
import { formatDayMonth, formatMonth, formatRelativeDay, isoWeek } from '../ui/format';
import { Collapsible, TaskRow } from './TaskRow';
import { INDENT_PX, SortableTaskList } from './SortableTasks';
import './checklist.css';

const PERIOD_KEY = 'planning.goalsPeriod';

export const PERIOD_OPTIONS: { value: GoalPeriod; label: string }[] = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
];


function readPeriod(): GoalPeriod {
  try {
    const saved = localStorage.getItem(PERIOD_KEY);
    if (saved === 'day' || saved === 'week' || saved === 'month') return saved;
  } catch {
    /* stockage indisponible */
  }
  return 'day';
}

function writePeriod(p: GoalPeriod) {
  try {
    localStorage.setItem(PERIOD_KEY, p);
  } catch {
    /* préférence non retenue */
  }
}

/** Date décalée d'une période (jour, semaine, mois). */
function shift(date: Date, period: GoalPeriod, n: number): Date {
  if (period === 'day') return addDays(date, n);
  if (period === 'week') return addDays(date, 7 * n);
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

/** « Aujourd'hui », « Semaine 43 · 19–25 oct. », « Octobre 2026 ». */
export function periodLabel(period: GoalPeriod, periodStart: string, now = new Date()): string {
  const start = parseISODate(periodStart);
  if (period === 'day') return formatRelativeDay(start, now);
  if (period === 'month') return formatMonth(start);
  const end = addDays(periodEnd(period, periodStart), -1);
  const range =
    start.getMonth() === end.getMonth()
      ? `${start.getDate()}–${formatDayMonth(end)}`
      : `${formatDayMonth(start)} – ${formatDayMonth(end)}`;
  return `Semaine ${isoWeek(start)} · ${range}`;
}

/** Sélecteur de période pleine largeur (pilule blanche cernée, actif en rose). */
export function PeriodPicker({ value, onChange }: { value: GoalPeriod; onChange: (p: GoalPeriod) => void }) {
  return (
    <div role="group" aria-label="Période" className="period-picker">
      {PERIOD_OPTIONS.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}


const EMPTY_TEXT: Record<GoalPeriod, string> = {
  day: "Ajoute ce que tu veux faire aujourd'hui.",
  week: 'Ajoute ce que tu veux faire cette semaine.',
  month: 'Ajoute ce que tu veux faire ce mois-ci.',
};

export function ChecklistMode() {
  const { goals, tasks, projects, settings, plan, events, windows, addTask, pickTask, unpickTask, applyChecklist, replan } = useStore();
  const { openSheet, showToast } = useNav();
  const [period, setPeriodState] = useState<GoalPeriod>(readPeriod);
  const [anchor, setAnchor] = useState(() => new Date());
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const now = useNow(60_000);

  const periodStart = periodStartFor(period, anchor, settings.weekStartsOn);
  const isCurrent = periodStart === periodStartFor(period, now, settings.weekStartsOn);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const periodEndISO = toISODate(periodEnd(period, periodStart));
  /** Faite pour la période : cochée, ou récurrente cochée dans la période (déjà à l'occurrence suivante). */
  const doneForPeriod = (t?: Task) =>
    Boolean(
      t &&
        (t.status === 'done' ||
          (t.recurrence && t.occurrence && t.prevOccurrence && t.occurrence >= periodEndISO && t.prevOccurrence >= periodStart)),
    );
  const picked = useMemo(() => pickedTaskIds(goals, period, periodStart), [goals, period, periodStart]);
  const rows = useMemo(() => checklistRows(picked, tasks), [picked, tasks]);

  // À faire (réordonnable) et cochées : une tâche emmène ses sous-tâches.
  const { todoRows, doneRows } = useMemo(() => {
    const todo: ChecklistRow[] = [];
    const doneList: ChecklistRow[] = [];
    let target = todo;
    for (const r of rows) {
      if (r.depth === 0) target = doneForPeriod(byId.get(r.id)) ? doneList : todo;
      target.push(r);
    }
    return { todoRows: todo, doneRows: doneList };
  }, [rows, byId, periodEndISO, periodStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const topCount = rows.filter((r) => r.depth === 0).length;
  const doneCount = doneRows.filter((r) => r.depth === 0).length;

  /** Planifiées aujourd'hui sans être dans la checklist du jour. */
  const alsoToday = useMemo(() => {
    if (period !== 'day' || !isCurrent) return [];
    const inList = new Set(rows.map((r) => r.id));
    const dp = dayPlan(plan, tasks, events, startOfDay(now), { windows, settings });
    const seen = new Set<ID>();
    const out: { task: Task; start: Date }[] = [];
    for (const item of dp.items) {
      if (item.kind !== 'task' || seen.has(item.taskId) || inList.has(item.taskId)) continue;
      const task = byId.get(item.taskId);
      if (!task || task.status !== 'todo' || (task.parentId && inList.has(task.parentId))) continue;
      seen.add(item.taskId);
      out.push({ task, start: item.start });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, isCurrent, rows, plan, tasks, events, windows, settings, byId, toISODate(now)]);

  const setPeriod = (p: GoalPeriod) => {
    setPeriodState(p);
    writePeriod(p);
  };
  const openPicker = () => openSheet({ kind: 'goalPick', period, periodStart });

  const saveRows = (next: ChecklistRow[]) => applyChecklist(period, periodStart, checklistChanges([...next, ...doneRows], tasks));

  const remove = (id: ID) => {
    const before = picked;
    unpickTask(id, period, periodStart);
    showToast({
      message: 'Retirée de la checklist',
      action: {
        label: 'Annuler',
        run: () => applyChecklist(period, periodStart, { order: before, tasks: [] }),
      },
    });
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    const first = projects.filter((p) => !p.archived).sort((a, b) => a.order - b.order)[0];
    const task = addTask({ title, projectId: first?.id });
    pickTask(task.id, period, periodStart);
    setDraft('');
  };

  const emptyText = period === 'day' && !isCurrent ? 'Ajoute ce que tu veux faire ce jour-là.' : EMPTY_TEXT[period];

  return (
    <>
      <Header />
      <PeriodPicker value={period} onChange={setPeriod} />

      <div className="cl-nav">
        <button type="button" className="icon-btn icon-btn--card" aria-label="Période précédente" onClick={() => setAnchor((d) => shift(d, period, -1))}>
          <IconChevronLeft />
        </button>
        <button
          type="button"
          className="cl-nav__label"
          onClick={() => setAnchor(new Date())}
          disabled={isCurrent}
          aria-label={isCurrent ? undefined : 'Revenir à la période en cours'}
        >
          {periodLabel(period, periodStart, now)}
        </button>
        <button type="button" className="icon-btn icon-btn--card" aria-label="Période suivante" onClick={() => setAnchor((d) => shift(d, period, 1))}>
          <IconChevronRight />
        </button>
      </div>

      <div className="cl-summary">
        <p className="subtitle" style={{ margin: 0 }}>
          {topCount ? `${doneCount} sur ${topCount} faite${doneCount > 1 ? 's' : ''}` : ' '}
        </p>
        <button
          type="button"
          className="pill pill--sm pill--pop"
          onClick={() => {
            replan();
            showToast({ message: 'Planning recalculé' });
          }}
        >
          <IconZap size={16} />
          <span>Auto-planifier</span>
        </button>
      </div>

      {todoRows.length > 0 ? (
        <SortableTaskList rows={todoRows} tasks={byId} onRows={saveRows} onRemove={remove} />
      ) : (
        topCount === 0 && <p className="empty" style={{ padding: '24px 16px 8px' }}>{emptyText}</p>
      )}

      <form onSubmit={add} className="cl-add">
        <label htmlFor={inputId} className="sr-only">
          Ajouter une tâche à la checklist
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

      <Collapsible label="Cochées" count={doneCount}>
        {doneRows.map((r) => {
          const task = byId.get(r.id);
          return task ? <TaskRow key={r.id} task={task} indent={r.depth ? INDENT_PX : 0} done={doneForPeriod(task)} /> : null;
        })}
      </Collapsible>

      {alsoToday.length > 0 && (
        <Collapsible label="Aussi prévu aujourd'hui" count={alsoToday.length}>
          {alsoToday.map(({ task, start }) => (
            <TaskRow key={task.id} task={task} meta={formatHM(start)} late={plan.atRisk.some((r) => r.taskId === task.id)} />
          ))}
        </Collapsible>
      )}

      <Fab label="Ajouter des tâches existantes" onClick={openPicker} />
    </>
  );
}
