import { describe, expect, it } from 'vitest';
import { schedule, type ScheduleInput } from '../src/core/scheduler';
import { createEntity } from '../src/core/entity';
import type { Project } from '../src/core/types';
import { at, blocksOf, event, hours, reasonOf, settings, task } from './helpers';

const MONDAY_8 = at('2026-10-19 08:00');

const run = (input: Partial<ScheduleInput>) =>
  schedule({ tasks: [], events: [], windows: [], settings: settings(), now: MONDAY_8, ...input });

describe('schedule — placement de base', () => {
  it('place au plus tôt, la plus courte d’abord à urgence égale', () => {
    const r = run({ tasks: [task('A', { durationMin: 60 }), task('B', { durationMin: 30 })] });
    expect(blocksOf(r, 'B')).toEqual([['10-19 08:00', '10-19 08:30']]);
    expect(blocksOf(r, 'A')).toEqual([['10-19 08:30', '10-19 09:30']]);
    expect(r.unscheduled).toEqual([]);
    expect(r.atRisk).toEqual([]);
  });

  it('ignore les tâches faites, et une dépendance faite est satisfaite', () => {
    const r = run({
      tasks: [task('Fait', { status: 'done' }), task('Suite', { dependsOn: ['Fait', 'Supprimée'] })],
    });
    expect(blocksOf(r, 'Fait')).toEqual([]);
    expect(blocksOf(r, 'Suite')).toEqual([['10-19 08:00', '10-19 08:30']]);
  });

  it('ne place rien avant maintenant (arrondi à la grille)', () => {
    const r = run({ tasks: [task('A', { durationMin: 30 })], now: at('2026-10-19 10:07') });
    expect(blocksOf(r, 'A')).toEqual([['10-19 10:15', '10-19 10:45']]);
  });

  it('respecte earliestStart (date seule = à partir de minuit)', () => {
    const r = run({ tasks: [task('A', { earliestStart: '2026-10-21' })] });
    expect(blocksOf(r, 'A')).toEqual([['10-21 08:00', '10-21 08:30']]);
  });

  it('passe au lendemain quand la journée est finie', () => {
    const r = run({ tasks: [task('A', { durationMin: 60 })], now: at('2026-10-19 19:30') });
    expect(blocksOf(r, 'A')).toEqual([['10-20 08:00', '10-20 09:00']]);
  });

  it('signale une durée invalide', () => {
    const r = run({ tasks: [task('Zéro', { durationMin: 0 }), task('Après', { dependsOn: ['Zéro'] })] });
    expect(reasonOf(r, 'Zéro')).toBe('invalid');
    expect(reasonOf(r, 'Après')).toBe('dependency');
  });
});

describe('schedule — événements et horaires', () => {
  it('évite les événements', () => {
    const r = run({
      tasks: [task('A', { durationMin: 45 })],
      events: [event('Réunion', '2026-10-19 08:30', '2026-10-19 09:00'), event('Appel', '2026-10-19 09:30', '2026-10-19 10:00')],
    });
    // 08:00–08:30 et 09:00–09:30 sont trop courts.
    expect(blocksOf(r, 'A')).toEqual([['10-19 10:00', '10-19 10:45']]);
  });

  it('les événements « journée entière » ne bloquent pas', () => {
    const r = run({
      tasks: [task('A')],
      events: [event('Anniversaire', '2026-10-19 00:00', '2026-10-20 00:00', { allDay: true })],
    });
    expect(blocksOf(r, 'A')).toEqual([['10-19 08:00', '10-19 08:30']]);
  });

  it('déplie les événements récurrents', () => {
    const r = run({
      tasks: [task('A', { durationMin: 60, earliestStart: '2026-10-21' })],
      events: [
        event('Sport', '2026-10-19 08:00', '2026-10-19 09:30', { recurrence: { freq: 'weekly', weekdays: [1, 3, 5] } }),
      ],
    });
    expect(blocksOf(r, 'A')).toEqual([['10-21 09:30', '10-21 10:30']]);
  });

  it('respecte les horaires de la tâche (« Soir » 17h–22h)', () => {
    const r = run({
      tasks: [task('Courses', { durationMin: 45, windowId: 'soir' })],
      windows: [hours('soir', '17:00', '22:00')],
    });
    expect(blocksOf(r, 'Courses')).toEqual([['10-19 17:00', '10-19 17:45']]);
  });

  it('horaires : tâche → liste → réglages', () => {
    const project = createEntity<Project>({ name: 'Site web', color: '#7A3FD1', archived: false, order: 0, defaultWindowId: 'aprem' }, MONDAY_8, 'web');
    const r = run({
      tasks: [
        task('Liste', { projectId: 'web' }),
        task('Propre', { projectId: 'web', windowId: 'soir' }),
        task('Défaut'),
      ],
      projects: [project],
      windows: [hours('aprem', '14:00', '18:00'), hours('soir', '19:00', '22:00'), hours('bureau', '09:00', '18:00', [1, 2, 3, 4, 5])],
      settings: settings({ defaultWindowId: 'bureau' }),
    });
    expect(blocksOf(r, 'Liste')).toEqual([['10-19 14:00', '10-19 14:30']]);
    expect(blocksOf(r, 'Propre')).toEqual([['10-19 19:00', '10-19 19:30']]);
    expect(blocksOf(r, 'Défaut')).toEqual([['10-19 09:00', '10-19 09:30']]);
  });

  it('des horaires sans plage ou trop courts → no-slot', () => {
    const r = run({
      tasks: [task('Jamais', { windowId: 'vide' }), task('Trop long', { durationMin: 180, windowId: 'heure' })],
      windows: [{ ...hours('vide', '09:00', '10:00'), rules: [] }, hours('heure', '12:00', '13:00')],
    });
    expect(reasonOf(r, 'Jamais')).toBe('no-slot');
    expect(reasonOf(r, 'Trop long')).toBe('no-slot');
  });

  it('applique la marge autour des tâches et des événements', () => {
    const r = run({
      tasks: [task('A', { durationMin: 60 }), task('B', { durationMin: 30 })],
      events: [event('Réunion', '2026-10-19 09:00', '2026-10-19 10:00')],
      settings: settings({ bufferMin: 15 }),
    });
    expect(blocksOf(r, 'B')).toEqual([['10-19 08:00', '10-19 08:30']]);
    // Les marges de B et de la réunion ne laissent rien avant 10:15.
    expect(blocksOf(r, 'A')).toEqual([['10-19 10:15', '10-19 11:15']]);
  });
});

describe('schedule — tâches épinglées et découpage', () => {
  it('garde les tâches épinglées et planifie autour', () => {
    const r = run({
      tasks: [
        task('Épinglée', { pinned: { start: at('2026-10-19 10:00').toISOString(), end: at('2026-10-19 11:00').toISOString() } }),
        task('Longue', { durationMin: 180 }),
      ],
    });
    expect(r.blocks.find((b) => b.taskId === 'Épinglée')?.pinned).toBe(true);
    expect(blocksOf(r, 'Épinglée')).toEqual([['10-19 10:00', '10-19 11:00']]);
    expect(blocksOf(r, 'Longue')).toEqual([['10-19 11:00', '10-19 14:00']]);
  });

  it('découpe une tâche dans les trous', () => {
    const r = run({
      tasks: [task('Rapport', { durationMin: 150, splittable: true, minChunkMin: 30 })],
      events: [event('E1', '2026-10-19 09:00', '2026-10-19 10:00'), event('E2', '2026-10-19 11:00', '2026-10-19 12:00')],
    });
    expect(blocksOf(r, 'Rapport')).toEqual([
      ['10-19 08:00', '10-19 09:00'],
      ['10-19 10:00', '10-19 11:00'],
      ['10-19 12:00', '10-19 12:30'],
    ]);
  });

  it('ne crée pas de morceau plus petit que minChunk', () => {
    const r = run({
      tasks: [task('A', { durationMin: 90, splittable: true, minChunkMin: 45 })],
      events: [
        event('Petit trou', '2026-10-19 08:15', '2026-10-19 09:00'),
        event('E2', '2026-10-19 10:00', '2026-10-19 11:00'),
      ],
    });
    // 08:00–08:15 trop court ; 09:00–10:00 (60) laisserait 30 < 45 : on ne prend que 45.
    expect(blocksOf(r, 'A')).toEqual([
      ['10-19 09:00', '10-19 09:45'],
      ['10-19 11:00', '10-19 11:45'],
    ]);
  });

  it('une tâche non découpable attend un créneau d’un seul tenant', () => {
    const r = run({
      tasks: [task('A', { durationMin: 90 })],
      events: [event('E1', '2026-10-19 09:00', '2026-10-19 10:00'), event('E2', '2026-10-19 11:00', '2026-10-19 12:00')],
    });
    expect(blocksOf(r, 'A')).toEqual([['10-19 12:00', '10-19 13:30']]);
  });
});

describe('schedule — dépendances', () => {
  it('enchaîne les dépendances, et l’amont hérite de l’urgence de l’aval', () => {
    const r = run({
      tasks: [
        task('Autre', { durationMin: 60, priority: 2 }),
        task('C', { durationMin: 30, priority: 1, dependsOn: ['B'], deadline: at('2026-10-20 12:00').toISOString() }),
        task('B', { durationMin: 60, priority: 4, dependsOn: ['A'] }),
        task('A', { durationMin: 60, priority: 4 }),
      ],
    });
    expect(blocksOf(r, 'A')).toEqual([['10-19 08:00', '10-19 09:00']]);
    expect(blocksOf(r, 'B')).toEqual([['10-19 09:00', '10-19 10:00']]);
    expect(blocksOf(r, 'C')).toEqual([['10-19 10:00', '10-19 10:30']]);
    expect(blocksOf(r, 'Autre')).toEqual([['10-19 10:30', '10-19 11:30']]);
  });

  it('une tâche commence après la fin du dernier morceau de sa dépendance', () => {
    const r = run({
      tasks: [
        task('Avant', { durationMin: 120, splittable: true, minChunkMin: 30, priority: 1 }),
        task('Après', { durationMin: 30, dependsOn: ['Avant'] }),
      ],
      events: [event('E', '2026-10-19 09:00', '2026-10-19 10:00')],
    });
    expect(blocksOf(r, 'Avant')).toEqual([
      ['10-19 08:00', '10-19 09:00'],
      ['10-19 10:00', '10-19 11:00'],
    ]);
    expect(blocksOf(r, 'Après')).toEqual([['10-19 11:00', '10-19 11:30']]);
  });

  it('attend la fin d’une dépendance épinglée', () => {
    const r = run({
      tasks: [
        task('Épinglée', { pinned: { start: at('2026-10-19 14:00').toISOString(), end: at('2026-10-19 15:00').toISOString() } }),
        task('Suite', { dependsOn: ['Épinglée'] }),
      ],
    });
    expect(blocksOf(r, 'Suite')).toEqual([['10-19 15:00', '10-19 15:30']]);
  });

  it('détecte les cycles', () => {
    const r = run({
      tasks: [
        task('A', { dependsOn: ['B'] }),
        task('B', { dependsOn: ['A'] }),
        task('Boucle', { dependsOn: ['Boucle'] }),
        task('Aval', { dependsOn: ['A'] }),
        task('Libre'),
      ],
    });
    expect(reasonOf(r, 'A')).toBe('cycle');
    expect(reasonOf(r, 'B')).toBe('cycle');
    expect(reasonOf(r, 'Boucle')).toBe('cycle');
    expect(reasonOf(r, 'Aval')).toBe('dependency');
    expect(blocksOf(r, 'Libre')).toEqual([['10-19 08:00', '10-19 08:30']]);
  });

  it('une dépendance non planifiable bloque la suite', () => {
    const r = run({
      tasks: [task('Énorme', { durationMin: 13 * 60 }), task('Suite', { dependsOn: ['Énorme'] })],
    });
    expect(reasonOf(r, 'Énorme')).toBe('no-slot');
    expect(reasonOf(r, 'Suite')).toBe('dependency');
  });
});

describe('schedule — échéances et priorités', () => {
  it('signale une échéance dépassée mais place quand même', () => {
    const r = run({ tasks: [task('A', { durationMin: 120, deadline: at('2026-10-19 09:00').toISOString() })] });
    expect(blocksOf(r, 'A')).toEqual([['10-19 08:00', '10-19 10:00']]);
    expect(r.atRisk.map((x) => [x.taskId, x.reason])).toEqual([['A', 'deadline']]);
  });

  it('une échéance « date seule » vaut fin de journée', () => {
    const plein = event('Plein', '2026-10-19 08:00', '2026-10-19 20:00');
    const ok = run({ tasks: [task('A', { deadline: '2026-10-19' })], now: at('2026-10-19 19:00') });
    expect(ok.atRisk).toEqual([]);
    const late = run({ tasks: [task('A', { deadline: '2026-10-19' })], events: [plein] });
    expect(blocksOf(late, 'A')).toEqual([['10-20 08:00', '10-20 08:30']]);
    expect(late.atRisk.map((x) => x.taskId)).toEqual(['A']);
  });

  it('échéance la plus proche d’abord', () => {
    const r = run({
      tasks: [
        task('Jeudi', { deadline: '2026-10-22', priority: 3 }),
        task('Mardi', { deadline: '2026-10-20', priority: 3 }),
      ],
    });
    expect(blocksOf(r, 'Mardi')).toEqual([['10-19 08:00', '10-19 08:30']]);
    expect(blocksOf(r, 'Jeudi')).toEqual([['10-19 08:30', '10-19 09:00']]);
  });

  it('une P1 sans échéance passe avant une tâche à échéance lointaine', () => {
    const r = run({
      tasks: [task('Lointaine', { deadline: '2026-11-10', priority: 3 }), task('Urgente', { priority: 1 })],
    });
    expect(blocksOf(r, 'Urgente')).toEqual([['10-19 08:00', '10-19 08:30']]);
  });

  it('les P1 sans échéance passent avant les P4 sans échéance', () => {
    const r = run({ tasks: [task('Basse', { priority: 4, durationMin: 15 }), task('Haute', { priority: 1 })] });
    expect(blocksOf(r, 'Haute')).toEqual([['10-19 08:00', '10-19 08:30']]);
  });

  it('une échéance toute proche passe avant une P1 sans échéance', () => {
    const r = run({
      tasks: [task('P1', { priority: 1 }), task('Dans 2h', { priority: 4, deadline: at('2026-10-19 10:00').toISOString() })],
    });
    expect(blocksOf(r, 'Dans 2h')).toEqual([['10-19 08:00', '10-19 08:30']]);
  });
});

describe('schedule — changement d’heure (25 oct. 2026, Paris)', () => {
  it('garde les heures locales et les durées réelles', () => {
    const r = run({ tasks: [task('Dimanche', { durationMin: 60 })], now: at('2026-10-24 20:30') });
    const [block] = r.blocks;
    expect(blocksOf(r, 'Dimanche')).toEqual([['10-25 08:00', '10-25 09:00']]);
    expect(block.start.toISOString()).toBe('2026-10-25T07:00:00.000Z'); // UTC+1 après le changement
    expect(block.end.getTime() - block.start.getTime()).toBe(60 * 60_000);
  });

  it('un événement récurrent reste à la même heure locale', () => {
    const r = run({
      tasks: [task('Lundi suivant', { durationMin: 60, earliestStart: '2026-10-26' })],
      events: [event('Réunion', '2026-10-19 08:00', '2026-10-19 09:00', { recurrence: { freq: 'weekly', weekdays: [1] } })],
    });
    expect(blocksOf(r, 'Lundi suivant')).toEqual([['10-26 09:00', '10-26 10:00']]);
  });

  it('une plage de nuit qui traverse le changement d’heure dure une heure de plus', () => {
    const r = run({
      tasks: [task('Nuit', { durationMin: 9 * 60, windowId: 'nuit' })],
      windows: [hours('nuit', '22:00', '06:00')],
      now: at('2026-10-24 21:00'),
    });
    // 22:00 → 06:00 la nuit du 24 au 25 = 9 h réelles.
    expect(blocksOf(r, 'Nuit')).toEqual([['10-24 22:00', '10-25 06:00']]);
  });
});
