/**
 * État de l'application : données (IndexedDB), plan calculé par le moteur, chrono.
 *
 * Chaque action met à jour l'état React puis écrit dans le dépôt local. Le plan
 * est recalculé à chaque modification des données, quand on appuie sur
 * « Auto-planifier », et au retour dans l'app si le dernier calcul date.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  CalendarEvent,
  CycleDay,
  CycleMark,
  CycleSettings,
  Entity,
  Goal,
  GoalPeriod,
  ID,
  ISODate,
  Project,
  Settings,
  Task,
  TimeEntry,
  TimeWindow,
} from '../core/types';
import { DEFAULT_SETTINGS } from '../core/types';
import { createEntity, createTask, touch, type NewTask } from '../core/entity';
import { parseDeadline, schedule, type ScheduleResult } from '../core/scheduler';
import { activeEntry, entryDuration, startTimer as startEntry, stopTimer as stopEntry } from '../core/timer';
import { MINUTE, parseDateTime, roundUpToGrid } from '../core/time';
import type { CollectionName, ExportData, Repository } from '../storage/repository';
import { IndexedDBRepository } from '../storage/indexeddb';
import { hasLog } from '../core/cycle';
import { mergeDay, type ClueImport, type DayData } from '../core/clue';
import { CATEGORIES, cycleSettingsOf } from '../core/cycleCatalog';
import { initialSeed, sampleData } from './defaults';
import { goalDeadlines, goalsOf } from './urgency';

export interface AppData {
  projects: Project[];
  windows: TimeWindow[];
  tasks: Task[];
  events: CalendarEvent[];
  goals: Goal[];
  timeEntries: TimeEntry[];
  cycleDays: CycleDay[];
  cycleMarks: CycleMark[];
  settings: Settings;
}

type Fields<T extends Entity> = Omit<T, keyof Entity>;

export interface Store extends AppData {
  ready: boolean;
  /** Plan courant et instant de son calcul. */
  plan: ScheduleResult;
  planAt: Date;
  replan(): void;

  addTask(fields: NewTask): Task;
  saveTask(task: Task): void;
  setTaskDone(id: ID, done: boolean): void;
  deleteTask(id: ID): void;

  addProject(fields: Fields<Project>): Project;
  saveProject(project: Project): void;
  deleteProject(id: ID): void;

  addWindow(fields: Fields<TimeWindow>): TimeWindow;
  saveWindow(window: TimeWindow): void;
  deleteWindow(id: ID): void;

  addEvent(fields: Fields<CalendarEvent>): CalendarEvent;
  saveEvent(event: CalendarEvent): void;
  deleteEvent(id: ID): void;

  /** Ajoute une tâche aux objectifs de la période (début de période donné). */
  pickTask(taskId: ID, period: GoalPeriod, periodStart: ISODate): void;
  /** Retire une tâche des objectifs de la période. */
  unpickTask(taskId: ID, period: GoalPeriod, periodStart: ISODate): void;

  /** Session de chrono en cours. */
  active?: TimeEntry;
  /** Dernière tâche chronométrée (pour reprendre après une pause). */
  lastTimedTaskId?: ID;
  startTimer(taskId?: ID): void;
  pauseTimer(): void;
  /** Arrête le chrono et marque la tâche faite. */
  finishTimer(): void;
  /** Temps passé sur une tâche, en ms. */
  timeSpent(taskId: ID, now?: Date): number;

  /** Enregistre ce qui est noté un jour (supprime le jour s'il ne reste rien). */
  saveCycleDay(day: DayData): void;
  /** Exclut un cycle des prédictions et/ou l'annote. */
  setCycleMark(startDate: ISODate, changes: { excluded?: boolean; note?: string }): void;
  updateCycleSettings(changes: Partial<CycleSettings>): void;
  /** Ajoute des données Clue aux données du cycle (fusion jour par jour). */
  importCycle(data: ClueImport): Promise<void>;
  /** Efface toutes les données du cycle (jours et annotations). */
  clearCycle(): Promise<void>;

  updateSettings(changes: Partial<Settings>): void;
  exportData(): Promise<ExportData>;
  importData(data: ExportData, mode: 'replace' | 'merge'): Promise<void>;
  loadSample(): void;
}

const EMPTY: AppData = {
  projects: [],
  windows: [],
  tasks: [],
  events: [],
  goals: [],
  timeEntries: [],
  cycleDays: [],
  cycleMarks: [],
  settings: DEFAULT_SETTINGS,
};
const EMPTY_PLAN: ScheduleResult = { blocks: [], unscheduled: [], atRisk: [] };
/** Au retour dans l'app, on replanifie si le dernier calcul a plus de 15 min. */
const STALE_MS = 15 * MINUTE;

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore hors de <StoreProvider>');
  return s;
}

function upsert<T extends Entity>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const copy = list.slice();
  copy[i] = item;
  return copy;
}

/**
 * Tâches telles que le moteur doit les voir : durée restante après le temps déjà
 * chronométré, la tâche en cours de chrono fixée sur sa session, et une tâche
 * choisie comme objectif due au plus tard à la fin de sa période (jour, semaine, mois).
 */
export function tasksForScheduling(data: AppData, now: Date): Task[] {
  const grid = Math.max(1, data.settings.granularityMin);
  const running = activeEntry(data.timeEntries);
  const spent = new Map<ID, number>();
  for (const e of data.timeEntries) {
    if (!e.taskId || e === running) continue;
    spent.set(e.taskId, (spent.get(e.taskId) ?? 0) + entryDuration(e, now));
  }
  const goalEnds = goalDeadlines(data.goals, now, data.settings.weekStartsOn);
  return data.tasks.map((t) => {
    if (t.status !== 'todo') return t;
    let task = t;
    const goalEnd = goalEnds.get(t.id);
    if (goalEnd !== undefined && (!t.deadline || goalEnd < parseDeadline(t.deadline).getTime())) {
      task = { ...task, deadline: new Date(goalEnd).toISOString() };
    }
    const spentMin = Math.floor((spent.get(t.id) ?? 0) / MINUTE);
    const remaining = Math.max(grid, t.durationMin - spentMin);
    if (running && running.taskId === t.id && !t.pinned) {
      const start = parseDateTime(running.start);
      const minEnd = roundUpToGrid(now.getTime() + MINUTE, grid);
      const end = Math.max(start.getTime() + remaining * MINUTE, minEnd);
      return { ...task, pinned: { start: start.toISOString(), end: new Date(end).toISOString() } };
    }
    return remaining === t.durationMin ? task : { ...task, durationMin: remaining };
  });
}

/**
 * Plan du moteur pour `now`. « En retard » ne garde que les tâches qui dépassent leur
 * échéance réelle : un objectif qui ne tient pas dans sa période n'est pas un retard.
 */
export function computePlan(data: AppData, now: Date): ScheduleResult {
  const result = schedule({
    tasks: tasksForScheduling(data, now),
    events: data.events,
    windows: data.windows,
    projects: data.projects,
    settings: data.settings,
    now,
  });
  const byId = new Map(data.tasks.map((t) => [t.id, t]));
  const atRisk = result.atRisk.filter((r) => {
    const deadline = byId.get(r.taskId)?.deadline;
    return deadline !== undefined && r.end.getTime() > parseDeadline(deadline).getTime();
  });
  return atRisk.length === result.atRisk.length ? result : { ...result, atRisk };
}

/** Toutes les données du dépôt. */
async function loadAll(repo: Repository): Promise<AppData> {
  const [projects, windows, tasks, events, goals, timeEntries, cycleDays, cycleMarks, settings] = await Promise.all([
    repo.list('projects'),
    repo.list('windows'),
    repo.list('tasks'),
    repo.list('events'),
    repo.list('goals'),
    repo.list('timeEntries'),
    repo.list('cycleDays'),
    repo.list('cycleMarks'),
    repo.getSettings(),
  ]);
  return { projects, windows, tasks, events, goals, timeEntries, cycleDays, cycleMarks, settings };
}

export function StoreProvider({ children, repository }: { children: ReactNode; repository?: Repository }) {
  const repo = useMemo(() => repository ?? new IndexedDBRepository(), [repository]);
  const [data, setData] = useState<AppData>(EMPTY);
  const [ready, setReady] = useState(false);
  const [planTick, setPlanTick] = useState(0);
  const dataRef = useRef(data);
  dataRef.current = data;

  const persist = useCallback(
    <K extends CollectionName>(collection: K, item: AppData[K][number]) => {
      repo.put(collection, item as never).catch((err) => console.error('Enregistrement impossible', err));
    },
    [repo],
  );
  const unpersist = useCallback(
    (collection: CollectionName, id: ID) => {
      repo.remove(collection, id).catch((err) => console.error('Suppression impossible', err));
    },
    [repo],
  );

  // --- Chargement initial ----------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadAll(repo);
      const { projects, windows, settings: savedSettings } = loaded;
      let next: AppData = loaded;
      if (!savedSettings.updatedAt && projects.length === 0 && windows.length === 0) {
        const seed = initialSeed();
        next = { ...next, projects: seed.projects, windows: seed.windows, settings: seed.settings };
        await Promise.all([
          ...seed.projects.map((p) => repo.put('projects', p)),
          ...seed.windows.map((w) => repo.put('windows', w)),
          repo.saveSettings(seed.settings),
        ]);
      }
      if (!cancelled) {
        setData(next);
        setReady(true);
      }
    })().catch((err) => {
      console.error('Chargement impossible', err);
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  // --- Plan --------------------------------------------------------------------
  const { plan, planAt } = useMemo(() => {
    const now = new Date();
    if (!ready) return { plan: EMPTY_PLAN, planAt: now };
    return { plan: computePlan(data, now), planAt: now };
    // `planTick` force un nouveau calcul avec l'heure actuelle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data.tasks, data.events, data.windows, data.projects, data.settings, data.timeEntries, data.goals, planTick]);

  const replan = useCallback(() => setPlanTick((n) => n + 1), []);

  const planAtRef = useRef(planAt);
  planAtRef.current = planAt;
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - planAtRef.current.getTime() > STALE_MS) replan();
    };
    document.addEventListener('visibilitychange', onVisible);
    const id = window.setInterval(onVisible, 5 * MINUTE);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(id);
    };
  }, [replan]);

  // --- Actions génériques ------------------------------------------------------
  const saveIn = useCallback(
    <K extends Exclude<CollectionName, 'timeEntries'>>(collection: K, item: AppData[K][number]) => {
      const saved = touch(item as Entity) as AppData[K][number];
      setData((d) => ({ ...d, [collection]: upsert(d[collection] as Entity[], saved as Entity) }));
      persist(collection, saved);
    },
    [persist],
  );

  // --- Tâches --------------------------------------------------------------------
  const addTask = useCallback(
    (fields: NewTask) => {
      const task = createTask(fields);
      setData((d) => ({ ...d, tasks: [...d.tasks, task] }));
      persist('tasks', task);
      return task;
    },
    [persist],
  );

  const saveTask = useCallback((task: Task) => saveIn('tasks', task), [saveIn]);

  const stopRunningOn = useCallback(
    (taskId: ID) => {
      const running = activeEntry(dataRef.current.timeEntries);
      if (!running || running.taskId !== taskId) return;
      const { entries, stopped } = stopEntry(dataRef.current.timeEntries, new Date());
      setData((d) => ({ ...d, timeEntries: entries }));
      if (stopped) persist('timeEntries', stopped);
    },
    [persist],
  );

  const setTaskDone = useCallback(
    (id: ID, done: boolean) => {
      const task = dataRef.current.tasks.find((t) => t.id === id);
      if (!task) return;
      if (done) stopRunningOn(id);
      saveIn('tasks', { ...task, status: done ? 'done' : 'todo', doneAt: done ? new Date().toISOString() : undefined });
    },
    [saveIn, stopRunningOn],
  );

  const deleteTask = useCallback(
    (id: ID) => {
      stopRunningOn(id);
      const d = dataRef.current;
      const now = new Date();
      const others = d.tasks.filter((t) => t.id !== id);
      const tasks = others.map((t) =>
        t.dependsOn.includes(id) ? touch(t, { dependsOn: t.dependsOn.filter((x) => x !== id) }, now) : t,
      );
      const goals = d.goals.map((g) => (g.taskIds.includes(id) ? touch(g, { taskIds: g.taskIds.filter((x) => x !== id) }, now) : g));
      tasks.forEach((t, i) => t !== others[i] && persist('tasks', t));
      goals.forEach((g, i) => g !== d.goals[i] && persist('goals', g));
      setData((cur) => ({ ...cur, tasks, goals }));
      unpersist('tasks', id);
    },
    [persist, unpersist, stopRunningOn],
  );

  // --- Listes, horaires, événements, objectifs -----------------------------------
  const addProject = useCallback(
    (fields: Fields<Project>) => {
      const p = createEntity<Project>(fields);
      setData((d) => ({ ...d, projects: [...d.projects, p] }));
      persist('projects', p);
      return p;
    },
    [persist],
  );
  const saveProject = useCallback((p: Project) => saveIn('projects', p), [saveIn]);
  const deleteProject = useCallback(
    (id: ID) => {
      const before = dataRef.current.tasks;
      const tasks = before.map((t) => (t.projectId === id ? touch(t, { projectId: undefined }) : t));
      tasks.forEach((t, i) => t !== before[i] && persist('tasks', t));
      setData((d) => ({ ...d, tasks, projects: d.projects.filter((p) => p.id !== id) }));
      unpersist('projects', id);
    },
    [persist, unpersist],
  );

  const addWindow = useCallback(
    (fields: Fields<TimeWindow>) => {
      const w = createEntity<TimeWindow>(fields);
      setData((d) => ({ ...d, windows: [...d.windows, w] }));
      persist('windows', w);
      return w;
    },
    [persist],
  );
  const saveWindow = useCallback((w: TimeWindow) => saveIn('windows', w), [saveIn]);
  const deleteWindow = useCallback(
    (id: ID) => {
      const d = dataRef.current;
      const tasks = d.tasks.map((t) => (t.windowId === id ? touch(t, { windowId: undefined }) : t));
      const projects = d.projects.map((p) => (p.defaultWindowId === id ? touch(p, { defaultWindowId: undefined }) : p));
      tasks.forEach((t, i) => t !== d.tasks[i] && persist('tasks', t));
      projects.forEach((p, i) => p !== d.projects[i] && persist('projects', p));
      let settings = d.settings;
      if (settings.defaultWindowId === id) {
        settings = { ...settings, defaultWindowId: undefined, updatedAt: new Date().toISOString() };
        repo.saveSettings(settings).catch(console.error);
      }
      setData((cur) => ({ ...cur, tasks, projects, settings, windows: cur.windows.filter((w) => w.id !== id) }));
      unpersist('windows', id);
    },
    [persist, unpersist, repo],
  );

  const addEvent = useCallback(
    (fields: Fields<CalendarEvent>) => {
      const e = createEntity<CalendarEvent>(fields);
      setData((d) => ({ ...d, events: [...d.events, e] }));
      persist('events', e);
      return e;
    },
    [persist],
  );
  const saveEvent = useCallback((e: CalendarEvent) => saveIn('events', e), [saveIn]);
  const deleteEvent = useCallback(
    (id: ID) => {
      setData((d) => ({ ...d, events: d.events.filter((e) => e.id !== id) }));
      unpersist('events', id);
    },
    [unpersist],
  );

  /** Applique des objectifs modifiés ou supprimés (référence à jour tout de suite, pour les appels enchaînés). */
  const applyGoals = useCallback(
    (changed: Goal[], removed: ID[]) => {
      const apply = (list: Goal[]) => changed.reduce(upsert, list.filter((g) => !removed.includes(g.id)));
      dataRef.current = { ...dataRef.current, goals: apply(dataRef.current.goals) };
      setData((d) => ({ ...d, goals: apply(d.goals) }));
      changed.forEach((g) => persist('goals', g));
      removed.forEach((id) => unpersist('goals', id));
    },
    [persist, unpersist],
  );

  const pickTask = useCallback(
    (taskId: ID, period: GoalPeriod, periodStart: ISODate) => {
      const own = goalsOf(dataRef.current.goals, period, periodStart);
      if (own.some((g) => g.taskIds.includes(taskId))) return;
      const container = own[0];
      const next = container
        ? touch(container, { taskIds: [...container.taskIds, taskId] })
        : createEntity<Goal>({ title: 'Objectifs', period, periodStart, taskIds: [taskId], done: false });
      applyGoals([next], []);
    },
    [applyGoals],
  );

  const unpickTask = useCallback(
    (taskId: ID, period: GoalPeriod, periodStart: ISODate) => {
      const changed: Goal[] = [];
      const removed: ID[] = [];
      for (const g of goalsOf(dataRef.current.goals, period, periodStart)) {
        if (!g.taskIds.includes(taskId)) continue;
        const taskIds = g.taskIds.filter((x) => x !== taskId);
        if (taskIds.length) changed.push(touch(g, { taskIds }));
        else removed.push(g.id);
      }
      if (changed.length || removed.length) applyGoals(changed, removed);
    },
    [applyGoals],
  );

  // --- Chrono --------------------------------------------------------------------
  const active = useMemo(() => activeEntry(data.timeEntries), [data.timeEntries]);
  const lastTimedTaskId = useMemo(() => {
    let last: TimeEntry | undefined;
    for (const e of data.timeEntries) if (e.taskId && (!last || e.start > last.start)) last = e;
    return last?.taskId;
  }, [data.timeEntries]);

  const startTimer = useCallback(
    (taskId?: ID) => {
      const { entries, started, stopped } = startEntry(dataRef.current.timeEntries, taskId, new Date());
      setData((d) => ({ ...d, timeEntries: entries }));
      if (stopped) persist('timeEntries', stopped);
      persist('timeEntries', started);
    },
    [persist],
  );

  const pauseTimer = useCallback(() => {
    const { entries, stopped } = stopEntry(dataRef.current.timeEntries, new Date());
    setData((d) => ({ ...d, timeEntries: entries }));
    if (stopped) persist('timeEntries', stopped);
  }, [persist]);

  const finishTimer = useCallback(() => {
    const running = activeEntry(dataRef.current.timeEntries);
    pauseTimer();
    if (running?.taskId) {
      const task = dataRef.current.tasks.find((t) => t.id === running.taskId);
      if (task && task.status === 'todo') saveIn('tasks', { ...task, status: 'done', doneAt: new Date().toISOString() });
    }
  }, [pauseTimer, saveIn]);

  const timeSpent = useCallback(
    (taskId: ID, now = new Date()) =>
      data.timeEntries.reduce((sum, e) => (e.taskId === taskId ? sum + entryDuration(e, now) : sum), 0),
    [data.timeEntries],
  );

  // --- Réglages, import/export, exemple --------------------------------------------
  const updateSettings = useCallback(
    (changes: Partial<Settings>) => {
      const settings = { ...dataRef.current.settings, ...changes, updatedAt: new Date().toISOString() };
      dataRef.current = { ...dataRef.current, settings };
      setData((d) => ({ ...d, settings }));
      repo.saveSettings(settings).catch(console.error);
    },
    [repo],
  );

  // --- Cycle -----------------------------------------------------------------------
  const saveCycleDay = useCallback(
    (day: DayData) => {
      const existing = dataRef.current.cycleDays.find((d) => d.date === day.date);
      if (!hasLog(day as CycleDay)) {
        if (!existing) return;
        dataRef.current = { ...dataRef.current, cycleDays: dataRef.current.cycleDays.filter((d) => d.date !== day.date) };
        setData((d) => ({ ...d, cycleDays: d.cycleDays.filter((x) => x.date !== day.date) }));
        unpersist('cycleDays', existing.id);
        return;
      }
      // Le jour enregistré remplace entièrement le précédent (un champ vidé disparaît).
      const saved = existing
        ? { ...day, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() }
        : createEntity<CycleDay>(day, new Date(), day.date);
      dataRef.current = { ...dataRef.current, cycleDays: upsert(dataRef.current.cycleDays, saved) };
      setData((d) => ({ ...d, cycleDays: upsert(d.cycleDays, saved) }));
      persist('cycleDays', saved);
    },
    [persist, unpersist],
  );

  const setCycleMark = useCallback(
    (startDate: ISODate, changes: { excluded?: boolean; note?: string }) => {
      const existing = dataRef.current.cycleMarks.find((m) => m.startDate === startDate);
      const next = { startDate, excluded: false, ...(existing && { excluded: existing.excluded, note: existing.note }), ...changes };
      const note = next.note?.trim() || undefined;
      if (!next.excluded && !note) {
        if (!existing) return;
        dataRef.current = { ...dataRef.current, cycleMarks: dataRef.current.cycleMarks.filter((m) => m.id !== existing.id) };
        setData((d) => ({ ...d, cycleMarks: d.cycleMarks.filter((m) => m.id !== existing.id) }));
        unpersist('cycleMarks', existing.id);
        return;
      }
      const fields = { startDate, excluded: next.excluded, note };
      const saved = existing ? touch(existing, fields) : createEntity<CycleMark>(fields, new Date(), startDate);
      dataRef.current = { ...dataRef.current, cycleMarks: upsert(dataRef.current.cycleMarks, saved) };
      setData((d) => ({ ...d, cycleMarks: upsert(d.cycleMarks, saved) }));
      persist('cycleMarks', saved);
    },
    [persist, unpersist],
  );

  const updateCycleSettings = useCallback(
    (changes: Partial<CycleSettings>) => updateSettings({ cycle: { ...cycleSettingsOf(dataRef.current.settings), ...changes } }),
    [updateSettings],
  );

  const importCycle = useCallback(
    async (imported: ClueImport) => {
      const now = new Date();
      const byDate = new Map(dataRef.current.cycleDays.map((d) => [d.date, d]));
      const days = imported.days.map((incoming) => {
        const existing = byDate.get(incoming.date);
        const merged = mergeDay(existing, incoming);
        return existing ? touch(existing, merged, now) : createEntity<CycleDay>(merged, now, incoming.date);
      });
      const marksByStart = new Map(dataRef.current.cycleMarks.map((m) => [m.startDate, m]));
      const marks = imported.marks.map((m) => {
        const existing = marksByStart.get(m.startDate);
        // Une note ajoutée ici n'est pas effacée par un cycle sans note dans Clue.
        return existing ? touch(existing, { ...m, note: m.note ?? existing.note }, now) : createEntity<CycleMark>(m, now, m.startDate);
      });
      await repo.putMany('cycleDays', days);
      await repo.putMany('cycleMarks', marks);
      const merge = <T extends Entity>(list: T[], extra: T[]) => extra.reduce(upsert, list);
      dataRef.current = {
        ...dataRef.current,
        cycleDays: merge(dataRef.current.cycleDays, days),
        cycleMarks: merge(dataRef.current.cycleMarks, marks),
      };
      setData((d) => ({ ...d, cycleDays: merge(d.cycleDays, days), cycleMarks: merge(d.cycleMarks, marks) }));
      const current = cycleSettingsOf(dataRef.current.settings);
      const { customTags, categories, ...rest } = imported.settings;
      // Catégories et étiquettes : celles déjà suivies plus celles de Clue, dans l'ordre du catalogue.
      const order = (k: string) => {
        const i = CATEGORIES.findIndex((c) => c.key === k);
        return i < 0 ? CATEGORIES.length : i;
      };
      const allCategories = [...new Set([...current.categories, ...(categories ?? [])])].sort((a, b) => order(a) - order(b));
      updateCycleSettings({
        ...rest,
        categories: allCategories,
        customTags: [...new Set([...current.customTags, ...(customTags ?? [])])],
      });
    },
    [repo, updateCycleSettings],
  );

  const clearCycle = useCallback(async () => {
    const { cycleDays, cycleMarks } = dataRef.current;
    await Promise.all([...cycleDays.map((d) => repo.remove('cycleDays', d.id)), ...cycleMarks.map((m) => repo.remove('cycleMarks', m.id))]);
    dataRef.current = { ...dataRef.current, cycleDays: [], cycleMarks: [] };
    setData((d) => ({ ...d, cycleDays: [], cycleMarks: [] }));
  }, [repo]);

  const exportData = useCallback(() => repo.exportAll(), [repo]);

  const importData = useCallback(
    async (incoming: ExportData, mode: 'replace' | 'merge') => {
      await repo.importAll(incoming, mode);
      setData(await loadAll(repo));
    },
    [repo],
  );

  const loadSample = useCallback(() => {
    const sample = sampleData();
    setData((d) => {
      const merge = <T extends Entity>(list: T[], extra: T[]) => extra.reduce(upsert, list);
      return {
        ...d,
        projects: merge(d.projects, sample.projects),
        tasks: merge(d.tasks, sample.tasks),
        events: merge(d.events, sample.events),
        goals: merge(d.goals, sample.goals),
      };
    });
    sample.projects.forEach((p) => persist('projects', p));
    sample.tasks.forEach((t) => persist('tasks', t));
    sample.events.forEach((e) => persist('events', e));
    sample.goals.forEach((g) => persist('goals', g));
  }, [persist]);

  const value: Store = {
    ...data,
    ready,
    plan,
    planAt,
    replan,
    addTask,
    saveTask,
    setTaskDone,
    deleteTask,
    addProject,
    saveProject,
    deleteProject,
    addWindow,
    saveWindow,
    deleteWindow,
    addEvent,
    saveEvent,
    deleteEvent,
    pickTask,
    unpickTask,
    active,
    lastTimedTaskId,
    startTimer,
    pauseTimer,
    finishTimer,
    timeSpent,
    saveCycleDay,
    setCycleMark,
    updateCycleSettings,
    importCycle,
    clearCycle,
    updateSettings,
    exportData,
    importData,
    loadSample,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
