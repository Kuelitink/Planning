/** Données de départ (premier lancement) et jeu d'exemple. */

import { createEntity, createTask } from '../core/entity';
import type { CalendarEvent, Goal, Project, Settings, Task, TimeWindow, Weekday } from '../core/types';
import { DEFAULT_SETTINGS } from '../core/types';
import { addDays, startOfDay, startOfWeek, toISODate } from '../core/time';
import { TONES } from '../ui/palette';

const EVERY_DAY: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

const rules = (days: Weekday[], start: string, end: string) => days.map((weekday) => ({ weekday, start, end }));

export interface Seed {
  projects: Project[];
  windows: TimeWindow[];
  settings: Settings;
}

/** Horaires et listes proposés au premier lancement. */
export function initialSeed(now = new Date()): Seed {
  const windows = [
    createEntity<TimeWindow>({ name: 'Journée', rules: rules(EVERY_DAY, '08:00', '20:00') }, now, 'journee'),
    createEntity<TimeWindow>({ name: 'Bureau', rules: rules(WEEKDAYS, '09:00', '18:00') }, now, 'bureau'),
    createEntity<TimeWindow>({ name: 'Matin', rules: rules(EVERY_DAY, '08:00', '12:00') }, now, 'matin'),
    createEntity<TimeWindow>({ name: 'Soir', rules: rules(EVERY_DAY, '18:00', '22:00') }, now, 'soir'),
  ];
  const projects = [
    createEntity<Project>({ name: 'Perso', color: TONES[2].dot, archived: false, order: 0 }, now, 'perso'),
    createEntity<Project>({ name: 'Travail', color: TONES[0].dot, archived: false, order: 1, defaultWindowId: 'bureau' }, now, 'travail'),
  ];
  return { projects, windows, settings: { ...DEFAULT_SETTINGS, defaultWindowId: 'journee', updatedAt: now.toISOString() } };
}

export interface Sample {
  projects: Project[];
  tasks: Task[];
  events: CalendarEvent[];
  goals: Goal[];
}

/** Jeu d'exemple autour de la date du jour (pour découvrir l'app). */
export function sampleData(now = new Date()): Sample {
  const today = startOfDay(now);
  const at = (dayOffset: number, h: number, m = 0) => {
    const d = addDays(today, dayOffset);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const day = (offset: number) => toISODate(addDays(today, offset));
  const p = (id: string, name: string, tone: number, order: number, defaultWindowId?: string) =>
    createEntity<Project>({ name, color: TONES[tone].dot, archived: false, order, defaultWindowId }, now, `ex-${id}`);

  const projects = [
    p('travail', 'Travail', 0, 10, 'bureau'),
    p('web', 'Site web', 1, 11, 'bureau'),
    p('maison', 'Maison', 2, 12),
    p('sport', 'Sport', 3, 13, 'soir'),
  ];
  const t = (id: string, fields: Parameters<typeof createTask>[0]) => createTask(fields, now, `ex-${id}`);
  const tasks = [
    t('rapport', { title: 'Rédiger le rapport mensuel', projectId: 'ex-travail', priority: 1, durationMin: 90, deadline: day(1), splittable: true, minChunkMin: 30 }),
    t('relire', { title: 'Relire et envoyer le rapport', projectId: 'ex-travail', priority: 2, durationMin: 30, dependsOn: ['ex-rapport'], deadline: day(1) }),
    t('mails', { title: 'Répondre aux mails clients', projectId: 'ex-travail', priority: 2, durationMin: 30 }),
    t('brief', { title: 'Valider le brief', projectId: 'ex-web', priority: 2, durationMin: 30, status: 'done', doneAt: at(0, 8, 30) }),
    t('maquette', { title: "Maquette page d'accueil", projectId: 'ex-web', priority: 2, durationMin: 90, deadline: day(2), dependsOn: ['ex-brief'] }),
    t('formulaire', { title: 'Intégrer le formulaire de contact', projectId: 'ex-web', priority: 3, durationMin: 60, dependsOn: ['ex-maquette'] }),
    t('enligne', { title: 'Mettre le site en ligne', projectId: 'ex-web', priority: 1, durationMin: 30, deadline: day(4), dependsOn: ['ex-formulaire'], windowId: 'matin' }),
    t('courses', { title: 'Courses de la semaine', projectId: 'ex-maison', priority: 3, durationMin: 45, windowId: 'soir' }),
    t('photos', { title: 'Trier les photos de vacances', projectId: 'ex-maison', priority: 4, durationMin: 120, splittable: true, minChunkMin: 30 }),
    t('course', { title: 'Course à pied 8 km', projectId: 'ex-sport', priority: 4, durationMin: 45 }),
  ];
  const e = (id: string, title: string, start: string, end: string, weekdays?: Weekday[]) =>
    createEntity<CalendarEvent>(
      { title, start, end, recurrence: weekdays ? { freq: 'weekly', weekdays } : undefined },
      now,
      `ex-${id}`,
    );
  const events = [
    e('reunion', "Réunion d'équipe", at(0, 9), at(0, 9, 30), WEEKDAYS),
    e('dejeuner', 'Déjeuner', at(0, 12), at(0, 13), EVERY_DAY),
    e('appel', 'Appel fournisseur', at(0, 15), at(0, 15, 30)),
  ];
  const week = toISODate(startOfWeek(now, 1));
  const g = (id: string, fields: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>) => createEntity<Goal>(fields, now, `ex-${id}`);
  const goals = [
    g('rapport', { title: 'Envoyer le rapport mensuel', period: 'week', periodStart: week, taskIds: ['ex-rapport', 'ex-relire'], done: false }),
    g('site', { title: 'Mettre le site en ligne', period: 'week', periodStart: week, taskIds: ['ex-maquette', 'ex-formulaire', 'ex-enligne'], done: false }),
    g('courir', { title: 'Courir 3 fois', period: 'week', periodStart: week, taskIds: ['ex-course'], target: 3, progress: 1, done: false }),
  ];
  return { projects, tasks, events, goals };
}
