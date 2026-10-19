/**
 * Analyses détaillées du mode Cycle (celles de Clue Plus) : abondance des règles, moment et
 * intensité des douleurs (avec prédiction), humeur et mesures par phase, température basale
 * et décalage thermique.
 *
 * Phases d'un jour passé, estimées à partir des règles qui encadrent son cycle :
 * - règles : du premier au dernier jour de règles noté ;
 * - fenêtre fertile : les 5 jours avant l'ovulation estimée (règles suivantes − 14 j) et ce jour-là ;
 * - SPM : les `pmsDays` jours avant les règles suivantes ;
 * - folliculaire avant la fenêtre fertile, lutéale entre l'ovulation et le SPM.
 * Le cycle en cours se termine aux règles attendues (début + durée moyenne). Les cycles exclus
 * ou atypiques sont ignorés : leurs phases ne voudraient rien dire.
 */

import type { CycleDay, Flow, ISODate } from './types';
import { addDaysISO, daysBetween, dayNum, FERTILE_BEFORE, LUTEAL_DAYS, type Cycle, type Forecast } from './cycle';

export type DayPhase = 'period' | 'follicular' | 'fertile' | 'luteal' | 'pms';

export const DAY_PHASES: DayPhase[] = ['period', 'follicular', 'fertile', 'luteal', 'pms'];

export const FLOW_ORDER: Flow[] = ['light', 'medium', 'heavy', 'very_heavy'];

/** Phase d'un jour d'un cycle qui se termine la veille de `next`. */
export function phaseIn(date: ISODate, cycle: Pick<Cycle, 'start' | 'periodDays'>, next: ISODate, pmsDays: number): DayPhase {
  if (daysBetween(cycle.start, date) < cycle.periodDays) return 'period';
  const ovulation = addDaysISO(next, -LUTEAL_DAYS);
  if (date < addDaysISO(ovulation, -FERTILE_BEFORE)) return 'follicular';
  if (date <= ovulation) return 'fertile';
  if (date >= addDaysISO(next, -Math.max(1, pmsDays))) return 'pms';
  return 'luteal';
}

export interface DayContext {
  /** Indice du cycle dans `fc.cycles`. */
  cycle: number;
  /** Jour du cycle (1 = premier jour des règles). */
  cycleDay: number;
  phase: DayPhase;
}

/** Cycle et phase de chaque jour noté (hors cycles exclus ou atypiques). */
export function dayContexts(days: CycleDay[], fc: Pick<Forecast, 'cycles' | 'stats'>, pmsDays: number): Map<ISODate, DayContext> {
  const cycles = fc.cycles;
  const starts = cycles.map((c) => dayNum(c.start));
  const out = new Map<ISODate, DayContext>();
  for (const d of days) {
    const n = dayNum(d.date);
    // Dernier cycle commencé au plus tard ce jour-là (recherche dichotomique).
    let lo = 0;
    let hi = starts.length - 1;
    let i = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= n) {
        i = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (i < 0) continue;
    const c = cycles[i];
    if (c.excluded || c.atypical) continue;
    const next = c.next ?? addDaysISO(c.start, Math.max(fc.stats.cycleLength, daysBetween(c.start, d.date) + 1));
    if (d.date >= next) continue;
    out.set(d.date, { cycle: i, cycleDay: daysBetween(c.start, d.date) + 1, phase: phaseIn(d.date, c, next, pmsDays) });
  }
  return out;
}

// --- Abondance des règles ---------------------------------------------------------------

export interface FlowProfile {
  /** Par jour de règles (index 0 = J1) : nombre de règles notées à chaque intensité. */
  byDay: Record<Flow, number>[];
  /** Intensité moyenne par jour de règles (1 = léger … 4 = très abondant), null sans saisie. */
  meanByDay: (number | null)[];
  /** Jour de règles le plus abondant en moyenne (1 = J1). */
  heaviestDay?: number;
  /** Dernières règles, du plus récent au plus ancien : intensité de chaque jour. */
  recent: { start: ISODate; flows: (Flow | undefined)[] }[];
  /** Règles analysées. */
  periods: number;
  /** Part des règles avec au moins un jour abondant ou très abondant. */
  heavyShare: number;
}

const FLOW_LEVEL: Record<Flow, number> = { light: 1, medium: 2, heavy: 3, very_heavy: 4 };

export function flowProfile(days: CycleDay[], cycles: Cycle[], maxDays = 8, recentCount = 12): FlowProfile {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const kept = cycles.filter((c) => !c.excluded);
  const byDay = Array.from({ length: maxDays }, () => ({ light: 0, medium: 0, heavy: 0, very_heavy: 0 }) as Record<Flow, number>);
  const sums = Array<number>(maxDays).fill(0);
  const counts = Array<number>(maxDays).fill(0);
  const recent: FlowProfile['recent'] = [];
  let heavy = 0;
  for (const c of kept) {
    const flows: (Flow | undefined)[] = [];
    for (let i = 0; i < Math.min(c.periodDays, maxDays); i++) {
      const flow = byDate.get(addDaysISO(c.start, i))?.flow;
      flows.push(flow);
      if (!flow) continue;
      byDay[i][flow]++;
      sums[i] += FLOW_LEVEL[flow];
      counts[i]++;
    }
    if (flows.some((f) => f === 'heavy' || f === 'very_heavy')) heavy++;
    recent.push({ start: c.start, flows });
  }
  const meanByDay = sums.map((s, i) => (counts[i] ? s / counts[i] : null));
  let heaviestDay: number | undefined;
  // Un jour compte s'il est noté dans au moins un quart des règles (pas de pic sur 1 saisie isolée).
  meanByDay.forEach((m, i) => {
    if (m !== null && counts[i] >= Math.max(1, kept.length / 4) && (heaviestDay === undefined || m > meanByDay[heaviestDay - 1]!)) {
      heaviestDay = i + 1;
    }
  });
  return {
    byDay,
    meanByDay,
    heaviestDay,
    recent: recent.reverse().slice(0, recentCount),
    periods: kept.length,
    heavyShare: kept.length ? heavy / kept.length : 0,
  };
}

// --- Moment d'un symptôme dans le cycle (crampes, maux de tête…) ---------------------------

export const TIMING_BEFORE = 7;
export const TIMING_AFTER = 20;

export interface Timing {
  category: string;
  option: string;
  /** Cycles où l'option est notée. */
  cycles: number;
  /** Cycles suivis : au moins une saisie autre que les règles. */
  tracked: number;
  /** Occurrences par jour relatif aux règles : index 0 = 7 jours avant, puis J1 = index 7… */
  byOffset: number[];
  /** Moment habituel, en jours relatifs aux règles (−1 = la veille, 1 = J1). */
  window?: [number, number];
  /** Intensités notées (douleurs). */
  severity: Record<string, number>;
  /** Prochaine période prévue pour ce symptôme. */
  next?: [ISODate, ISODate];
}

/** Décalage d'un jour par rapport aux règles : −n s'il précède de n jours les règles suivantes, sinon J (1 = J1). */
function offsetOf(date: ISODate, c: Cycle): number {
  if (c.next) {
    const before = daysBetween(date, c.next);
    if (before >= 1 && before <= TIMING_BEFORE) return -before;
  }
  return daysBetween(c.start, date) + 1;
}

/** Index dans `byOffset` (J−7…J−1 puis J1…J20). */
export const offsetIndex = (offset: number) => (offset < 0 ? TIMING_BEFORE + offset : TIMING_BEFORE + offset - 1);
export const indexOffset = (i: number) => (i < TIMING_BEFORE ? i - TIMING_BEFORE : i - TIMING_BEFORE + 1);

export function timing(days: CycleDay[], fc: Pick<Forecast, 'cycles' | 'nextPeriod'>, category: string, option: string): Timing {
  const cycles = fc.cycles.filter((c) => !c.excluded);
  const starts = cycles.map((c) => dayNum(c.start));
  const size = TIMING_BEFORE + TIMING_AFTER;
  const byOffset = Array<number>(size).fill(0);
  const severity: Record<string, number> = {};
  const seen = new Set<number>();
  const tracked = new Set<number>();
  for (const d of days) {
    const n = dayNum(d.date);
    let i = -1;
    for (let lo = 0, hi = starts.length - 1; lo <= hi; ) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= n) {
        i = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (i < 0) continue;
    const c = cycles[i];
    if (c.next && d.date >= c.next) continue;
    if (Object.values(d.options).some((o) => o.length)) tracked.add(i);
    if (!d.options[category]?.includes(option)) continue;
    // Un symptôme juste avant les règles compte pour le cycle des règles qui suivent.
    const offset = offsetOf(d.date, c);
    seen.add(offset < 0 ? i + 1 : i);
    if (offset >= -TIMING_BEFORE && offset <= TIMING_AFTER) byOffset[offsetIndex(offset)]++;
    const sev = d.severity?.[`${category}.${option}`];
    if (sev) severity[sev] = (severity[sev] ?? 0) + 1;
  }

  // Moment habituel : autour du pic, les jours notés dans au moins 40 % des cas du pic.
  let window: [number, number] | undefined;
  const peak = byOffset.indexOf(Math.max(...byOffset));
  if (byOffset[peak] > 0) {
    const floor = byOffset[peak] * 0.4;
    let a = peak;
    let b = peak;
    while (a > 0 && byOffset[a - 1] >= floor) a--;
    while (b < size - 1 && byOffset[b + 1] >= floor) b++;
    window = [indexOffset(a), indexOffset(b)];
  }
  // Prédiction à partir de 3 cycles concernés.
  let next: [ISODate, ISODate] | undefined;
  if (window && seen.size >= 3 && fc.nextPeriod) {
    const at = (o: number) => addDaysISO(fc.nextPeriod!, o < 0 ? o : o - 1);
    next = [at(window[0]), at(window[1])];
  }
  return { category, option, cycles: seen.size, tracked: tracked.size, byOffset, window, severity, next };
}

// --- Humeur et mesures par phase ----------------------------------------------------------

export interface PhaseShare {
  phase: DayPhase;
  /** Jours de cette phase où la catégorie a été notée. */
  days: number;
  /** Options notées, de la plus fréquente à la moins fréquente ; `share` = part des jours notés. */
  options: { option: string; count: number; share: number }[];
}

/** Options d'une catégorie par phase du cycle. */
export function byPhase(days: CycleDay[], contexts: Map<ISODate, DayContext>, category: string): PhaseShare[] {
  const acc = new Map<DayPhase, { days: number; counts: Map<string, number> }>(DAY_PHASES.map((p) => [p, { days: 0, counts: new Map() }]));
  for (const d of days) {
    const options = d.options[category];
    const ctx = contexts.get(d.date);
    if (!options?.length || !ctx) continue;
    const a = acc.get(ctx.phase)!;
    a.days++;
    for (const o of options) a.counts.set(o, (a.counts.get(o) ?? 0) + 1);
  }
  return DAY_PHASES.map((phase) => {
    const a = acc.get(phase)!;
    const options = [...a.counts]
      .map(([option, count]) => ({ option, count, share: count / a.days }))
      .sort((x, y) => y.count - x.count || x.option.localeCompare(y.option));
    return { phase, days: a.days, options };
  });
}

export interface PhaseLift {
  option: string;
  phase: DayPhase;
  /** Part des jours notés de la phase. */
  share: number;
  /** Combien de fois plus fréquent que sur l'ensemble du cycle. */
  lift: number;
}

/** Options nettement plus fréquentes dans une phase (au moins 3 fois, 1,5× la moyenne). */
export function phaseLifts(shares: PhaseShare[], limit = 3): PhaseLift[] {
  const totalDays = shares.reduce((s, p) => s + p.days, 0);
  if (!totalDays) return [];
  const overall = new Map<string, number>();
  for (const p of shares) for (const o of p.options) overall.set(o.option, (overall.get(o.option) ?? 0) + o.count);
  const best = new Map<string, PhaseLift>();
  for (const p of shares) {
    for (const o of p.options) {
      const lift = o.share / (overall.get(o.option)! / totalDays);
      if (o.count < 3 || lift < 1.5) continue;
      const cur = best.get(o.option);
      if (!cur || lift > cur.lift) best.set(o.option, { option: o.option, phase: p.phase, share: o.share, lift });
    }
  }
  return [...best.values()].sort((a, b) => b.lift - a.lift).slice(0, limit);
}

/** Moyenne d'une mesure par phase (sommeil, température…). */
export function measureByPhase(
  days: CycleDay[],
  contexts: Map<ISODate, DayContext>,
  pick: (d: CycleDay) => number | undefined,
): { phase: DayPhase; mean: number | null; count: number }[] {
  const acc = new Map<DayPhase, number[]>(DAY_PHASES.map((p) => [p, []]));
  for (const d of days) {
    const v = pick(d);
    const ctx = contexts.get(d.date);
    if (v !== undefined && ctx) acc.get(ctx.phase)!.push(v);
  }
  return DAY_PHASES.map((phase) => {
    const xs = acc.get(phase)!;
    return { phase, mean: xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null, count: xs.length };
  });
}

/** Ce qui revient le plus pendant une phase : options notées dans le plus de cycles. */
export function phaseHighlights(
  days: CycleDay[],
  contexts: Map<ISODate, DayContext>,
  phase: DayPhase,
  limit = 4,
): { category: string; option: string; cycles: number; of: number }[] {
  const seen = new Map<string, Set<number>>();
  const tracked = new Set<number>();
  for (const d of days) {
    const ctx = contexts.get(d.date);
    if (!ctx || ctx.phase !== phase) continue;
    for (const [category, options] of Object.entries(d.options)) {
      if (!options.length || category === 'tags' || category === 'collection_method') continue;
      tracked.add(ctx.cycle);
      for (const o of options) {
        const key = `${category}|${o}`;
        if (!seen.has(key)) seen.set(key, new Set());
        seen.get(key)!.add(ctx.cycle);
      }
    }
  }
  return [...seen]
    .map(([key, cycles]) => {
      const [category, option] = key.split('|');
      return { category, option, cycles: cycles.size, of: tracked.size };
    })
    .filter((h) => h.cycles >= 2)
    .sort((a, b) => b.cycles - a.cycles || a.option.localeCompare(b.option))
    .slice(0, limit);
}

// --- Température basale -----------------------------------------------------------------------

export interface CyclePoint {
  cycleDay: number;
  date: ISODate;
  value: number;
}

/** Valeurs d'une mesure sur les jours d'un cycle. */
export function cycleSeries(days: CycleDay[], cycle: Cycle, until: ISODate, pick: (d: CycleDay) => number | undefined): CyclePoint[] {
  const end = cycle.next ? addDaysISO(cycle.next, -1) : until;
  return days
    .filter((d) => d.date >= cycle.start && d.date <= end && pick(d) !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ cycleDay: daysBetween(cycle.start, d.date) + 1, date: d.date, value: pick(d)! }));
}

/**
 * Décalage thermique (règle « 3 au-dessus de 6 ») : la première fois que 3 températures
 * consécutives dépassent toutes les 6 précédentes, l'ovulation a probablement eu lieu la veille
 * de la première. Renvoie ce jour du cycle et la ligne de base (maximum des 6 précédentes).
 */
export function bbtShift(points: CyclePoint[]): { ovulationDay: number; coverline: number } | undefined {
  for (let i = 6; i + 2 < points.length; i++) {
    const coverline = Math.max(...points.slice(i - 6, i).map((p) => p.value));
    if ([0, 1, 2].every((k) => points[i + k].value > coverline)) return { ovulationDay: points[i].cycleDay - 1, coverline };
  }
  return undefined;
}
