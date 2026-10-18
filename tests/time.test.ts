import { describe, expect, it } from 'vitest';
import { formatDuration, parseHM, parseISODate, roundUpToGrid, startOfWeek, toISODate, addDays } from '../src/core/time';
import { at } from './helpers';

describe('time', () => {
  it('tourne en heure de Paris (heure d’été puis d’hiver le 25 oct. 2026)', () => {
    expect(new Date(2026, 9, 24, 12).getTimezoneOffset()).toBe(-120);
    expect(new Date(2026, 9, 25, 12).getTimezoneOffset()).toBe(-60);
  });

  it('parse les heures et les dates locales', () => {
    expect(parseHM('09:30')).toBe(570);
    expect(parseHM('24:00')).toBe(1440);
    expect(() => parseHM('25:00')).toThrow();
    expect(parseISODate('2026-10-19').getHours()).toBe(0);
    expect(toISODate(parseISODate('2026-10-19'))).toBe('2026-10-19');
  });

  it('arrondit à la grille au-dessus', () => {
    expect(roundUpToGrid(at('2026-10-19 10:07').getTime(), 15)).toBe(at('2026-10-19 10:15').getTime());
    expect(roundUpToGrid(at('2026-10-19 10:15').getTime(), 15)).toBe(at('2026-10-19 10:15').getTime());
  });

  it('trouve le lundi de la semaine', () => {
    expect(toISODate(startOfWeek(at('2026-10-25 18:00'), 1))).toBe('2026-10-19');
    expect(toISODate(startOfWeek(at('2026-10-19 08:00'), 1))).toBe('2026-10-19');
    expect(toISODate(startOfWeek(at('2026-10-21 08:00'), 0))).toBe('2026-10-18');
  });

  it('ajoute des jours sans dériver au changement d’heure', () => {
    expect(addDays(at('2026-10-24 09:00'), 2).getHours()).toBe(9);
  });

  it('formate les durées', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(90)).toBe('1 h 30');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(65)).toBe('1 h 05');
  });
});
