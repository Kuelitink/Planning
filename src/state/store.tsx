/**
 * État de l'application : données (IndexedDB), plan calculé par le moteur, chrono.
 *
 * Chaque action met à jour l'état React puis écrit dans le dépôt local. Le plan
 * est recalculé à chaque modification des données, quand on appuie sur
 * « Auto-planifier », et au retour dans l'app si le dernier calcul date.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CalendarEvent, Entity, Goal, ID, Project, Settings, Task, TimeEntry, TimeWindow } from '../core/types';
import { DEFAULT_SETTINGS } from '../core/types';
import { createEntity, createTask, touch, type NewTask } from '../core/entity';
import { schedule, type ScheduleResult } from '../core/scheduler';
import { activeEntry, entryDuration, startTimer as startEntry, stopTimer as stopEntry } from '../core/timer';
import { MINUTE, parseDateTime, roundUpToGrid } from '../core/time';
import type { CollectionName, ExportData, Repository } from '../storage/repository';
import { IndexedDBRepository } from '../storage/indexeddb';
import { initialSeed, sampleData } from './defaults';

export interface AppData {
  projects: Project[];
  windows: TimeWindow[];
  tasks: Task[];
  events: CalendarEvent[];
  goals: Goal[];
  timeEntries: TimeEntry[];
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

  addGoal(fields: Fields<Goal>): Goal;
  saveGoal(goal: Goal): void;
  deleteGoal(id: ID): void;

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

  updateSettings(changes: Partial<Settings>): void;
  exportData(): Promise<ExportData>;
  importData(data: ExportData, mode: 'replace' | 'merge'): Promise<void>;
  loadSample(): void;
}

const EMPTY: AppData = { projects: [], windows: [], tasks: [], events: [], goals: [], timeEntries: [], settings: DEFAULT_SETTINGS };
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
 * chronométré, et la tâche en cours de chrono fixée sur sa session.
 */
export function tasksForScheduling(data: AppData, now: Date): Task[] {
  const grid = Math.max(1, data.settings.granularityMin);
  const running = activeEntry(data.timeEntries);
  const spent = new Map<ID, number>();
  for (const e of data.timeEntries) {
    if (!e.taskId || e === running) continue;
    spent.set(e.taskId, (spent.get(e.taskId) ?? 0) + entryDuration(e, now));
  }
  return data.tasks.map((t) => {
    if (t.status !== 'todo') return t;
    const spentMin = Math.floor((spent.get(t.id) ?? 0) / MINUTE);
    const remaining = Math.max(grid, t.durationMin - spentMin);
    if (running && running.taskId === t.id && !t.pinned) {
      const start = parseDateTime(running.start);
      const minEnd = roundUpToGrid(now.getTime() + MINUTE, grid);
      const end = Math.max(start.getTime() + remaining * MINUTE, minEnd);
      return { ...t, pinned: { start: start.toISOString(), end: new Date(end).toISOString() } };
    }
    return remaining === t.durationMin ? t : { ...t, durationMin: remaining };
  });
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
      const [projects, windows, tasks, events, goals, timeEntries, savedSettings] = await Promise.all([
        repo.list('projects'),
        repo.list('windows'),
        repo.list('tasks'),
        repo.list('events'),
        repo.list('goals'),
        repo.list('timeEntries'),
        repo.getSettings(),
      ]);
      let next: AppData = { projects, windows, tasks, events, goals, timeEntries, settings: savedSettings };
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
    const result = schedule({
      tasks: tasksForScheduling(data, now),
      events: data.events,
      windows: data.windows,
      projects: data.projects,
      settings: data.settings,
      now,
    });
    return { plan: result, planAt: now };
    // `planTick` force un nouveau calcul avec l'heure actuelle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data.tasks, data.events, data.windows, data.projects, data.settings, data.timeEntries, planTick]);

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

  const addGoal = useCallback(
    (fields: Fields<Goal>) => {
      const g = createEntity<Goal>(fields);
      setData((d) => ({ ...d, goals: [...d.goals, g] }));
      persist('goals', g);
      return g;
    },
    [persist],
  );
  const saveGoal = useCallback((g: Goal) => saveIn('goals', g), [saveIn]);
  const deleteGoal = useCallback(
    (id: ID) => {
      setData((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== id) }));
      unpersist('goals', id);
    },
    [unpersist],
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
      setData((d) => ({ ...d, settings }));
      repo.saveSettings(settings).catch(console.error);
    },
    [repo],
  );

  const exportData = useCallback(() => repo.exportAll(), [repo]);

  const importData = useCallback(
    async (incoming: ExportData, mode: 'replace' | 'merge') => {
      await repo.importAll(incoming, mode);
      const [projects, windows, tasks, events, goals, timeEntries, settings] = await Promise.all([
        repo.list('projects'),
        repo.list('windows'),
        repo.list('tasks'),
        repo.list('events'),
        repo.list('goals'),
        repo.list('timeEntries'),
        repo.getSettings(),
      ]);
      setData({ projects, windows, tasks, events, goals, timeEntries, settings });
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
    addGoal,
    saveGoal,
    deleteGoal,
    active,
    lastTimedTaskId,
    startTimer,
    pauseTimer,
    finishTimer,
    timeSpent,
    updateSettings,
    exportData,
    importData,
    loadSample,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
