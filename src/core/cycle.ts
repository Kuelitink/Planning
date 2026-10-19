/**
 * Cycle menstruel : règles, cycles, moyennes et prédictions, façon Clue.
 *
 * Règles de calcul :
 * - Des jours de règles séparés par au plus 2 jours sans règles forment les mêmes règles.
 *   Le premier jour de règles commence un cycle, qui dure jusqu'au début des règles suivantes.
 *   Le spotting ne commence pas de cycle.
 * - Moyennes sur les 12 derniers cycles terminés, hors cycles exclus et cycles atypiques
 *   (moins de 15 jours ou plus de 90) ; sans historique, les durées des réglages.
 * - Prochaines règles : début des dernières + durée moyenne du cycle, avec une fourchette
 *   de ± l'écart type (1 à 7 jours). En retard, elles restent attendues à partir d'aujourd'hui.
 * - Sans règles notées depuis plus de 90 jours (suivi interrompu), plus de prédiction.
 * - Ovulation : 14 jours avant les règles suivantes. Fenêtre fertile : les 5 jours qui la
 *   précèdent et le jour même. SPM : les `pmsDays` jours avant les règles.
 *
 * Ce sont des estimations : elles ne remplacent ni une contraception, ni un avis médical.
 */

import type { CycleDay, CycleMark, CycleSettings, ISODate } from './types';

export const DAY_MS = 86_400_000;

/** Numéro de jour calendaire (indépendant du fuseau et des changements d'heure). */
export function dayNum(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNum(n: number): ISODate {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDaysISO(date: ISODate, n: number): ISODate {
  return fromDayNum(dayNum(date) + n);
}

/** Nombre de jours de `a` à `b` (positif si `b` est après `a`). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return dayNum(b) - dayNum(a);
}

/** Écart maximal sans règles à l'intérieur des mêmes règles. */
const MAX_GAP = 2;
/** Cycles hors de cette plage : comptés dans l'historique, pas dans les moyennes. */
export const MIN_CYCLE = 15;
export const MAX_CYCLE = 90;
/** Nombre de cycles récents utilisés pour les moyennes. */
const SAMPLE = 12;
/** Durée de la phase lutéale (ovulation → règles). */
export const LUTEAL_DAYS = 14;
export const FERTILE_BEFORE = 5;

export interface PeriodSpan {
  start: ISODate;
  /** Dernier jour de règles noté. */
  end: ISODate;
  /** Durée en jours, du premier au dernier jour. */
  days: number;
}

export interface Cycle {
  start: ISODate;
  /** Début du cycle suivant ; absent pour le cycle en cours. */
  next?: ISODate;
  /** Durée en jours (cycles terminés). */
  length?: number;
  periodDays: number;
  excluded: boolean;
  /** Trop court ou trop long pour compter dans les moyennes. */
  atypical: boolean;
  note?: string;
}

export interface CycleStats {
  /** Durée du cycle retenue pour les prédictions, en jours. */
  cycleLength: number;
  periodLength: number;
  /** Écart type des durées de cycle retenues. */
  sd: number;
  /** Écart entre le cycle le plus court et le plus long, parmi les 6 derniers retenus. */
  variation: number | null;
  /** Cycles utilisés pour les moyennes (0 = durées des réglages). */
  sample: number;
  /** Moyennes exactes (non arrondies), pour l'affichage. */
  meanCycle?: number;
  meanPeriod?: number;
}

/** Jours de règles regroupés en règles (spans), du plus ancien au plus récent. */
export function periodsOf(days: CycleDay[]): PeriodSpan[] {
  const dates = days
    .filter((d) => d.flow)
    .map((d) => d.date)
    .sort();
  const spans: PeriodSpan[] = [];
  for (const date of dates) {
    const last = spans[spans.length - 1];
    if (last && daysBetween(last.end, date) <= MAX_GAP + 1) {
      last.end = date;
      last.days = daysBetween(last.start, date) + 1;
    } else spans.push({ start: date, end: date, days: 1 });
  }
  return spans;
}

/** Cycles à partir des règles et des annotations (exclusions, notes). */
export function cyclesOf(days: CycleDay[], marks: CycleMark[] = []): Cycle[] {
  const periods = periodsOf(days);
  const byStart = new Map(marks.map((m) => [m.startDate, m]));
  return periods.map((p, i) => {
    const next = periods[i + 1]?.start;
    const length = next ? daysBetween(p.start, next) : undefined;
    const mark = byStart.get(p.start);
    return {
      start: p.start,
      next,
      length,
      periodDays: p.days,
      excluded: Boolean(mark?.excluded),
      atypical: length !== undefined && (length < MIN_CYCLE || length > MAX_CYCLE),
      note: mark?.note || undefined,
    };
  });
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const stdev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/** Moyennes des derniers cycles retenus ; `today` sert à écarter des règles peut-être en cours. */
export function cycleStats(cycles: Cycle[], settings: Pick<CycleSettings, 'cycleLength' | 'periodLength'>, today?: ISODate): CycleStats {
  const kept = cycles.filter((c) => c.length !== undefined && !c.excluded && !c.atypical).slice(-SAMPLE);
  const lengths = kept.map((c) => c.length!);
  // Les règles du cycle en cours comptent une fois terminées (2 jours sans règles).
  const periods = cycles
    .filter((c) => !c.excluded && !c.atypical)
    .filter((c) => c.next || !today || daysBetween(addDaysISO(c.start, c.periodDays - 1), today) > MAX_GAP)
    .slice(-SAMPLE)
    .map((c) => c.periodDays);
  const recent = lengths.slice(-6);
  const meanCycle = lengths.length ? mean(lengths) : undefined;
  const meanPeriod = periods.length ? mean(periods) : undefined;
  return {
    cycleLength: meanCycle !== undefined ? Math.round(meanCycle) : settings.cycleLength,
    periodLength: meanPeriod !== undefined ? Math.max(1, Math.round(meanPeriod)) : settings.periodLength,
    sd: stdev(lengths),
    variation: recent.length >= 2 ? Math.max(...recent) - Math.min(...recent) : null,
    sample: lengths.length,
    meanCycle,
    meanPeriod,
  };
}

export type Phase = 'period' | 'follicular' | 'fertile' | 'ovulation' | 'luteal' | 'pms' | 'late';

export interface PredictedCycle {
  /** Premier jour des règles prévues. */
  start: ISODate;
  periodEnd: ISODate;
  /** Ovulation et fenêtre fertile du cycle qui précède ces règles. */
  ovulation: ISODate;
  fertile: [ISODate, ISODate];
  pms: [ISODate, ISODate];
}

export interface Forecast {
  stats: CycleStats;
  cycles: Cycle[];
  /** Premier jour du cycle en cours. */
  cycleStart?: ISODate;
  /** Jour du cycle aujourd'hui (1 = premier jour des règles). */
  cycleDay?: number;
  /** Durée prévue du cycle en cours (allongée en cas de retard). */
  cycleLength?: number;
  /** Prochaines règles attendues (aujourd'hui si elles sont en retard). */
  nextPeriod?: ISODate;
  /** Fourchette autour de la date prévue initialement. */
  nextRange?: [ISODate, ISODate];
  /** Jours avant les prochaines règles (0 = aujourd'hui). */
  daysUntil?: number;
  /** Jours de retard (0 = pas de retard). */
  lateDays: number;
  /** Ovulation, fenêtre fertile et SPM du cycle en cours. */
  ovulation?: ISODate;
  fertile?: [ISODate, ISODate];
  pms?: [ISODate, ISODate];
  phase?: Phase;
  /** Fin des règles en cours (notées ou prévues), si elles ont lieu aujourd'hui. */
  periodUntil?: ISODate;
  /** Cycles prévus, à partir des prochaines règles. */
  upcoming: PredictedCycle[];
  /** Dernières règles notées, quand elles sont trop anciennes pour prédire quoi que ce soit. */
  lastPeriod?: ISODate;
}

function predicted(start: ISODate, expected: ISODate, periodLength: number, pmsDays: number): PredictedCycle {
  const ovulation = addDaysISO(expected, -LUTEAL_DAYS);
  return {
    start,
    periodEnd: addDaysISO(start, periodLength - 1),
    ovulation,
    fertile: [addDaysISO(ovulation, -FERTILE_BEFORE), ovulation],
    pms: [addDaysISO(expected, -Math.max(1, pmsDays)), addDaysISO(expected, -1)],
  };
}

const within = (d: ISODate, [a, b]: [ISODate, ISODate]) => d >= a && d <= b;

/** Prédictions pour `today`, avec `count` cycles prévus. */
export function forecast(days: CycleDay[], marks: CycleMark[], settings: CycleSettings, today: ISODate, count = 6): Forecast {
  const cycles = cyclesOf(days, marks);
  const stats = cycleStats(cycles, settings, today);
  const current = cycles[cycles.length - 1];
  if (!current || current.start > today) return { stats, cycles, lateDays: 0, upcoming: [] };
  if (daysBetween(current.start, today) > MAX_CYCLE) return { stats, cycles, lateDays: 0, upcoming: [], lastPeriod: current.start };

  const L = stats.cycleLength;
  const P = stats.periodLength;
  const expected = addDaysISO(current.start, L);
  const lateDays = Math.max(0, daysBetween(expected, today));
  const nextPeriod = lateDays > 0 ? today : expected;
  const spread = Math.min(7, Math.max(1, Math.round(stats.sd)));
  const upcoming = Array.from({ length: count }, (_, k) => {
    const start = addDaysISO(nextPeriod, k * L);
    return predicted(start, k === 0 ? expected : start, P, settings.pmsDays);
  });
  const now = upcoming[0];
  const cycleDay = daysBetween(current.start, today) + 1;

  // Règles en cours : jusqu'au dernier jour noté, ou sur leur durée habituelle.
  const loggedEnd = addDaysISO(current.start, current.periodDays - 1);
  const predictedEnd = addDaysISO(current.start, P - 1);
  const periodEnd = predictedEnd > loggedEnd ? predictedEnd : loggedEnd;
  const periodUntil = today <= periodEnd ? periodEnd : undefined;

  let phase: Phase;
  if (periodUntil) phase = 'period';
  else if (lateDays > 0) phase = 'late';
  else if (today === now.ovulation) phase = 'ovulation';
  else if (within(today, now.fertile)) phase = 'fertile';
  else if (today < now.fertile[0]) phase = 'follicular';
  else if (within(today, now.pms)) phase = 'pms';
  else phase = 'luteal';

  return {
    stats,
    cycles,
    cycleStart: current.start,
    cycleDay,
    cycleLength: Math.max(L, cycleDay),
    nextPeriod,
    nextRange: [addDaysISO(expected, -spread), addDaysISO(expected, spread)],
    daysUntil: daysBetween(today, nextPeriod),
    lateDays,
    ovulation: now.ovulation,
    fertile: now.fertile,
    pms: now.pms,
    phase,
    periodUntil,
    upcoming,
  };
}

/** Ce qu'un calendrier affiche pour un jour. */
export interface DayMark {
  /** Règles notées, ou prévues. */
  period?: 'logged' | 'predicted';
  spotting?: boolean;
  fertile?: boolean;
  ovulation?: boolean;
  pms?: boolean;
  /** Jour du cycle (réel, ou prévu pour les jours à venir). */
  cycleDay?: number;
  /** Quelque chose a été noté ce jour-là (hors règles). */
  logged?: boolean;
}

/**
 * Marques des jours de `from` à `to` inclus : règles notées et prévues, fenêtres fertiles
 * (estimées aussi pour les cycles passés), ovulation et SPM à venir.
 */
export function dayMarks(
  days: CycleDay[],
  fc: Forecast,
  settings: Pick<CycleSettings, 'showFertile' | 'showOvulation' | 'showPms'>,
  from: ISODate,
  to: ISODate,
  today: ISODate,
): Map<ISODate, DayMark> {
  const out = new Map<ISODate, DayMark>();
  const first = dayNum(from);
  const last = dayNum(to);
  const mark = (date: ISODate) => {
    let m = out.get(date);
    if (!m) out.set(date, (m = {}));
    return m;
  };
  const range = (a: ISODate, b: ISODate, apply: (m: DayMark, date: ISODate) => void) => {
    for (let n = Math.max(first, dayNum(a)); n <= Math.min(last, dayNum(b)); n++) {
      const date = fromDayNum(n);
      apply(mark(date), date);
    }
  };

  for (const d of days) {
    if (d.date < from || d.date > to) continue;
    const m = mark(d.date);
    if (d.flow) m.period = 'logged';
    if (d.options.spotting?.length) m.spotting = true;
    if (hasLog(d, true)) m.logged = true;
  }

  // Jours du cycle, réels puis prévus.
  for (const c of fc.cycles) {
    const end = c.next ? addDaysISO(c.next, -1) : to;
    range(c.start, end, (m, date) => (m.cycleDay = daysBetween(c.start, date) + 1));
  }
  fc.upcoming.forEach((u, i) => {
    const end = fc.upcoming[i + 1] ? addDaysISO(fc.upcoming[i + 1].start, -1) : addDaysISO(u.start, fc.stats.cycleLength - 1);
    range(u.start, end, (m, date) => (m.cycleDay = daysBetween(u.start, date) + 1));
  });

  // Fenêtres fertiles estimées des cycles passés.
  if (settings.showFertile || settings.showOvulation) {
    for (const c of fc.cycles) {
      if (!c.next || c.atypical) continue;
      const ov = addDaysISO(c.next, -LUTEAL_DAYS);
      if (settings.showFertile) range(addDaysISO(ov, -FERTILE_BEFORE), ov, (m) => (m.fertile = true));
      if (settings.showOvulation) range(ov, ov, (m) => (m.ovulation = true));
    }
  }

  // Cycle en cours et cycles prévus.
  if (fc.periodUntil) range(addDaysISO(today, 1), fc.periodUntil, (m) => (m.period ??= 'predicted'));
  for (const u of fc.upcoming) {
    range(u.start, u.periodEnd, (m) => (m.period ??= 'predicted'));
    if (settings.showFertile) range(u.fertile[0], u.fertile[1], (m) => (m.fertile = true));
    if (settings.showOvulation) range(u.ovulation, u.ovulation, (m) => (m.ovulation = true));
    if (settings.showPms) range(u.pms[0] < today ? today : u.pms[0], u.pms[1], (m) => (m.pms = true));
  }
  // Pas de fenêtre fertile ni de SPM pendant les règles.
  for (const m of out.values()) {
    if (m.period) {
      m.fertile = false;
      m.ovulation = false;
      m.pms = false;
    }
  }
  return out;
}

/** Le jour contient-il une saisie (règles comprises sauf si `exceptFlow`) ? */
export function hasLog(d: CycleDay, exceptFlow = false): boolean {
  return (
    (!exceptFlow && Boolean(d.flow)) ||
    Object.values(d.options).some((o) => o.length > 0) ||
    d.sleepMin !== undefined ||
    d.bbt !== undefined ||
    d.weightKg !== undefined ||
    Boolean(d.note?.trim())
  );
}

/** Régularité au sens de Clue : variation des 6 derniers cycles. */
export function regularity(variation: number | null): 'regular' | 'fairly' | 'irregular' | null {
  if (variation === null) return null;
  if (variation <= 7) return 'regular';
  if (variation <= 9) return 'fairly';
  return 'irregular';
}

export interface Pattern {
  category: string;
  option: string;
  /** Nombre de jours où l'option a été notée. */
  count: number;
  /** Nombre de cycles où elle apparaît. */
  cycles: number;
  /** Occurrences par jour du cycle (index 0 = J1, dernier = J`maxDay` et au-delà). */
  byDay: number[];
  /** Les 3 jours du cycle où elle revient le plus (J début, J fin). */
  peak: [number, number];
}

/** Tendances : pour chaque option notée, à quels jours du cycle elle revient. */
export function patterns(days: CycleDay[], cycles: Cycle[], maxDay = 40): Pattern[] {
  const kept = cycles.filter((c) => !c.excluded);
  const starts = kept.map((c) => dayNum(c.start));
  const cycleOf = (date: ISODate): number => {
    const n = dayNum(date);
    let lo = 0;
    let hi = starts.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= n) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found < 0) return -1;
    const c = kept[found];
    return c.next && date >= c.next ? -1 : found;
  };

  const acc = new Map<string, Pattern & { seen: Set<number> }>();
  for (const d of days) {
    const ci = cycleOf(d.date);
    if (ci < 0) continue;
    const day = Math.min(maxDay, daysBetween(kept[ci].start, d.date) + 1);
    for (const [category, options] of Object.entries(d.options)) {
      for (const option of options) {
        const key = `${category}|${option}`;
        let p = acc.get(key);
        if (!p) {
          p = { category, option, count: 0, cycles: 0, byDay: Array(maxDay).fill(0), peak: [1, 1], seen: new Set() };
          acc.set(key, p);
        }
        p.count++;
        p.byDay[day - 1]++;
        p.seen.add(ci);
      }
    }
  }
  return [...acc.values()]
    .map(({ seen, ...p }) => {
      let best = 0;
      let at = 0;
      for (let i = 0; i < maxDay; i++) {
        const s = p.byDay[i] + (p.byDay[i + 1] ?? 0) + (p.byDay[i + 2] ?? 0);
        if (s > best) {
          best = s;
          at = i;
        }
      }
      const end = Math.min(maxDay, at + 3);
      // Resserre sur les jours réellement notés.
      let a = at;
      let b = end - 1;
      while (a < b && p.byDay[a] === 0) a++;
      while (b > a && p.byDay[b] === 0) b--;
      return { ...p, cycles: seen.size, peak: [a + 1, b + 1] as [number, number] };
    })
    .sort((x, y) => y.count - x.count);
}
