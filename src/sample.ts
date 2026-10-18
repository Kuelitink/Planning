/** Données d'exemple (lundi 19 octobre 2026) pour l'écran provisoire. */

import { createEntity, createTask } from './core/entity';
import type { CalendarEvent, Project, TimeWindow } from './core/types';

const created = new Date(2026, 9, 1);
const at = (h: number, m = 0) => new Date(2026, 9, 19, h, m).toISOString();

export const sampleNow = new Date(2026, 9, 19, 8, 0);

export const sampleProjects: Project[] = [
  createEntity<Project>({ name: 'Travail', color: '#2450E8', archived: false, order: 0 }, created, 'travail'),
  createEntity<Project>({ name: 'Site web', color: '#7A3FD1', archived: false, order: 1 }, created, 'web'),
  createEntity<Project>({ name: 'Maison', color: '#0E8A6A', archived: false, order: 2 }, created, 'maison'),
  createEntity<Project>({ name: 'Sport', color: '#D9601A', archived: false, order: 3 }, created, 'sport'),
];

export const sampleWindows: TimeWindow[] = [
  createEntity<TimeWindow>(
    { name: 'Soir', rules: ([0, 1, 2, 3, 4, 5, 6] as const).map((weekday) => ({ weekday, start: '17:00', end: '20:00' })) },
    created,
    'soir',
  ),
];

export const sampleEvents: CalendarEvent[] = [
  createEntity<CalendarEvent>({ title: "Réunion d'équipe", start: at(9), end: at(9, 30) }, created, 'reunion'),
  createEntity<CalendarEvent>({ title: 'Déjeuner', start: at(12), end: at(13) }, created, 'dejeuner'),
  createEntity<CalendarEvent>({ title: 'Appel fournisseur', start: at(15), end: at(15, 30) }, created, 'appel'),
];

export const sampleTasks = [
  createTask({ title: 'Rédiger le rapport mensuel', projectId: 'travail', priority: 1, durationMin: 90, deadline: '2026-10-20' }, created, 'rapport'),
  createTask({ title: 'Répondre aux mails clients', projectId: 'travail', priority: 2, durationMin: 30 }, created, 'mails'),
  createTask({ title: "Maquette page d'accueil", projectId: 'web', priority: 2, durationMin: 90, deadline: '2026-10-21' }, created, 'maquette'),
  createTask({ title: 'Intégrer le formulaire de contact', projectId: 'web', priority: 3, durationMin: 60, dependsOn: ['maquette'] }, created, 'formulaire'),
  createTask({ title: 'Courses de la semaine', projectId: 'maison', priority: 3, durationMin: 45, windowId: 'soir' }, created, 'courses'),
  createTask({ title: 'Course à pied 8 km', projectId: 'sport', priority: 4, durationMin: 45, windowId: 'soir' }, created, 'course'),
];
