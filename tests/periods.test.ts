import { describe, expect, it } from 'vitest';
import { schedule } from '../src/core/scheduler';
import { dayPlan } from '../src/core/daily';
import { listPeriods, windowAvailability } from '../src/core/windows';
import type { TimeWindow, WindowOverride, WindowRule, Weekday } from '../src/core/types';
import { at, blocksOf, fmt, hours, settings, task } from './helpers';

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

const period = (periodId: string, from: string, to: string, rules: WindowRule[] = []): WindowOverride => ({
  periodId,
  name: periodId,
  from,
  to,
  rules,
});

const withPeriods = (w: TimeWindow, ...overrides: WindowOverride[]): TimeWindow => ({ ...w, overrides });

const tenToNoon = WEEKDAYS.map((weekday): WindowRule => ({ weekday, start: '10:00', end: '12:00' }));

describe('horaires — périodes spéciales', () => {
  it('une période fermée repousse la tâche après la période', () => {
    const bureau = withPeriods(hours('Bureau', '09:00', '18:00', WEEKDAYS), period('Vacances', '2026-10-26', '2026-10-30'));
    const r = schedule({
      tasks: [task('Rapport', { durationMin: 60, windowId: 'Bureau' })],
      events: [],
      windows: [bureau],
      settings: settings(),
      now: at('2026-10-26 08:00'),
    });
    expect(blocksOf(r, 'Rapport')).toEqual([['11-02 09:00', '11-02 10:00']]);
  });

  it('une période aux plages personnalisées remplace les plages habituelles', () => {
    const bureau = withPeriods(hours('Bureau', '09:00', '18:00', WEEKDAYS), period('Mi-temps', '2026-10-26', '2026-10-30', tenToNoon));
    const r = schedule({
      tasks: [task('Rapport', { durationMin: 60, windowId: 'Bureau' })],
      events: [],
      windows: [bureau],
      settings: settings(),
      now: at('2026-10-26 08:00'),
    });
    expect(blocksOf(r, 'Rapport')).toEqual([['10-26 10:00', '10-26 11:00']]);
  });

  it('une plage de nuit appartient à son jour de début', () => {
    const nuit = withPeriods(hours('Nuit', '22:00', '02:00'), period('Repos', '2026-10-20', '2026-10-20'));
    const list = windowAvailability(nuit, [], at('2026-10-19 00:00').getTime(), at('2026-10-22 00:00').getTime());
    expect(list.map((i) => [fmt(new Date(i.start)), fmt(new Date(i.end))])).toEqual([
      ['10-19 00:00', '10-19 02:00'],
      // Commence le 19 (jour normal) : déborde sur le 20 même si le 20 est fermé.
      ['10-19 22:00', '10-20 02:00'],
      ['10-21 22:00', '10-22 00:00'],
    ]);
  });

  it('si deux périodes se chevauchent, la dernière gagne', () => {
    const bureau = withPeriods(
      hours('Bureau', '09:00', '18:00', WEEKDAYS),
      period('Mi-temps', '2026-10-26', '2026-10-30', tenToNoon),
      period('Pont', '2026-10-28', '2026-10-29'),
    );
    const list = windowAvailability(bureau, [], at('2026-10-27 00:00').getTime(), at('2026-10-31 00:00').getTime());
    expect(list.map((i) => [fmt(new Date(i.start)), fmt(new Date(i.end))])).toEqual([
      ['10-27 10:00', '10-27 12:00'],
      ['10-30 10:00', '10-30 12:00'],
    ]);
  });

  it('la capacité du jour tient compte des périodes des horaires par défaut', () => {
    const bureau = withPeriods(hours('Bureau', '09:00', '18:00', WEEKDAYS), period('Vacances', '2026-10-26', '2026-10-30'));
    const empty = { blocks: [], unscheduled: [], atRisk: [] };
    const opts = { windows: [bureau], settings: settings({ defaultWindowId: 'Bureau' }) };
    expect(dayPlan(empty, [], [], at('2026-10-26 00:00'), opts).totals.capacityMin).toBe(0);
    expect(dayPlan(empty, [], [], at('2026-11-02 00:00'), opts).totals.capacityMin).toBe(9 * 60);
  });

  it('regroupe une période à travers les fenêtres', () => {
    const vac = period('vac', '2026-10-26', '2026-11-01');
    const list = listPeriods([
      withPeriods(hours('Bureau', '09:00', '18:00', WEEKDAYS), vac),
      withPeriods(hours('Journée', '08:00', '20:00'), { ...vac, rules: tenToNoon }),
      hours('Soir', '18:00', '22:00'),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].windows.map((w) => [w.windowId, w.rules.length])).toEqual([
      ['Bureau', 0],
      ['Journée', 5],
    ]);
  });
});
