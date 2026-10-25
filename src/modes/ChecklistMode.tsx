/**
 * Mode Checklist : les tâches qu'on juge importantes pour le jour, la semaine ou le mois,
 * dans l'ordre (en haut = la plus urgente). Elles sont planifiées en priorité dans la
 * période : ASAP pour le jour, priorité haute pour la semaine, normale pour le mois.
 *
 * Comme dans Google Keep : appui long puis glisser pour réordonner ; glisser une ligne
 * vers la droite en fait une sous-tâche de celle du dessus (elle suit alors sa tâche
 * mère), vers la gauche la remet au premier niveau (ou retire la tâche de la checklist).
 */

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { GoalPeriod, ID, Task } from '../core/types';
import { periodEnd, periodStartFor } from '../core/goals';
import {
  blockOf,
  canIndent,
  checklistChanges,
  checklistRows,
  indentRow,
  moveRow,
  outdentRow,
  type ChecklistRow,
} from '../core/checklist';
import { addDays, formatHM, parseISODate, startOfDay, toISODate } from '../core/time';
import { dayPlan } from '../core/daily';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { pickedTaskIds } from '../state/urgency';
import { Dot, Fab, Header, PriorityCheck, useNow } from '../ui/kit';
import { IconChevronLeft, IconChevronRight, IconFlag, IconZap } from '../ui/icons';
import { formatDayMonth, formatMonth, formatRelativeDay, isoWeek } from '../ui/format';
import { Collapsible, LIST_STYLE, TaskRow, plannedLabel, shortDeadline, usePlanIndex, type PlanIndex } from './TaskRow';
import './checklist.css';

const PERIOD_KEY = 'planning.goalsPeriod';

export const PERIOD_OPTIONS: { value: GoalPeriod; label: string }[] = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
];

/** Appui long avant de pouvoir déplacer une ligne. */
const LONG_PRESS_MS = 350;
/** Glissement horizontal qui décale une ligne. */
const SWIPE_PX = 56;
/** Décalage d'une sous-tâche. */
const INDENT_PX = 32;

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

interface Meta {
  text: string;
  late: boolean;
  flag: boolean;
}

/** Ce qui s'affiche à droite d'une ligne : l'échéance, sinon le créneau prévu (ou l'avancée des sous-tâches). */
function metaFor(task: Task, subtasks: Task[], index: PlanIndex, now: Date): Meta | undefined {
  if (task.status === 'done') return undefined;
  const late = index.late.has(task.id);
  const progress = subtasks.length ? `${subtasks.filter((t) => t.status === 'done').length}/${subtasks.length}` : '';
  if (task.deadline) {
    const text = shortDeadline(task.deadline, now);
    return { text: progress ? `${progress} · ${text}` : text, late, flag: true };
  }
  if (progress) return { text: progress, late: false, flag: false };
  const planned = plannedLabel(index, task.id, now);
  return planned ? { text: planned, late, flag: false } : undefined;
}

/** Sous-tâches affichées sous la ligne `i`. */
function subtasksIn(rows: ChecklistRow[], i: number, tasks: Map<ID, Task>): Task[] {
  const [, end] = blockOf(rows, i);
  return rows
    .slice(i + 1, end)
    .map((r) => tasks.get(r.id))
    .filter((t): t is Task => Boolean(t));
}

/** Geste en cours sur une ligne. */
type Gesture =
  | { kind: 'pending'; index: number; x: number; y: number; timer: number }
  | { kind: 'swipe'; index: number; x: number; dx: number }
  | { kind: 'drag'; index: number; y: number; scrollY: number; tops: number[]; heights: number[] };

/**
 * Liste réordonnable : appui long + glisser pour déplacer (une tâche emmène ses
 * sous-tâches), glisser à droite / à gauche pour décaler.
 */
function ChecklistList({
  rows,
  tasks,
  onRows,
  onRemove,
}: {
  rows: ChecklistRow[];
  tasks: Map<ID, Task>;
  onRows: (rows: ChecklistRow[]) => void;
  onRemove: (id: ID) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const gesture = useRef<Gesture | null>(null);
  /** Un geste vient de finir : le clic qui suit est ignoré. */
  const swallowClick = useRef(false);
  const [swipe, setSwipe] = useState<{ index: number; dx: number } | null>(null);
  const [drag, setDrag] = useState<{ index: number; dy: number; to: number } | null>(null);
  const lastY = useRef(0);

  // Pendant un geste, la page ne défile pas (écouteur non passif, seul moyen de l'empêcher).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      const g = gesture.current;
      if (g && (g.kind === 'drag' || g.kind === 'swipe') && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  // Défilement automatique quand on tire une ligne près du bord de l'écran.
  useEffect(() => {
    if (!drag) return;
    let raf = 0;
    const tick = () => {
      const g = gesture.current;
      if (g?.kind === 'drag') {
        const edge = 72;
        const speed = lastY.current < edge ? -10 : lastY.current > window.innerHeight - edge ? 10 : 0;
        if (speed) {
          window.scrollBy(0, speed);
          updateDrag(lastY.current);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  /** Indice d'insertion (dans la liste sans le bloc déplacé) pour la position du doigt. */
  const updateDrag = (clientY: number) => {
    const g = gesture.current;
    if (!g || g.kind !== 'drag') return;
    const dy = clientY - g.y + (window.scrollY - g.scrollY);
    const [start, end] = blockOf(rows, g.index);
    const blockTop = g.tops[start] + dy;
    const blockHeight = g.tops[end - 1] + g.heights[end - 1] - g.tops[start];
    const center = blockTop + blockHeight / 2;
    let to = 0;
    rows.forEach((_, j) => {
      if (j >= start && j < end) return;
      if (g.tops[j] + g.heights[j] / 2 < center) to++;
    });
    setDrag({ index: g.index, dy, to });
  };

  const reset = () => {
    const g = gesture.current;
    if (g?.kind === 'pending') window.clearTimeout(g.timer);
    gesture.current = null;
    setSwipe(null);
    setDrag(null);
  };

  const onPointerDown = (index: number) => (e: ReactPointerEvent<HTMLLIElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('input')) return;
    reset();
    const { clientX: x, clientY: y } = e;
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    const timer = window.setTimeout(() => {
      const items = [...(listRef.current?.children ?? [])] as HTMLElement[];
      const rects = items.map((it) => it.getBoundingClientRect());
      gesture.current = {
        kind: 'drag',
        index,
        y,
        scrollY: window.scrollY,
        tops: rects.map((r) => r.top + window.scrollY),
        heights: rects.map((r) => r.height),
      };
      try {
        el.setPointerCapture(pointerId);
      } catch {
        /* pointeur déjà relâché */
      }
      navigator.vibrate?.(12);
      lastY.current = y;
      setDrag({ index, dy: 0, to: index });
      updateDrag(y);
    }, LONG_PRESS_MS);
    gesture.current = { kind: 'pending', index, x, y, timer };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLLIElement>) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pending') {
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (Math.abs(dx) > 10 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
        window.clearTimeout(g.timer);
        gesture.current = { kind: 'swipe', index: g.index, x: g.x, dx };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* pointeur déjà relâché */
        }
        setSwipe({ index: g.index, dx });
      } else if (Math.abs(dy) > 8 || Math.abs(dx) > 10) {
        // On fait défiler la page : pas de geste.
        reset();
      }
      return;
    }
    if (g.kind === 'swipe') {
      const dx = Math.max(-96, Math.min(96, e.clientX - g.x));
      g.dx = dx;
      setSwipe({ index: g.index, dx });
      return;
    }
    lastY.current = e.clientY;
    updateDrag(e.clientY);
  };

  /** Ignore le clic qui suit un geste (s'il y en a un : sinon le toucher suivant doit marcher). */
  const swallowNextClick = () => {
    swallowClick.current = true;
    window.setTimeout(() => (swallowClick.current = false), 350);
  };

  const onPointerUp = () => {
    const g = gesture.current;
    if (g?.kind === 'swipe') {
      swallowNextClick();
      const row = rows[g.index];
      if (g.dx >= SWIPE_PX && canIndent(rows, g.index)) onRows(indentRow(rows, g.index));
      else if (g.dx <= -SWIPE_PX) {
        if (row.depth === 1) onRows(outdentRow(rows, g.index));
        else onRemove(row.id);
      }
    } else if (g?.kind === 'drag' && drag) {
      swallowNextClick();
      const next = moveRow(rows, g.index, drag.to);
      if (next.some((r, i) => r.id !== rows[i].id || r.depth !== rows[i].depth)) onRows(next);
    }
    reset();
  };

  // Aperçu du déplacement : chaque ligne glisse vers sa future place.
  const offsets = useMemo(() => {
    const g = gesture.current;
    if (!drag || !g || g.kind !== 'drag') return null;
    const preview = moveRow(rows, drag.index, drag.to);
    const heightOf = new Map(rows.map((r, i) => [r.id, g.heights[i]]));
    const gap = rows.length > 1 ? g.tops[1] - g.tops[0] - g.heights[0] : 8;
    const newTop = new Map<ID, number>();
    let y = g.tops[0];
    for (const r of preview) {
      newTop.set(r.id, y);
      y += (heightOf.get(r.id) ?? 0) + gap;
    }
    return { newTop, depth: new Map(preview.map((r) => [r.id, r.depth])) };
  }, [drag, rows]);

  const [dragStart, dragEnd] = drag ? blockOf(rows, drag.index) : [-1, -1];

  return (
    <ul ref={listRef} className="cl-list" style={LIST_STYLE}>
      {rows.map((row, i) => {
        const task = tasks.get(row.id);
        if (!task) return null;
        const g = gesture.current;
        const inBlock = i >= dragStart && i < dragEnd;
        let transform: string | undefined;
        let depth = row.depth;
        if (drag && offsets && g?.kind === 'drag') {
          depth = offsets.depth.get(row.id) ?? row.depth;
          transform = inBlock ? `translateY(${drag.dy}px)` : `translateY(${(offsets.newTop.get(row.id) ?? g.tops[i]) - g.tops[i]}px)`;
        } else if (swipe?.index === i) transform = `translateX(${swipe.dx}px)`;
        const hint =
          swipe?.index === i
            ? swipe.dx > 0
              ? canIndent(rows, i)
                ? 'Sous-tâche'
                : ''
              : row.depth === 1
                ? 'Tâche'
                : 'Retirer'
            : '';
        return (
          <ChecklistItem
            key={row.id}
            task={task}
            subtasks={row.depth === 0 ? subtasksIn(rows, i, tasks) : []}
            depth={depth}
            parentTitle={row.orphan && task.parentId ? tasks.get(task.parentId)?.title : undefined}
            lifted={inBlock}
            moving={drag !== null}
            transform={transform}
            hint={hint}
            hintSide={swipe?.index === i && swipe.dx < 0 ? 'right' : 'left'}
            swallowClick={swallowClick}
            onPointerDown={onPointerDown(i)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={reset}
          />
        );
      })}
    </ul>
  );
}

/** Ligne : case (priorité), titre, et à droite l'échéance — toucher le titre ou l'échéance ouvre la fiche. */
function ChecklistItem({
  task,
  subtasks,
  depth,
  parentTitle,
  lifted,
  moving,
  transform,
  hint,
  hintSide,
  swallowClick,
  ...handlers
}: {
  task: Task;
  subtasks: Task[];
  depth: 0 | 1;
  parentTitle?: string;
  lifted?: boolean;
  moving?: boolean;
  transform?: string;
  hint?: string;
  hintSide?: 'left' | 'right';
  swallowClick?: { current: boolean };
  onPointerDown?: (e: ReactPointerEvent<HTMLLIElement>) => void;
  onPointerMove?: (e: ReactPointerEvent<HTMLLIElement>) => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
}) {
  const { projects, setTaskDone, active } = useStore();
  const { openSheet, showToast } = useNav();
  const index = usePlanIndex();
  const now = useNow(60_000);
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : undefined;
  const done = task.status === 'done';
  const running = active?.taskId === task.id;
  const meta = metaFor(task, subtasks, index, now);

  const toggle = (checked: boolean) => {
    setTaskDone(task.id, checked);
    if (checked) showToast({ message: 'Tâche terminée', action: { label: 'Annuler', run: () => setTaskDone(task.id, false) } });
  };
  const open = () => {
    if (swallowClick?.current) {
      swallowClick.current = false;
      return;
    }
    openSheet({ kind: 'task', id: task.id });
  };

  const cls = ['row', 'cl-row', running && 'row--running', lifted && 'cl-row--lifted', moving && !lifted && 'cl-row--shifting']
    .filter(Boolean)
    .join(' ');

  return (
    <li
      className={cls}
      style={{ marginLeft: depth ? INDENT_PX : 0, transform }}
      onContextMenu={(e) => e.preventDefault()}
      {...handlers}
    >
      {hint && (
        <span className={`cl-row__hint cl-row__hint--${hintSide}`} aria-hidden="true">
          {hint}
        </span>
      )}
      <PriorityCheck
        priority={task.priority}
        checked={done}
        onChange={toggle}
        label={done ? `Remettre « ${task.title} » à faire` : `Terminer « ${task.title} »`}
      />
      <button type="button" className={done ? 'row__title row__title--done cl-row__title' : 'row__title cl-row__title'} onClick={open}>
        {task.title}
        {parentTitle && <span className="cl-row__parent">↳ {parentTitle}</span>}
      </button>
      {project && <Dot color={project.color} />}
      <button
        type="button"
        className={meta?.late ? 'cl-row__meta cl-row__meta--late' : 'cl-row__meta'}
        aria-label={`Modifier « ${task.title} »${meta ? `, ${meta.text}` : ''}`}
        onClick={open}
      >
        {running ? (
          <span className="row__meta--accent">en cours</span>
        ) : (
          meta && (
            <>
              {meta.flag && <IconFlag size={12} />}
              <span>{meta.text}</span>
            </>
          )
        )}
        <IconChevronRight size={16} />
      </button>
    </li>
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
  const picked = useMemo(() => pickedTaskIds(goals, period, periodStart), [goals, period, periodStart]);
  const rows = useMemo(() => checklistRows(picked, tasks), [picked, tasks]);

  // À faire (réordonnable) et cochées : une tâche emmène ses sous-tâches.
  const { todoRows, doneRows } = useMemo(() => {
    const todo: ChecklistRow[] = [];
    const doneList: ChecklistRow[] = [];
    let target = todo;
    for (const r of rows) {
      if (r.depth === 0) target = byId.get(r.id)?.status === 'done' ? doneList : todo;
      target.push(r);
    }
    return { todoRows: todo, doneRows: doneList };
  }, [rows, byId]);

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
        <ChecklistList rows={todoRows} tasks={byId} onRows={saveRows} onRemove={remove} />
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
          return task ? <TaskRow key={r.id} task={task} indent={r.depth ? INDENT_PX : 0} /> : null;
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
