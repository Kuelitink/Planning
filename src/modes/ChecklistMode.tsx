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
import { addDays, formatHM, parseDateTime, parseISODate, startOfDay, toISODate } from '../core/time';
import { dayPlan } from '../core/daily';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { fold, matchesQuery, pickedTaskIds } from '../state/urgency';
import { Fab, Header, useNow } from '../ui/kit';
import { IconChevronLeft, IconChevronRight, IconPlus } from '../ui/icons';
import { formatDayMonth, formatMonth, formatRelativeDay, isoWeek } from '../ui/format';
import { Collapsible, TaskRow, shortDeadline } from './TaskRow';
import { parseDeadline } from '../core/scheduler';
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


/** Tâches existantes proposées en tapant dans « Ajouter une tâche ». */
const SUGGESTIONS = 3;

export function ChecklistMode() {
  const { goals, tasks, projects, settings, plan, events, windows, addTask, pickTask, unpickTask, applyChecklist } = useStore();
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

  /**
   * Checklist d'aujourd'hui : tâches en retard ou à rendre d'ici demain soir (échéance, ou
   * occurrence d'une tâche récurrente), ou que le planning ne tient pas avant leur échéance.
   * Pas celles dont « Pas avant » tombe après aujourd'hui.
   */
  const dueSoon = useMemo(() => {
    if (period !== 'day' || !isCurrent) return [];
    const inList = new Set(rows.map((r) => r.id));
    const limit = addDays(startOfDay(now), 2).getTime();
    const atRisk = new Set(plan.atRisk.map((r) => r.taskId));
    const out: { task: Task; due: string; late: boolean }[] = [];
    for (const task of tasks) {
      if (task.status !== 'todo' || inList.has(task.id) || (task.parentId && inList.has(task.parentId))) continue;
      // « Pas avant » après aujourd'hui (on attend une réponse…) : inutile d'y penser aujourd'hui.
      if (task.earliestStart && parseDateTime(task.earliestStart).getTime() >= addDays(startOfDay(now), 1).getTime()) continue;
      const due = task.recurrence && task.occurrence ? task.occurrence : task.deadline;
      if (!due) continue;
      const dueMs = parseDeadline(due).getTime();
      if (dueMs > limit && !atRisk.has(task.id)) continue;
      out.push({ task, due, late: dueMs <= now.getTime() || atRisk.has(task.id) });
    }
    return out.sort((a, b) => parseDeadline(a.due).getTime() - parseDeadline(b.due).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, isCurrent, rows, plan, tasks, toISODate(now)]);

  /** Planifiées aujourd'hui sans être dans la checklist du jour (ni déjà ci-dessus). */
  const alsoToday = useMemo(() => {
    if (period !== 'day' || !isCurrent) return [];
    const inList = new Set([...rows.map((r) => r.id), ...dueSoon.map((d) => d.task.id)]);
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
  }, [period, isCurrent, rows, dueSoon, plan, tasks, events, windows, settings, byId, toISODate(now)]);

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
    // Titre identique à une tâche existante : on l'ajoute plutôt que d'en créer une deuxième.
    const same = suggestions.find((t) => fold(t.title.trim()) === fold(title));
    if (same) return addExisting(same.id);
    const first = projects.filter((p) => !p.archived).sort((a, b) => a.order - b.order)[0];
    const task = addTask({ title, projectId: first?.id });
    pickTask(task.id, period, periodStart);
    setDraft('');
  };

  const addExisting = (id: ID) => {
    pickTask(id, period, periodStart);
    setDraft('');
  };

  /** Tâches à faire dont le titre contient ce qu'on tape (celles qui commencent pareil d'abord), hors checklist. */
  const suggestions = useMemo(() => {
    const q = draft.trim();
    if (!q) return [];
    const inList = new Set(rows.map((r) => r.id));
    const starts = (t: Task) => (fold(t.title).startsWith(fold(q)) ? 0 : 1);
    return tasks
      .filter((t) => t.status === 'todo' && !inList.has(t.id) && matchesQuery(t.title, q))
      .sort((a, b) => starts(a) - starts(b) || a.priority - b.priority || a.title.localeCompare(b.title, 'fr'))
      .slice(0, SUGGESTIONS);
  }, [draft, tasks, rows]);

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

      {topCount > 0 && (
        <p className="subtitle cl-summary">
          {doneCount} sur {topCount} faite{doneCount > 1 ? 's' : ''}
        </p>
      )}

      {/* En retard ou bientôt dues, puis planifiées aujourd'hui, puis ajoutées à la checklist. */}
      {dueSoon.length > 0 && (
        <ul className="stack cl-planned">
          {dueSoon.map(({ task, due, late }) => (
            <TaskRow key={task.id} task={task} meta={late ? undefined : shortDeadline(due, now)} late={late} />
          ))}
        </ul>
      )}

      {alsoToday.length > 0 && (
        <ul className="stack cl-planned">
          {alsoToday.map(({ task, start }) => (
            <TaskRow key={task.id} task={task} meta={formatHM(start)} late={plan.atRisk.some((r) => r.taskId === task.id)} />
          ))}
        </ul>
      )}

      {todoRows.length > 0 && <SortableTaskList rows={todoRows} tasks={byId} onRows={saveRows} onRemove={remove} />}

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
        {suggestions.length > 0 && (
          <ul className="cl-suggest" aria-label="Tâches existantes">
            {suggestions.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => addExisting(t.id)}>
                  <IconPlus size={16} />
                  <span>{t.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <Collapsible label="Cochées" count={doneCount}>
        {doneRows.map((r) => {
          const task = byId.get(r.id);
          return task ? <TaskRow key={r.id} task={task} indent={r.depth ? INDENT_PX : 0} done={doneForPeriod(task)} /> : null;
        })}
      </Collapsible>

      <Fab label="Ajouter des tâches existantes" onClick={openPicker} />
    </>
  );
}
