/**
 * Moteur d'auto-planification (inspiré de FlowSavvy).
 *
 * `schedule()` est une fonction pure : elle place les tâches « à faire » dans les
 * créneaux libres, au plus tôt, et renvoie les blocs obtenus.
 *
 * 1. Les événements (hors journée entière) et les tâches épinglées occupent le
 *    temps. Rien n'est placé avant `now`, arrondi à la grille (`granularityMin`).
 * 2. Les créneaux d'une tâche = ses horaires (tâche → liste → réglages) moins le
 *    temps occupé, jusqu'à l'horizon (`horizonDays` à partir d'aujourd'hui).
 * 3. Ordre de placement : tri topologique sur les dépendances ; parmi les tâches
 *    dont les dépendances sont traitées, la plus urgente d'abord.
 *
 *    Score d'urgence (plus petit = plus urgent) :
 *
 *        clé = min(échéance effective, now + HORIZON_PRIORITÉ[priorité effective])
 *
 *    avec HORIZON_PRIORITÉ = P1 : 1 jour, P2 : 3 jours, P3 : 7 jours, P4 : 14 jours.
 *    Une tâche sans échéance reçoit donc une échéance « virtuelle » selon sa
 *    priorité, et une échéance lointaine ne compte pas plus que cette échéance
 *    virtuelle : une P1 sans échéance passe avant une P3 due dans un mois, mais
 *    une P4 due dans 2 heures passe avant la P1. À clé égale : priorité, puis
 *    rang (`ranks` : place dans la checklist, sinon ordre des listes : à priorité
 *    égale, la liste du dessus passe avant celle du dessous), puis échéance
 *    effective la plus proche, puis durée la plus courte, puis date de création.
 *
 *    L'échéance et la priorité « effectives » se propagent vers l'amont des
 *    dépendances : si C (due vendredi, P1) dépend de B, B hérite d'une échéance
 *    au plus tard vendredi moins la durée de C, et de la priorité P1.
 * 4. Placement au plus tôt : jamais avant `earliestStart`, ni avant la fin du
 *    dernier bloc de chaque dépendance non faite. Une tâche découpable remplit
 *    les trous par morceaux d'au moins `minChunkMin` ; sinon il faut un créneau
 *    d'un seul tenant.
 * 5. Une tâche qui finit après son échéance est placée mais signalée dans
 *    `atRisk`. Sans place dans l'horizon : `unscheduled` (`no-slot`). Les tâches
 *    d'un cycle de dépendances : `cycle` ; celles qui dépendent d'une tâche non
 *    planifiée : `dependency` ; durée invalide : `invalid`.
 * 6. Charge du jour (`dayLoad`, facultatif, calculé d'après le cycle par `cycleLoad.ts`) :
 *    un jour de facteur f < 1 accepte au plus f × (temps libre des horaires par défaut ce
 *    jour-là, événements déduits) de tâches. Comptent : les tâches épinglées, celles déjà
 *    placées, et le jour même les tâches faites aujourd'hui (leur durée). Une tâche
 *    découpable y place des morceaux limités au budget restant (arrondi à la grille, au
 *    moins `minChunkMin`) ; une tâche d'un seul tenant saute les jours où il ne suffit
 *    pas. Plafond souple : si la tâche ne trouve pas de place, ou finirait après son
 *    échéance effective à cause du plafond, elle est placée comme sans plafond (le budget
 *    du jour est alors dépassé). Jours absents de la table, f ≥ 1 ou sans horaires par
 *    défaut : pas de plafond. Sans `dayLoad`, rien ne change.
 */

import type { CalendarEvent, ID, ISODate, Priority, Project, Settings, Task, TimeWindow } from './types';
import { expandEvents } from './events';
import { clip, normalize, subtract, totalLength, type Interval } from './intervals';
import { addDays, DAY, MINUTE, parseDateTime, parseISODate, isDateOnly, roundUpToGrid, startOfDay, toISODate } from './time';
import { defaultRules, defaultWindow, rulesForTask, windowAvailability } from './windows';

export const PRIORITY_HORIZON_DAYS: Record<Priority, number> = { 1: 1, 2: 3, 3: 7, 4: 14 };

export interface ScheduleInput {
  tasks: Task[];
  events: CalendarEvent[];
  windows: TimeWindow[];
  projects?: Project[];
  settings: Settings;
  now: Date;
  /** Rang de chaque tâche, départage à priorité égale (plus petit = plus urgent ; absent = en dernier). */
  ranks?: Map<ID, number>;
  /**
   * Facteur de charge par jour (0..1) : part du temps libre de la journée que les tâches
   * peuvent occuper (règle 6). Jour absent = pas de plafond.
   */
  dayLoad?: Record<ISODate, number>;
}

export interface ScheduledBlock {
  taskId: ID;
  start: Date;
  end: Date;
  /** Créneau fixé à la main. */
  pinned?: boolean;
}

export type UnscheduledReason = 'cycle' | 'dependency' | 'no-slot' | 'invalid';

export interface ScheduleResult {
  blocks: ScheduledBlock[];
  unscheduled: { taskId: ID; reason: UnscheduledReason }[];
  atRisk: { taskId: ID; reason: 'deadline'; deadline: Date; end: Date }[];
}

/** Échéance : une date seule vaut « avant la fin de ce jour ». */
export function parseDeadline(s: string): Date {
  return isDateOnly(s) ? addDays(parseISODate(s), 1) : new Date(s);
}

export function schedule(input: ScheduleInput): ScheduleResult {
  const { tasks, events, windows, settings } = input;
  const projects = input.projects ?? [];
  const grid = Math.max(1, settings.granularityMin);
  const buffer = Math.max(0, settings.bufferMin) * MINUTE;
  const nowMs = roundUpToGrid(input.now.getTime(), grid);
  const horizonEnd = addDays(startOfDay(input.now), Math.max(1, settings.horizonDays)).getTime();

  const result: ScheduleResult = { blocks: [], unscheduled: [], atRisk: [] };
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const todo = tasks.filter((t) => t.status === 'todo');

  // --- Temps occupé : événements + tâches épinglées --------------------------
  let busy: Interval[] = [];
  const addBusy = (start: number, end: number) => {
    busy = normalize([...busy, { start: start - buffer, end: end + buffer }]);
  };
  for (const occ of expandEvents(events, new Date(nowMs), new Date(horizonEnd))) {
    if (!occ.allDay) addBusy(occ.start.getTime(), occ.end.getTime());
  }

  const budget = input.dayLoad ? loadBudget(input, input.dayLoad, horizonEnd) : null;

  /** Fin du dernier bloc de chaque tâche placée (ou épinglée). */
  const lastEnd = new Map<ID, number>();
  for (const t of todo) {
    if (!t.pinned) continue;
    const start = parseDateTime(t.pinned.start);
    const end = parseDateTime(t.pinned.end);
    result.blocks.push({ taskId: t.id, start, end, pinned: true });
    addBusy(start.getTime(), end.getTime());
    if (budget) consume(budget, start.getTime(), end.getTime());
    lastEnd.set(t.id, end.getTime());
    flagRisk(result, t, end);
  }

  // --- Tâches à planifier ----------------------------------------------------
  const plannable = todo.filter((t) => !t.pinned);
  const plannableIds = new Set(plannable.map((t) => t.id));
  type State = 'pending' | 'placed' | 'failed';
  const state = new Map<ID, State>();

  /** Dépendances encore à faire parmi les tâches à planifier. */
  const depsOf = (t: Task) => t.dependsOn.filter((d) => plannableIds.has(d));

  for (const t of plannable) {
    if (!(Number.isFinite(t.durationMin) && t.durationMin > 0)) {
      result.unscheduled.push({ taskId: t.id, reason: 'invalid' });
      state.set(t.id, 'failed');
    }
  }
  for (const id of findCycleMembers(plannable, depsOf)) {
    if (state.has(id)) continue;
    result.unscheduled.push({ taskId: id, reason: 'cycle' });
    state.set(id, 'failed');
  }
  for (const t of plannable) if (!state.has(t.id)) state.set(t.id, 'pending');

  // --- Échéance et priorité effectives (propagées vers l'amont) --------------
  const successors = new Map<ID, Task[]>();
  for (const t of plannable) {
    for (const d of depsOf(t)) {
      if (!successors.has(d)) successors.set(d, []);
      successors.get(d)!.push(t);
    }
  }
  const effDeadline = new Map<ID, number>();
  const effPriority = new Map<ID, Priority>();
  const computeEffective = (t: Task, visiting: Set<ID>): void => {
    if (effDeadline.has(t.id)) return;
    visiting.add(t.id);
    let deadline = t.deadline ? parseDeadline(t.deadline).getTime() : Infinity;
    let priority = t.priority;
    for (const s of successors.get(t.id) ?? []) {
      if (visiting.has(s.id) || state.get(s.id) === 'failed') continue;
      computeEffective(s, visiting);
      deadline = Math.min(deadline, effDeadline.get(s.id)! - s.durationMin * MINUTE);
      priority = Math.min(priority, effPriority.get(s.id)!) as Priority;
    }
    visiting.delete(t.id);
    effDeadline.set(t.id, deadline);
    effPriority.set(t.id, priority);
  };
  for (const t of plannable) if (state.get(t.id) === 'pending') computeEffective(t, new Set());

  const urgencyKey = (t: Task) =>
    Math.min(effDeadline.get(t.id)!, nowMs + PRIORITY_HORIZON_DAYS[effPriority.get(t.id)!] * DAY);
  const rankOf = (t: Task) => input.ranks?.get(t.id) ?? Number.MAX_SAFE_INTEGER;
  const compare = (a: Task, b: Task) =>
    urgencyKey(a) - urgencyKey(b) ||
    effPriority.get(a.id)! - effPriority.get(b.id)! ||
    rankOf(a) - rankOf(b) ||
    effDeadline.get(a.id)! - effDeadline.get(b.id)! ||
    a.durationMin - b.durationMin ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id);

  // --- Placement -------------------------------------------------------------
  const windowCache = new Map<string, Interval[]>();
  const availability = (t: Task): Interval[] => {
    const { windowId, rules, window } = rulesForTask(t, windows, projects, settings);
    const key = windowId ?? '__default__';
    if (!windowCache.has(key)) windowCache.set(key, windowAvailability(window, rules, nowMs, horizonEnd));
    return windowCache.get(key)!;
  };

  for (;;) {
    const ready = plannable.filter(
      (t) => state.get(t.id) === 'pending' && depsOf(t).every((d) => state.get(d) !== 'pending'),
    );
    if (ready.length === 0) break;
    const task = ready.reduce((best, t) => (compare(t, best) < 0 ? t : best));

    if (depsOf(task).some((d) => state.get(d) === 'failed')) {
      result.unscheduled.push({ taskId: task.id, reason: 'dependency' });
      state.set(task.id, 'failed');
      continue;
    }

    let earliest = nowMs;
    if (task.earliestStart) earliest = Math.max(earliest, parseDateTime(task.earliestStart).getTime());
    for (const d of task.dependsOn) {
      const end = lastEnd.get(d);
      if (end !== undefined && byId.get(d)?.status === 'todo') earliest = Math.max(earliest, end);
    }

    const free = subtract(clip(availability(task), earliest, horizonEnd), busy);
    const duration = task.durationMin * MINUTE;
    const minChunk = Math.max(1, task.minChunkMin) * MINUTE;
    const place = (b: Budget | null) =>
      task.splittable ? placeSplit(free, earliest, duration, minChunk, grid, b) : placeWhole(free, earliest, duration, grid, b);
    // Plafond souple : sans place, ou en retard à cause de lui, on place sans plafond.
    let placed = budget ? place(budget) : null;
    if (!placed || placed[placed.length - 1].end > effDeadline.get(task.id)!) placed = place(null);

    if (!placed) {
      result.unscheduled.push({ taskId: task.id, reason: 'no-slot' });
      state.set(task.id, 'failed');
      continue;
    }
    for (const iv of placed) {
      result.blocks.push({ taskId: task.id, start: new Date(iv.start), end: new Date(iv.end) });
      addBusy(iv.start, iv.end);
      if (budget) consume(budget, iv.start, iv.end);
    }
    const end = placed[placed.length - 1].end;
    lastEnd.set(task.id, end);
    state.set(task.id, 'placed');
    flagRisk(result, task, new Date(end));
  }

  result.blocks.sort((a, b) => a.start.getTime() - b.start.getTime());
  return result;
}

function flagRisk(result: ScheduleResult, task: Task, end: Date): void {
  if (!task.deadline) return;
  const deadline = parseDeadline(task.deadline);
  if (end.getTime() > deadline.getTime()) result.atRisk.push({ taskId: task.id, reason: 'deadline', deadline, end });
}

// --- Charge du jour (règle 6) ------------------------------------------------

/** Temps de tâches encore accepté par jour plafonné (ms, peut devenir négatif). */
type Budget = Map<ISODate, number>;

/** Parcourt les morceaux de [start, end[ jour par jour (heure locale). */
function forEachDay(start: number, end: number, fn: (day: ISODate, ms: number, dayStart: number) => void): void {
  for (let day = startOfDay(new Date(start)); day.getTime() < end; day = addDays(day, 1)) {
    const next = addDays(day, 1).getTime();
    const ms = Math.min(end, next) - Math.max(start, day.getTime());
    if (ms > 0) fn(toISODate(day), ms, day.getTime());
  }
}

function consume(budget: Budget, start: number, end: number): void {
  forEachDay(start, end, (day, ms) => {
    const left = budget.get(day);
    if (left !== undefined) budget.set(day, left - ms);
  });
}

/** Budget initial : f × (horaires par défaut − événements), moins les tâches faites aujourd'hui. */
function loadBudget(input: ScheduleInput, dayLoad: Record<ISODate, number>, horizonEnd: number): Budget | null {
  const { windows, settings, events, now } = input;
  const budget: Budget = new Map();
  const today = startOfDay(now);
  const occupied = normalize(
    expandEvents(events, today, new Date(horizonEnd))
      .filter((o) => !o.allDay)
      .map((o) => ({ start: o.start.getTime(), end: o.end.getTime() })),
  );
  for (let day = today; day.getTime() < horizonEnd; day = addDays(day, 1)) {
    const iso = toISODate(day);
    const f = dayLoad[iso];
    if (f === undefined || !(f < 1)) continue;
    const from = day.getTime();
    const to = addDays(day, 1).getTime();
    const capacity = windowAvailability(defaultWindow(windows, settings), defaultRules(windows, settings), from, to);
    if (totalLength(capacity) <= 0) continue;
    budget.set(iso, Math.max(0, f) * totalLength(subtract(capacity, occupied)));
  }
  if (budget.size === 0) return null;
  const todayIso = toISODate(today);
  if (budget.has(todayIso)) {
    for (const t of input.tasks) {
      if (t.status === 'done' && t.doneAt && toISODate(parseDateTime(t.doneAt)) === todayIso && t.durationMin > 0) {
        budget.set(todayIso, budget.get(todayIso)! - t.durationMin * MINUTE);
      }
    }
  }
  return budget;
}

/** Jour (début, ms) dont le budget ne suffit pas pour [start, end[, sinon null. */
function overBudget(budget: Budget, start: number, end: number): number | null {
  let blocked: number | null = null;
  forEachDay(start, end, (day, ms, dayStart) => {
    const left = budget.get(day);
    if (blocked === null && left !== undefined && left < ms) blocked = dayStart;
  });
  return blocked;
}

// --- Placement ---------------------------------------------------------------

/** Premier créneau d'un seul tenant assez long (et dans le budget), début aligné sur la grille. */
function placeWhole(free: Interval[], earliest: number, duration: number, grid: number, budget: Budget | null): Interval[] | null {
  for (const iv of free) {
    let start = roundUpToGrid(Math.max(iv.start, earliest), grid);
    while (start + duration <= iv.end) {
      const blocked = budget && overBudget(budget, start, start + duration);
      if (blocked === null) return [{ start, end: start + duration }];
      // Jour de début trop chargé : lendemain ; jour suivant trop chargé : un cran plus tard.
      start =
        blocked <= start
          ? roundUpToGrid(addDays(new Date(blocked), 1).getTime(), grid)
          : roundUpToGrid(start + 1, grid);
    }
  }
  return null;
}

/**
 * Remplit les créneaux au plus tôt par morceaux d'au moins `minChunk`. Avec un budget,
 * les créneaux sont coupés à minuit et chaque morceau est limité au budget restant du
 * jour, arrondi à la grille.
 */
function placeSplit(
  free: Interval[],
  earliest: number,
  duration: number,
  minChunk: number,
  grid: number,
  budget: Budget | null,
): Interval[] | null {
  const pieces = budget ? free.flatMap((iv) => splitAtMidnight(iv)) : free;
  const step = grid * MINUTE;
  const used = new Map<ISODate, number>();
  const chunks: Interval[] = [];
  let remaining = duration;
  for (const iv of pieces) {
    if (remaining <= 0) break;
    const start = roundUpToGrid(Math.max(iv.start, earliest), grid);
    let available = iv.end - start;
    const day = toISODate(new Date(start));
    const left = budget?.get(day);
    if (left !== undefined) available = Math.min(available, Math.floor((left - (used.get(day) ?? 0)) / step) * step);
    let size = Math.min(remaining, available);
    // Ne pas laisser un reste plus petit qu'un morceau minimal.
    const rest = remaining - size;
    if (rest > 0 && rest < minChunk) size = remaining - minChunk;
    if (size < Math.min(minChunk, remaining)) continue;
    chunks.push({ start, end: start + size });
    used.set(day, (used.get(day) ?? 0) + size);
    remaining -= size;
  }
  if (remaining > 0) return null;
  // Recolle les morceaux coupés à minuit.
  return chunks.reduce<Interval[]>((out, c) => {
    const prev = out[out.length - 1];
    if (prev && prev.end === c.start) prev.end = c.end;
    else out.push({ ...c });
    return out;
  }, []);
}

function splitAtMidnight(iv: Interval): Interval[] {
  const out: Interval[] = [];
  forEachDay(iv.start, iv.end, (_day, ms, dayStart) => {
    const start = Math.max(iv.start, dayStart);
    out.push({ start, end: start + ms });
  });
  return out;
}

/** Tâches appartenant à un cycle de dépendances (algorithme de Tarjan). */
function findCycleMembers(tasks: Task[], depsOf: (t: Task) => ID[]): Set<ID> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const index = new Map<ID, number>();
  const low = new Map<ID, number>();
  const onStack = new Set<ID>();
  const stack: ID[] = [];
  const members = new Set<ID>();
  let counter = 0;

  const visit = (id: ID) => {
    index.set(id, counter);
    low.set(id, counter);
    counter++;
    stack.push(id);
    onStack.add(id);
    for (const d of depsOf(byId.get(id)!)) {
      if (!index.has(d)) {
        visit(d);
        low.set(id, Math.min(low.get(id)!, low.get(d)!));
      } else if (onStack.has(d)) {
        low.set(id, Math.min(low.get(id)!, index.get(d)!));
      }
    }
    if (low.get(id) === index.get(id)) {
      const component: ID[] = [];
      let x: ID;
      do {
        x = stack.pop()!;
        onStack.delete(x);
        component.push(x);
      } while (x !== id);
      const selfLoop = depsOf(byId.get(id)!).includes(id);
      if (component.length > 1 || selfLoop) component.forEach((c) => members.add(c));
    }
  };

  for (const t of tasks) if (!index.has(t.id)) visit(t.id);
  return members;
}
