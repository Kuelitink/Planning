/**
 * Liste de tâches réordonnable façon Google Keep, partagée par les modes Checklist et Listes :
 * appui long puis glisser pour déplacer (une tâche emmène ses sous-tâches), glisser une ligne
 * à droite pour en faire une sous-tâche de celle du dessus, à gauche pour la remettre au premier
 * niveau (ou la retirer, si la liste le permet). Toucher le titre ou l'échéance, à droite, ouvre
 * la fiche de la tâche.
 */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ID, Task } from '../core/types';
import { blockOf, canIndent, indentRow, moveRow, outdentRow, type ChecklistRow } from '../core/checklist';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { Dot, PriorityCheck, useNow } from '../ui/kit';
import { IconChevronRight, IconFlag } from '../ui/icons';
import { LIST_STYLE, plannedLabel, shortDeadline, usePlanIndex, type PlanIndex } from './TaskRow';
import './checklist.css';

/** Appui long avant de pouvoir déplacer une ligne. */
const LONG_PRESS_MS = 350;
/** Glissement horizontal qui décale une ligne. */
const SWIPE_PX = 56;
/** Décalage d'une sous-tâche. */
export const INDENT_PX = 32;

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
  // Tâche récurrente : ↻ devant sa prochaine occurrence.
  if (task.recurrence) return { text: `↻ ${planned ?? ''}`.trim(), late, flag: false };
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
export function SortableTaskList({
  rows,
  tasks,
  onRows,
  onRemove,
  removeLabel = 'Retirer',
}: {
  rows: ChecklistRow[];
  tasks: Map<ID, Task>;
  onRows: (rows: ChecklistRow[]) => void;
  /** Glisser à gauche une tâche de premier niveau (absent : rien). */
  onRemove?: (id: ID) => void;
  /** Texte affiché pendant ce glissement. */
  removeLabel?: string;
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
        else onRemove?.(row.id);
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
                : onRemove
                  ? removeLabel
                  : ''
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
