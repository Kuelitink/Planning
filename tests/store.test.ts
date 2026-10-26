import { describe, expect, it } from 'vitest';
import { createEntity } from '../src/core/entity';
import type { Goal, TimeEntry } from '../src/core/types';
import { schedule } from '../src/core/scheduler';
import { initialSeed, sampleData } from '../src/state/defaults';
import { computePlan, mergeSample, tasksForScheduling, type AppData } from '../src/state/store';
import { at, blocksOf, event, settings, task } from './helpers';

const entry = (id: string, taskId: string, start: string, end?: string): TimeEntry =>
  createEntity<TimeEntry>(
    { taskId, start: at(start).toISOString(), end: end ? at(end).toISOString() : undefined },
    new Date('2026-10-01T00:00:00'),
    id,
  );

const data = (overrides: Partial<AppData>): AppData => ({
  projects: [],
  windows: [],
  tasks: [],
  events: [],
  goals: [],
  timeEntries: [],
  cycleDays: [],
  cycleMarks: [],
  settings: settings(),
  ...overrides,
});

describe('tâches vues par le planificateur', () => {
  it('déduit le temps déjà chronométré de la durée', () => {
    const d = data({
      tasks: [task('Rapport', { durationMin: 90 })],
      timeEntries: [entry('e1', 'Rapport', '2026-10-19 08:00', '2026-10-19 08:40')],
    });
    const [t] = tasksForScheduling(d, at('2026-10-19 09:00'));
    expect(t.durationMin).toBe(50);
  });

  it('garde au moins un pas de grille quand tout le temps prévu est écoulé', () => {
    const d = data({
      tasks: [task('Rapport', { durationMin: 30 })],
      timeEntries: [entry('e1', 'Rapport', '2026-10-19 08:00', '2026-10-19 09:00')],
    });
    expect(tasksForScheduling(d, at('2026-10-19 09:30'))[0].durationMin).toBe(15);
  });

  it('fixe la tâche chronométrée sur sa session en cours', () => {
    const now = at('2026-10-19 10:12');
    const d = data({
      tasks: [task('Rapport', { durationMin: 90, priority: 4 }), task('Mails', { durationMin: 30, priority: 1 })],
      timeEntries: [entry('e1', 'Rapport', '2026-10-19 09:30')],
    });
    const tasks = tasksForScheduling(d, now);
    const result = schedule({ tasks, events: [], windows: [], settings: d.settings, now });
    expect(blocksOf(result, 'Rapport')).toEqual([['10-19 09:30', '10-19 11:00']]);
    expect(blocksOf(result, 'Mails')).toEqual([['10-19 11:00', '10-19 11:30']]);
  });

  it("prolonge la session au-delà de l'estimation si elle déborde", () => {
    const now = at('2026-10-19 11:20');
    const d = data({
      tasks: [task('Rapport', { durationMin: 60 })],
      timeEntries: [entry('e1', 'Rapport', '2026-10-19 09:30')],
    });
    const pinned = tasksForScheduling(d, now)[0].pinned!;
    expect(new Date(pinned.end).getTime()).toBeGreaterThan(now.getTime());
  });
});

const goal = (id: string, period: Goal['period'], periodStart: string, taskIds: string[]): Goal =>
  createEntity<Goal>({ title: 'Objectifs', period, periodStart, taskIds, done: false }, new Date('2026-10-01T00:00:00'), id);

describe('objectifs et planification', () => {
  it("un objectif du jour P4 passe avant une P2 sans échéance", () => {
    const d = data({
      tasks: [task('Mails', { priority: 2, durationMin: 30 }), task('Photos', { priority: 4, durationMin: 60 })],
      goals: [goal('jour', 'day', '2026-10-19', ['Photos'])],
    });
    const plan = computePlan(d, at('2026-10-19 08:00'));
    expect(blocksOf(plan, 'Photos')).toEqual([['10-19 08:00', '10-19 09:00']]);
    expect(blocksOf(plan, 'Mails')).toEqual([['10-19 09:00', '10-19 09:30']]);
  });

  it("une échéance réelle plus proche que la fin de la période reste respectée", () => {
    const d = data({
      tasks: [
        task('Objectif du jour', { priority: 1, durationMin: 60 }),
        task('Dans 2 h', { priority: 4, durationMin: 30, deadline: at('2026-10-19 10:00').toISOString() }),
      ],
      goals: [goal('jour', 'day', '2026-10-19', ['Objectif du jour']), goal('semaine', 'week', '2026-10-19', ['Dans 2 h'])],
    });
    const plan = computePlan(d, at('2026-10-19 08:00'));
    expect(blocksOf(plan, 'Dans 2 h')).toEqual([['10-19 08:00', '10-19 08:30']]);
    expect(tasksForScheduling(d, at('2026-10-19 08:00')).find((t) => t.id === 'Dans 2 h')!.deadline).toBe(
      at('2026-10-19 10:00').toISOString(),
    );
  });

  it("un objectif qui ne tient pas dans la journée n'est pas « en retard »", () => {
    const d = data({
      tasks: [task('Objectif', { durationMin: 60 }), task('Vraie échéance', { durationMin: 60, deadline: '2026-10-19' })],
      goals: [goal('jour', 'day', '2026-10-19', ['Objectif'])],
    });
    // 21:00 : plus de créneau aujourd'hui (horaires par défaut 08:00–20:00).
    const plan = computePlan(d, at('2026-10-19 21:00'));
    expect(blocksOf(plan, 'Objectif')[0][0]).toBe('10-20 08:00');
    expect(plan.atRisk.map((r) => r.taskId)).toEqual(['Vraie échéance']);
  });
});

describe("jeu d'exemple", () => {
  const now = new Date('2026-10-19T08:00:00');
  const firstLaunch = () => {
    const seed = initialSeed(now);
    return data({ projects: seed.projects, windows: seed.windows, settings: seed.settings });
  };

  it("réutilise la liste « Travail » du premier lancement au lieu d'en créer une deuxième", () => {
    const { data: d, added } = mergeSample(firstLaunch(), sampleData(now));
    expect(d.projects.map((p) => p.name)).toEqual(['Perso', 'Travail', 'Site web', 'Maison', 'Sport']);
    expect(d.projects.find((p) => p.name === 'Travail')!.id).toBe('travail');
    expect(d.tasks.filter((t) => t.projectId === 'travail').map((t) => t.id)).toEqual(['ex-rapport', 'ex-relire', 'ex-mails']);
    expect(d.tasks.some((t) => t.projectId === 'ex-travail')).toBe(false);
    // Seuls les éléments ajoutés sont enregistrés, avec leur liste remappée.
    expect(added.projects.map((p) => p.id)).toEqual(['ex-web', 'ex-maison', 'ex-sport']);
    expect(added.tasks.find((t) => t.id === 'ex-rapport')!.projectId).toBe('travail');
  });

  it("charger l'exemple deux fois ne change rien", () => {
    const once = mergeSample(firstLaunch(), sampleData(now)).data;
    const twice = mergeSample(once, sampleData(now)).data;
    expect(twice).toEqual(once);
  });
});

describe('checklist et hiérarchie', () => {
  const day = (ids: string[]) => goal('jour', 'day', '2026-10-19', ids);
  const project = (id: string, order: number) =>
    createEntity<AppData['projects'][number]>({ name: id, color: '#3D6FE0', archived: false, order }, new Date('2026-10-01T00:00:00'), id);

  it('checklist : ASAP le jour, haute la semaine, normale le mois', () => {
    const d = data({
      tasks: [task('Jour', { priority: 4 }), task('Semaine', { priority: 4 }), task('Mois', { priority: 4 }), task('Haute', { priority: 2 })],
      goals: [day(['Jour']), goal('semaine', 'week', '2026-10-19', ['Semaine', 'Haute']), goal('mois', 'month', '2026-10-01', ['Mois'])],
    });
    const prio = Object.fromEntries(tasksForScheduling(d, at('2026-10-19 08:00')).map((t) => [t.id, t.priority]));
    expect(prio).toEqual({ Jour: 1, Semaine: 2, Mois: 3, Haute: 2 });
  });

  it('en haut de la checklist = planifiée en premier', () => {
    const d = data({
      tasks: [task('Premier'), task('Deuxième'), task('Troisième')],
      goals: [day(['Troisième', 'Premier', 'Deuxième'])],
    });
    const plan = computePlan(d, at('2026-10-19 08:00'));
    expect(plan.blocks.map((b) => b.taskId)).toEqual(['Troisième', 'Premier', 'Deuxième']);
  });

  it('à priorité égale, la liste du dessus passe avant ; une haute de la liste du dessous passe avant une normale du dessus', () => {
    const d = data({
      projects: [project('Haut', 0), project('Bas', 1)],
      tasks: [
        task('Bas normale', { projectId: 'Bas', priority: 3 }),
        task('Haut normale', { projectId: 'Haut', priority: 3 }),
        task('Bas ASAP', { projectId: 'Bas', priority: 1 }),
        task('Haut ASAP', { projectId: 'Haut', priority: 1 }),
        task('Bas haute', { projectId: 'Bas', priority: 2 }),
      ],
    });
    const plan = computePlan(d, at('2026-10-19 08:00'));
    expect(plan.blocks.map((b) => b.taskId)).toEqual(['Haut ASAP', 'Bas ASAP', 'Bas haute', 'Haut normale', 'Bas normale']);
  });

  it('une tâche mère ne se planifie pas : ses sous-tâches héritent de sa place et de son échéance', () => {
    const d = data({
      tasks: [
        task('Autre', { priority: 1 }),
        task('Mère', { priority: 4, durationMin: 60 }),
        task('Sous 2', { parentId: 'Mère', order: 1 }),
        task('Sous 1', { parentId: 'Mère', order: 0 }),
        task('Après', { dependsOn: ['Mère'], priority: 1 }),
      ],
      goals: [day(['Mère', 'Autre'])],
    });
    const now = at('2026-10-19 08:00');
    const plan = computePlan(d, now);
    expect(blocksOf(plan, 'Mère')).toEqual([]);
    expect(plan.blocks.map((b) => b.taskId)).toEqual(['Sous 1', 'Sous 2', 'Autre', 'Après']);
    const sub = tasksForScheduling(d, now).find((t) => t.id === 'Sous 1')!;
    expect(sub.priority).toBe(1);
    expect(new Date(sub.deadline!).getTime()).toBe(at('2026-10-20 00:00').getTime());
  });
});

describe('ordre des listes', () => {
  it("à priorité égale, en haut de la liste = planifiée d'abord", () => {
    const d = data({
      tasks: [task('Deuxième', { order: 1 }), task('Troisième', { order: 2 }), task('Première', { order: 0 })],
    });
    const plan = computePlan(d, at('2026-10-19 08:00'));
    expect(plan.blocks.map((b) => b.taskId)).toEqual(['Première', 'Deuxième', 'Troisième']);
  });
});

describe('récurrence et marges', () => {
  it("une tâche récurrente est planifiée le jour de son occurrence, et due avant la fin du jour", () => {
    const d = data({
      tasks: [task('Sport', { durationMin: 60, recurrence: { freq: 'daily', interval: 1, start: '2026-10-19' }, occurrence: '2026-10-20' })],
    });
    const plan = computePlan(d, at('2026-10-19 08:00'));
    expect(blocksOf(plan, 'Sport')).toEqual([['10-20 08:00', '10-20 09:00']]);
    const t = tasksForScheduling(d, at('2026-10-19 08:00'))[0];
    expect(new Date(t.deadline!).getTime()).toBe(at('2026-10-21 00:00').getTime());
  });

  it("une tâche de la checklist du jour déjà faite pour aujourd'hui n'y est plus pressée", () => {
    const d = data({
      tasks: [task('Sport', { priority: 4, recurrence: { freq: 'daily', interval: 1, start: '2026-10-19' }, occurrence: '2026-10-20' })],
      goals: [goal('jour', 'day', '2026-10-19', ['Sport'])],
    });
    expect(tasksForScheduling(d, at('2026-10-19 08:00'))[0].priority).toBe(4);
  });

  it('les marges laissent du temps libre avant et après la tâche', () => {
    const d = data({
      tasks: [task('Rendez-vous', { durationMin: 60, priority: 1, bufferBeforeMin: 30, bufferAfterMin: 15 }), task('Mails', { durationMin: 30 })],
      events: [event('Réunion', '2026-10-19 08:00', '2026-10-19 09:00')],
    });
    const plan = computePlan(d, at('2026-10-19 08:00'));
    expect(blocksOf(plan, 'Rendez-vous')).toEqual([['10-19 09:30', '10-19 10:30']]);
    expect(blocksOf(plan, 'Mails')).toEqual([['10-19 10:45', '10-19 11:15']]);
  });
});
