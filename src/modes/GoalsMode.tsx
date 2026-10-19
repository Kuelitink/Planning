/**
 * Mode Objectifs : la checklist des tâches choisies pour le jour, la semaine ou le
 * mois. On y ajoute les tâches qu'on veut faire, parmi les plus urgentes ou par
 * recherche ; elles sont alors planifiées en priorité dans la période.
 */

import { useState } from 'react';
import type { GoalPeriod, Task } from '../core/types';
import { periodEnd, periodStartFor } from '../core/goals';
import { addDays, parseISODate } from '../core/time';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { pickedTaskIds } from '../state/urgency';
import { Dot, Fab, Header, PlayButton, PriorityCheck } from '../ui/kit';
import { IconChevronLeft, IconChevronRight, IconX } from '../ui/icons';
import { formatDayMonth, formatMonth, formatRelativeDay, isoWeek } from '../ui/format';
import { LIST_STYLE } from './TaskRow';

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
    <div
      role="group"
      aria-label="Période"
      style={{
        height: 48,
        padding: 3,
        border: 'var(--stroke)',
        background: 'var(--card)',
        borderRadius: 999,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 4,
      }}
    >
      {PERIOD_OPTIONS.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            style={{
              border: 'none',
              borderRadius: 999,
              background: on ? 'var(--picked)' : 'transparent',
              boxShadow: on ? 'inset 0 0 0 1.5px var(--ink)' : undefined,
              color: on ? 'var(--ink)' : 'var(--muted)',
              fontFamily: 'var(--font-display)',
              fontSize: 15,
              fontWeight: on ? 600 : 500,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Ligne d'objectif : case (priorité), titre (fiche), liste, chrono, retirer. */
function GoalRow({ task, onRemove }: { task: Task; onRemove: () => void }) {
  const { projects, setTaskDone, active } = useStore();
  const { openSheet, showToast } = useNav();
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : undefined;
  const done = task.status === 'done';
  const running = active?.taskId === task.id;

  const toggle = (checked: boolean) => {
    setTaskDone(task.id, checked);
    if (checked) showToast({ message: 'Tâche terminée', action: { label: 'Annuler', run: () => setTaskDone(task.id, false) } });
  };

  return (
    <li className={running ? 'row row--running' : 'row'} style={{ gap: 12, paddingRight: 8 }}>
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
      {project && <Dot color={project.color} />}
      {!done && <PlayButton taskId={task.id} title={task.title} />}
      <button
        type="button"
        className="icon-btn"
        style={{ width: 36, height: 36, color: 'var(--faint)' }}
        aria-label={`Retirer « ${task.title} » des objectifs`}
        onClick={onRemove}
      >
        <IconX size={18} />
      </button>
    </li>
  );
}

const EMPTY_TEXT: Record<GoalPeriod, string> = {
  day: "Choisis ce que tu veux faire aujourd'hui.",
  week: 'Choisis ce que tu veux faire cette semaine.',
  month: 'Choisis ce que tu veux faire ce mois-ci.',
};

export function GoalsMode() {
  const { goals, tasks, settings, pickTask, unpickTask } = useStore();
  const { openSheet, showToast } = useNav();
  const [period, setPeriodState] = useState<GoalPeriod>(readPeriod);
  const [anchor, setAnchor] = useState(() => new Date());

  const now = new Date();
  const periodStart = periodStartFor(period, anchor, settings.weekStartsOn);
  const isCurrent = periodStart === periodStartFor(period, now, settings.weekStartsOn);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const picked = pickedTaskIds(goals, period, periodStart)
    .map((id) => byId.get(id))
    .filter((t): t is Task => Boolean(t));
  const todo = picked.filter((t) => t.status === 'todo');
  const done = picked.filter((t) => t.status === 'done');

  const setPeriod = (p: GoalPeriod) => {
    setPeriodState(p);
    writePeriod(p);
  };
  const openPicker = () => openSheet({ kind: 'goalPick', period, periodStart });
  const remove = (task: Task) => {
    unpickTask(task.id, period, periodStart);
    showToast({ message: 'Retirée des objectifs', action: { label: 'Annuler', run: () => pickTask(task.id, period, periodStart) } });
  };
  const emptyText = period === 'day' && !isCurrent ? 'Choisis ce que tu veux faire ce jour-là.' : EMPTY_TEXT[period];

  return (
    <>
      <Header />
      <PeriodPicker value={period} onChange={setPeriod} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0 8px' }}>
        <button type="button" className="icon-btn icon-btn--card" aria-label="Période précédente" onClick={() => setAnchor((d) => shift(d, period, -1))}>
          <IconChevronLeft />
        </button>
        <button
          type="button"
          onClick={() => setAnchor(new Date())}
          disabled={isCurrent}
          aria-label={isCurrent ? undefined : 'Revenir à la période en cours'}
          style={{
            minHeight: 44,
            padding: '0 12px',
            border: 'none',
            background: 'transparent',
            fontSize: 15,
            fontWeight: 600,
            color: isCurrent ? 'var(--ink)' : 'var(--muted)',
            cursor: isCurrent ? 'default' : 'pointer',
          }}
        >
          {periodLabel(period, periodStart, now)}
        </button>
        <button type="button" className="icon-btn icon-btn--card" aria-label="Période suivante" onClick={() => setAnchor((d) => shift(d, period, 1))}>
          <IconChevronRight />
        </button>
      </div>

      {picked.length > 0 ? (
        <>
          <p className="subtitle" style={{ margin: '0 0 12px 4px' }}>
            {done.length} sur {picked.length} faite{done.length > 1 ? 's' : ''}
          </p>
          <ul className="stack" style={LIST_STYLE}>
            {[...todo, ...done].map((t) => (
              <GoalRow key={t.id} task={t} onRemove={() => remove(t)} />
            ))}
          </ul>
        </>
      ) : (
        <div className="empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <span>{emptyText}</span>
          <button type="button" className="btn btn--primary" onClick={openPicker}>
            Ajouter des tâches
          </button>
        </div>
      )}

      <Fab label="Ajouter des objectifs" onClick={openPicker} />
    </>
  );
}
