/**
 * Vues Jour, 3 jours et Semaine : une grille horaire de minuit à minuit, qui défile jour
 * par jour à l'horizontale (le jour le plus à gauche se cale sur la grille) et s'étire
 * à la verticale en pinçant (ou Ctrl + molette).
 *
 * Appui long sur une tâche puis glisser : on la pose à l'heure et au jour voulus (créneau
 * fixé, au quart d'heure) ; l'auto-planification place les autres tâches autour.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { dayPlan } from '../../core/daily';
import { addDays, atMinutes, DAY, formatHM, isSameDay, MINUTE, startOfDay, toISODate } from '../../core/time';
import { useStore } from '../../state/store';
import { useNav } from '../../state/nav';
import { useNow } from '../../ui/kit';
import { IconFlag, IconPin, IconTimer } from '../../ui/icons';
import { formatDayLong } from '../../ui/format';
import { PRIORITY_COLOR, toneOf } from '../../ui/palette';
import { OvulationDot, dayPhase, describeMark, phaseClass, useCalendarMarks } from '../cycle/shared';
import '../cycle.css';
import { WEEKDAY_INITIAL, columnStyle, hourLabel, isAllDay, isTimed, itemKey, layout, minutesOf, quarterAt } from './shared';

/** Largeur de la colonne des heures. */
const GUTTER = 40;
/** Jours chargés avant le jour affiché, et en tout. */
const BEFORE = 28;
const RANGE = 77;
/** On recentre quand on approche du bord des jours chargés. */
const MARGIN = 10;

const HOUR_KEY = 'planning.hourPx';
/** Hauteur d'une heure : serrée par défaut, de quoi zoomer. */
export const HOUR_DEFAULT = 32;
const HOUR_MIN = 18;
const HOUR_MAX = 180;

const WEEKDAY_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const WEEKDAY_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** Hauteur d'une ligne de titre (12px) dans un bloc étroit. */
const LINE_PX = 14;

function readHourPx(): number {
  try {
    const v = Number(localStorage.getItem(HOUR_KEY));
    if (v >= HOUR_MIN && v <= HOUR_MAX) return v;
  } catch {
    /* stockage indisponible */
  }
  return HOUR_DEFAULT;
}

function writeHourPx(v: number) {
  try {
    localStorage.setItem(HOUR_KEY, String(Math.round(v)));
  } catch {
    /* préférence non retenue */
  }
}

const clampHour = (v: number) => Math.max(HOUR_MIN, Math.min(HOUR_MAX, v));

/** Nombre de jours entre deux dates (minuit à minuit, changements d'heure compris). */
const daysBetween = (from: Date, to: Date) => Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY);

/** Tâche en cours de déplacement. */
interface Move {
  taskId: string;
  durMin: number;
  /** Minutes entre le haut du bloc et le doigt. */
  grabMin: number;
  x: number;
  y: number;
  timer: number;
  dragging: boolean;
  lastX: number;
  lastY: number;
}

/** Aperçu de la future place : colonne (jour chargé) et minute de début. */
interface Ghost {
  taskId: string;
  col: number;
  min: number;
  durMin: number;
  title: string;
  fill: string;
}

/** Appui long avant de pouvoir déplacer une tâche. */
const LONG_PRESS_MS = 400;
/** Pas de placement, en minutes. */
const SNAP_MIN = 15;

export interface TimelineTarget {
  day: Date;
  /** Change à chaque demande de déplacement (flèches, aujourd'hui). */
  key: number;
}

export function TimelineView({
  days,
  target,
  onAnchor,
  onPickDay,
}: {
  days: 1 | 3 | 7;
  target: TimelineTarget;
  /** Premier jour visible, quand on fait défiler. */
  onAnchor: (day: Date) => void;
  onPickDay: (day: Date) => void;
}) {
  const { plan, tasks, events, windows, settings, projects, active, setTaskDone, saveTask } = useStore();
  const { openSheet, showToast } = useNav();

  /** Cocher une tâche dans la grille : terminée (elle quitte le planning), avec « Annuler ». */
  const done = (taskId: string) => {
    setTaskDone(taskId, true);
    showToast({ message: 'Tâche terminée', action: { label: 'Annuler', run: () => setTaskDone(taskId, false) } });
  };
  const now = useNow(60_000);

  const scroller = useRef<HTMLDivElement>(null);
  const [rangeStart, setRangeStart] = useState(() => addDays(startOfDay(target.day), -BEFORE));
  const [size, setSize] = useState({ colW: 0, height: 400 });
  const [hourPx, setHourPxState] = useState(readHourPx);
  /** Position à appliquer après le prochain rendu (recentrage, zoom). */
  const pendingLeft = useRef<number | null>(null);
  const pendingTop = useRef<number | null>(null);
  const reported = useRef(startOfDay(target.day).getTime());
  const { colW, height } = size;

  // --- Taille : colonnes à la largeur de l'écran, grille jusqu'en bas -------------
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      setSize({ colW: Math.max(40, (el.clientWidth - GUTTER) / days), height: Math.max(240, window.innerHeight - top) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [days]);

  // --- Aller au jour demandé ----------------------------------------------------------
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !colW) return;
    const day = startOfDay(target.day);
    reported.current = day.getTime();
    const idx = daysBetween(rangeStart, day);
    if (idx < MARGIN || idx > RANGE - days - MARGIN) {
      pendingLeft.current = BEFORE * colW;
      setRangeStart(addDays(day, -BEFORE));
      return;
    }
    el.scrollTo({ left: idx * colW, behavior: first.current ? 'auto' : 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.key, colW]);

  // Au premier affichage : l'heure actuelle (ou le matin) à l'écran.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !colW || !first.current) return;
    first.current = false;
    const visible = Array.from({ length: days }, (_, i) => addDays(target.day, i));
    const min = visible.some((d) => isSameDay(d, now)) ? now.getHours() * 60 + now.getMinutes() : 7 * 60;
    el.scrollTop = Math.max(0, (min / 60) * hourPx - height / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colW]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (pendingLeft.current !== null) {
      el.scrollLeft = pendingLeft.current;
      pendingLeft.current = null;
    }
    if (pendingTop.current !== null) {
      el.scrollTop = pendingTop.current;
      pendingTop.current = null;
    }
  });

  // --- Défilement horizontal : jour affiché, recentrage --------------------------------
  const settle = useRef<number>();
  const onScroll = () => {
    const el = scroller.current;
    if (!el || !colW) return;
    const idx = Math.round(el.scrollLeft / colW);
    const day = addDays(rangeStart, idx);
    if (day.getTime() !== reported.current) {
      reported.current = day.getTime();
      onAnchor(day);
    }
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      // Pas de recentrage pendant un déplacement : la colonne visée changerait de jour.
      if (moveRef.current?.dragging) return;
      const i = Math.round(el.scrollLeft / colW);
      if (i >= MARGIN && i <= RANGE - days - MARGIN) return;
      const d = addDays(rangeStart, i);
      pendingLeft.current = BEFORE * colW + (el.scrollLeft - i * colW);
      setRangeStart(addDays(d, -BEFORE));
    }, 180);
  };
  useEffect(() => () => window.clearTimeout(settle.current), []);

  // --- Déplacer une tâche : appui long puis glisser -------------------------------------
  const bodyRef = useRef<HTMLDivElement>(null);
  const moveRef = useRef<Move | null>(null);
  /** Un déplacement vient de finir : le clic qui suit (s'il y en a un) n'ouvre pas la fiche. */
  const swallowClick = useRef(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);

  // --- Zoom vertical : pincer (deux doigts) ou Ctrl + molette ----------------------------
  const hourRef = useRef(hourPx);
  hourRef.current = hourPx;
  const zoomTo = (next: number, focusY: number) => {
    const el = scroller.current;
    if (!el) return;
    const px = clampHour(next);
    const head = (el.querySelector('.tl__body') as HTMLElement | null)?.offsetTop ?? 0;
    // Plusieurs pas de zoom peuvent arriver avant le rendu : on part de la position attendue.
    const top = pendingTop.current ?? el.scrollTop;
    const minutes = ((top + focusY - head) / hourRef.current) * 60;
    pendingTop.current = Math.max(0, head + (minutes / 60) * px - focusY);
    hourRef.current = px;
    setHourPxState(px);
  };
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let pinch: { dist: number; px: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const focus = (t: TouchList) => (t[0].clientY + t[1].clientY) / 2 - el.getBoundingClientRect().top;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { dist: Math.max(20, dist(e.touches)), px: hourRef.current };
    };
    const onMove = (e: TouchEvent) => {
      if (moveRef.current?.dragging) {
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      zoomTo((pinch.px * dist(e.touches)) / pinch.dist, focus(e.touches));
    };
    const onEnd = (e: TouchEvent) => {
      if (pinch && e.touches.length < 2) {
        pinch = null;
        writeHourPx(hourRef.current);
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomTo(hourRef.current * Math.exp(-e.deltaY / 300), e.clientY - el.getBoundingClientRect().top);
      writeHourPx(hourRef.current);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Contenu des jours chargés ---------------------------------------------------------
  const startKey = rangeStart.getTime();
  const columns = useMemo(
    () =>
      Array.from({ length: RANGE }, (_, i) => {
        const day = addDays(new Date(startKey), i);
        const dp = dayPlan(plan, tasks, events, day, { windows, settings });
        return { day, allDay: dp.items.filter(isAllDay), placed: layout(dp.items.filter(isTimed), day) };
      }),
    [startKey, plan, tasks, events, windows, settings],
  );
  const atRisk = useMemo(() => new Set(plan.atRisk.map((r) => r.taskId)), [plan.atRisk]);
  const recurring = useMemo(() => new Set(tasks.filter((t) => t.recurrence).map((t) => t.id)), [tasks]);
  // Phases du cycle : un repère dans l'en-tête des jours, pas sur la grille horaire.
  const cycleMarks = useCalendarMarks(toISODate(rangeStart), toISODate(addDays(rangeStart, RANGE - 1)));
  const todayISO = toISODate(now);
  const hasAllDay = columns.some((c) => c.allDay.length > 0);

  const y = (min: number) => (min / 60) * hourPx;
  const bodyHeight = y(24 * 60);
  const hours = Array.from({ length: 24 }, (_, h) => h * 60);
  const wide = colW >= 110;
  const colorOf = (projectId?: string) => toneOf(projects.find((p) => p.id === projectId)?.color);

  /** Colonne et minute sous le doigt (le haut du bloc suit le doigt, au quart d'heure). */
  const targetAt = (m: Move): { col: number; min: number } | null => {
    const body = bodyRef.current?.getBoundingClientRect();
    if (!body || !colW) return null;
    const col = Math.max(0, Math.min(RANGE - 1, Math.floor((m.lastX - body.left - GUTTER) / colW)));
    const raw = ((m.lastY - body.top) / hourPx) * 60 - m.grabMin;
    const min = Math.max(0, Math.min(24 * 60 - m.durMin, Math.round(raw / SNAP_MIN) * SNAP_MIN));
    return { col, min };
  };

  const updateGhost = () => {
    const m = moveRef.current;
    if (!m?.dragging) return;
    const t = targetAt(m);
    const task = tasks.find((x) => x.id === m.taskId);
    if (!t || !task) return;
    setGhost({ taskId: m.taskId, ...t, durMin: m.durMin, title: task.title, fill: colorOf(task.projectId).fill });
  };

  const endMove = () => {
    const m = moveRef.current;
    if (m) window.clearTimeout(m.timer);
    moveRef.current = null;
    setGhost(null);
    scroller.current?.classList.remove('tl--dragging');
  };

  const onBlockPointerDown = (taskId: string, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.tl__checkhit')) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    endMove();
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    const grabMin = ((e.clientY - el.getBoundingClientRect().top) / hourPx) * 60;
    const m: Move = {
      taskId,
      durMin: Math.max(SNAP_MIN, task.durationMin),
      grabMin: Math.min(grabMin, Math.max(0, task.durationMin - SNAP_MIN)),
      x: e.clientX,
      y: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      dragging: false,
      timer: window.setTimeout(() => {
        m.dragging = true;
        try {
          el.setPointerCapture(pointerId);
        } catch {
          /* pointeur déjà relâché */
        }
        scroller.current?.classList.add('tl--dragging');
        navigator.vibrate?.(12);
        updateGhost();
      }, LONG_PRESS_MS),
    };
    moveRef.current = m;
  };

  const onBlockPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const m = moveRef.current;
    if (!m) return;
    m.lastX = e.clientX;
    m.lastY = e.clientY;
    if (!m.dragging) {
      // Le doigt bouge avant l'appui long : on fait défiler, pas de déplacement.
      if (Math.hypot(e.clientX - m.x, e.clientY - m.y) > 8) endMove();
      return;
    }
    updateGhost();
  };

  const onBlockPointerUp = () => {
    const m = moveRef.current;
    if (m?.dragging) {
      const t = targetAt(m);
      const task = tasks.find((x) => x.id === m.taskId);
      swallowClick.current = true;
      window.setTimeout(() => (swallowClick.current = false), 350);
      if (t && task) {
        const start = atMinutes(columns[t.col].day, t.min);
        const end = new Date(start.getTime() + m.durMin * MINUTE);
        const before = task.pinned;
        saveTask({ ...task, pinned: { start: start.toISOString(), end: end.toISOString() } });
        showToast({
          message: `Placée ${formatDayLong(start).toLowerCase()} à ${formatHM(start)}`,
          action: { label: 'Annuler', run: () => saveTask({ ...task, pinned: before }) },
        });
      }
    }
    endMove();
  };

  // Près du bord pendant un déplacement : la grille défile toute seule.
  useEffect(() => {
    if (!ghost) return;
    let raf = 0;
    const tick = () => {
      const m = moveRef.current;
      const el = scroller.current;
      if (m?.dragging && el) {
        const r = el.getBoundingClientRect();
        const dy = m.lastY < r.top + 70 ? -10 : m.lastY > r.bottom - 50 ? 10 : 0;
        const dx = m.lastX > r.right - 24 ? 8 : m.lastX < r.left + GUTTER + 8 ? -8 : 0;
        if (dx || dy) {
          el.scrollBy(dx, dy);
          updateGhost();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghost !== null]);

  const openTask = (taskId: string) => {
    if (swallowClick.current) return;
    openSheet({ kind: 'task', id: taskId });
  };

  const onColumnClick = (day: Date) => (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    openSheet({ kind: 'add', date: quarterAt(day, 0, hourPx, e.clientY - rect.top) });
  };

  const style = {
    height,
    '--hour': `${hourPx}px`,
    '--col': `${colW}px`,
    '--gutter': `${GUTTER}px`,
  } as CSSProperties;

  return (
    <div ref={scroller} className={wide ? 'tl tl--wide' : 'tl'} style={style} onScroll={onScroll}>
      <div className="tl__inner" style={{ width: GUTTER + RANGE * colW }}>
        <div className="tl__head">
          <span className="tl__corner" aria-hidden="true" />
          {columns.map(({ day }) => {
            const today = isSameDay(day, now);
            const key = toISODate(day);
            const mark = cycleMarks?.get(key);
            const phase = dayPhase(mark);
            const cycleLabel = phase ? describeMark(mark, key > todayISO) : '';
            return (
              <button
                key={day.getTime()}
                type="button"
                className={phase ? `tl__day ${phaseClass(phase)}` : 'tl__day'}
                aria-label={`${formatDayLong(day)}${cycleLabel ? `, ${cycleLabel}` : ''} — voir la journée`}
                title={cycleLabel || undefined}
                onClick={() => onPickDay(day)}
              >
                {phase === 'ovulation' && <OvulationDot />}
                <span className="tl__dow" aria-hidden="true">
                  {colW >= 200 ? WEEKDAY_LONG[day.getDay()] : colW >= 90 ? WEEKDAY_SHORT[day.getDay()] : WEEKDAY_INITIAL[day.getDay()]}
                </span>
                <span className={today ? 'tl__num tl__num--today' : 'tl__num'} aria-hidden="true">
                  {day.getDate()}
                </span>
              </button>
            );
          })}
        </div>

        {hasAllDay && (
          <div className="tl__allday">
            <span className="tl__corner" aria-hidden="true" />
            {columns.map(({ day, allDay }) => (
              <div key={day.getTime()} className="tl__allday-col">
                {allDay.slice(0, 2).map((ev) => (
                  <button
                    key={itemKey(ev)}
                    type="button"
                    className="tl__allday-item"
                    aria-label={`Événement ${ev.title}, journée entière`}
                    onClick={() => openSheet({ kind: 'event', id: ev.eventId })}
                  >
                    {ev.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        <div ref={bodyRef} className="tl__body" style={{ height: bodyHeight }}>
          <div className="tl__gutter" aria-hidden="true">
            {hours.map((m) => (
              <span key={m} className="tl__hour" style={{ top: y(m) }}>
                {m === 0 ? '' : wide ? hourLabel(m) : hourLabel(m).slice(0, 2)}
              </span>
            ))}
          </div>

          {columns.map(({ day, placed }) => {
            const isToday = isSameDay(day, now);
            const nowMin = minutesOf(now, day);
            return (
              <div key={day.getTime()} className="tl__col" onClick={onColumnClick(day)}>
                {placed.map((p) => {
                  const top = y(p.from) + 1;
                  const h = Math.max(12, y(p.to) - y(p.from) - 2);
                  const { item } = p;
                  const when = `${formatHM(item.start)} à ${formatHM(item.end)}`;
                  const oneLine = h < 34;
                  const lines = Math.max(1, Math.floor((h - 4) / LINE_PX));
                  const cls = ['tl__block', item.kind === 'event' && 'tl__block--event', oneLine && 'tl__block--line'];
                  if (item.kind === 'event') {
                    return (
                      <button
                        key={itemKey(item)}
                        type="button"
                        className={cls.filter(Boolean).join(' ')}
                        style={{ top, height: h, ...columnStyle(p, 2) }}
                        aria-label={`Événement ${item.title}, ${when}`}
                        onClick={() => openSheet({ kind: 'event', id: item.eventId })}
                      >
                        <span className="tl__title" style={{ WebkitLineClamp: wide && !oneLine ? 1 : lines }}>
                          {item.title}
                        </span>
                        {wide && <span className="tl__time">{formatHM(item.start)}</span>}
                      </button>
                    );
                  }
                  const running = active?.taskId === item.taskId;
                  const part = item.part ? ` · ${item.part.index}/${item.part.count}` : '';
                  if (running) cls.push('tl__block--running');
                  if (ghost?.taskId === item.taskId) cls.push('tl__block--moving');
                  return (
                    <div
                      key={itemKey(item)}
                      className={cls.filter(Boolean).join(' ')}
                      style={{ top, height: h, '--tone-fill': colorOf(item.projectId).fill, ...columnStyle(p, 2) } as CSSProperties}
                      onPointerDown={(e) => onBlockPointerDown(item.taskId, e)}
                      onPointerMove={onBlockPointerMove}
                      onPointerUp={onBlockPointerUp}
                      onPointerCancel={endMove}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <label className="tl__checkhit">
                        <input
                          type="checkbox"
                          className="tl__check"
                          style={{ '--ring': PRIORITY_COLOR[item.priority] } as CSSProperties}
                          checked={false}
                          onChange={() => done(item.taskId)}
                          aria-label={`Terminer « ${item.title} »`}
                        />
                      </label>
                      <button
                        type="button"
                        className="tl__open"
                        aria-label={`${item.title}, ${when}${item.pinned ? ', créneau fixé' : ''}${running ? ', chrono en cours' : ''}`}
                        onClick={() => openTask(item.taskId)}
                      >
                        <span className="tl__title" style={{ WebkitLineClamp: wide && !oneLine ? 1 : lines }}>
                          {running && (
                            <span className="tl__running" aria-hidden="true">
                              <IconTimer size={12} />
                            </span>
                          )}
                          {item.pinned && (
                            <span className="tl__pin" aria-hidden="true">
                              <IconPin size={11} />
                            </span>
                          )}
                          {recurring.has(item.taskId) && (
                            <span className="tl__pin" aria-hidden="true">
                              ↻
                            </span>
                          )}
                          {item.title}
                          {atRisk.has(item.taskId) && (
                            <span className="tl__risk" aria-hidden="true">
                              <IconFlag size={11} />
                            </span>
                          )}
                        </span>
                        {wide && (
                          <span className="tl__time">
                            {oneLine ? formatHM(item.start) : `${formatHM(item.start)} – ${formatHM(item.end)}`}
                            {part}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
                {ghost && columns[ghost.col]?.day.getTime() === day.getTime() && (
                  <div
                    className="tl__block tl__block--ghost"
                    style={{ top: y(ghost.min) + 1, height: Math.max(12, y(ghost.min + ghost.durMin) - y(ghost.min) - 2), left: 0, width: '100%', '--tone-fill': ghost.fill } as CSSProperties}
                    aria-hidden="true"
                  >
                    <span className="tl__title" style={{ WebkitLineClamp: 1 }}>
                      {formatHM(atMinutes(day, ghost.min))} · {ghost.title}
                    </span>
                  </div>
                )}
                {isToday && (
                  <div className="tl__now" style={{ top: y(nowMin) - 1 }} aria-hidden="true">
                    {wide && <span className="tl__now-label">{formatHM(now)}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
