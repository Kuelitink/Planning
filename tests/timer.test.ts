import { describe, expect, it } from 'vitest';
import { activeEntry, formatClock, startTimer, stopTimer, totalForDay, totalForWeek, totalsByTask } from '../src/core/timer';
import { createEntity } from '../src/core/entity';
import type { TimeEntry } from '../src/core/types';
import { at } from './helpers';

const MIN = 60_000;

describe('chrono', () => {
  it('un seul chrono actif : démarrer arrête le précédent', () => {
    let entries: TimeEntry[] = [];
    ({ entries } = startTimer(entries, 'Rapport', at('2026-10-19 09:30'), 'e1'));
    expect(activeEntry(entries)?.taskId).toBe('Rapport');

    const res = startTimer(entries, 'Mails', at('2026-10-19 10:00'), 'e2');
    entries = res.entries;
    expect(res.stopped?.id).toBe('e1');
    expect(entries.filter((e) => !e.end)).toHaveLength(1);
    expect(activeEntry(entries)?.taskId).toBe('Mails');

    const totals = totalsByTask(entries, at('2026-10-19 10:12'));
    expect(totals.get('Rapport')).toBe(30 * MIN);
    expect(totals.get('Mails')).toBe(12 * MIN);

    ({ entries } = stopTimer(entries, at('2026-10-19 10:20')));
    expect(activeEntry(entries)).toBeUndefined();
    expect(stopTimer(entries, at('2026-10-19 11:00')).stopped).toBeUndefined();
  });

  it('totaux du jour et de la semaine, sessions rognées à minuit', () => {
    const e = (id: string, start: string, end?: string) =>
      createEntity<TimeEntry>({ taskId: 'T', start: at(start).toISOString(), end: end ? at(end).toISOString() : undefined }, at(start), id);
    const entries = [
      e('veille', '2026-10-18 23:30', '2026-10-19 00:30'), // 30 min dimanche, 30 min lundi
      e('lundi', '2026-10-19 08:30', '2026-10-19 09:00'),
      e('en cours', '2026-10-19 09:30'),
    ];
    const now = at('2026-10-19 10:12');
    expect(totalForDay(entries, at('2026-10-19 12:00'), now)).toBe((30 + 30 + 42) * MIN);
    expect(totalForWeek(entries, at('2026-10-21 12:00'), now)).toBe((30 + 30 + 42) * MIN);
    expect(totalForWeek(entries, at('2026-10-18 12:00'), now)).toBe(30 * MIN);
  });

  it('formate le chrono', () => {
    expect(formatClock(42 * MIN + 17_000)).toBe('00:42:17');
    expect(formatClock(3 * 3600_000 + 5_000)).toBe('03:00:05');
  });
});
