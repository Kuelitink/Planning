/** Outils partagés par les vues du mode Cycle. */

import { useMemo, type ReactNode } from 'react';
import type { CycleDay, CycleSettings, ISODate } from '../../core/types';
import { dayMarks, type DayMark, type Phase } from '../../core/cycle';
import { useCycle } from '../../state/cycle';
import { CATEGORY_BY_KEY, FLOW_LABEL, categoryLabel, optionLabel } from '../../core/cycleCatalog';
import { formatDuration, parseISODate } from '../../core/time';
import { formatDayMonth, formatDayShort } from '../../ui/format';

export const WEEKDAY_LETTER = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

const PHASE_LABEL: Record<Phase, string> = {
  period: 'Règles',
  follicular: 'Phase folliculaire',
  fertile: 'Fenêtre fertile',
  ovulation: 'Ovulation (estimée)',
  luteal: 'Phase lutéale',
  pms: 'SPM probable',
  late: 'Règles en retard',
};

/** Libellé de la phase, selon ce qu'on a choisi d'afficher. */
export function phaseLabel(phase: Phase, s: CycleSettings): string {
  if (phase === 'ovulation' && !s.showOvulation) phase = 'fertile';
  if (phase === 'fertile' && !s.showFertile) return s.showOvulation ? PHASE_LABEL.follicular : 'Milieu du cycle';
  if (phase === 'pms' && !s.showPms) phase = 'luteal';
  return PHASE_LABEL[phase];
}

/** « 19 oct. » */
export const dayMonth = (d: ISODate) => formatDayMonth(parseISODate(d));
/** « Lun. 19 oct. » */
export const dayShort = (d: ISODate) => formatDayShort(parseISODate(d));

/** « 11–16 oct. », « 28 sept.–3 oct. » */
export function formatRange(a: ISODate, b: ISODate): string {
  const da = parseISODate(a);
  const db = parseISODate(b);
  if (a === b) return formatDayMonth(da);
  return da.getMonth() === db.getMonth() ? `${da.getDate()}–${formatDayMonth(db)}` : `${formatDayMonth(da)}–${formatDayMonth(db)}`;
}

export const plural = (n: number, word: string) => `${n} ${word}${Math.abs(n) > 1 ? 's' : ''}`;

/** « aujourd'hui », « demain », « dans 4 jours », « il y a 2 jours » */
export function relativeDays(n: number): string {
  if (n === 0) return "aujourd'hui";
  if (n === 1) return 'demain';
  if (n === -1) return 'hier';
  return n > 0 ? `dans ${plural(n, 'jour')}` : `il y a ${plural(-n, 'jour')}`;
}

/**
 * Phase affichée pour un jour, de la plus importante à la moins importante. Partagée par
 * l'anneau, le calendrier du Cycle, le Calendrier et la légende : même code couleur partout.
 * `dayMarks` ne marque déjà que ce que les réglages affichent (fertile, ovulation, SPM).
 */
export type DayPhase = 'period' | 'predicted' | 'ovulation' | 'fertile' | 'pms';

export function dayPhase(mark: DayMark | undefined): DayPhase | undefined {
  if (mark?.period === 'logged') return 'period';
  if (mark?.period === 'predicted') return 'predicted';
  if (mark?.ovulation) return 'ovulation';
  if (mark?.fertile) return 'fertile';
  if (mark?.pms) return 'pms';
  return undefined;
}

/** Classes du fond d'une case selon sa phase (« » si le jour n'en a pas). */
export function phaseClass(phase: DayPhase | undefined): string {
  // L'ovulation garde le fond de la fenêtre fertile, avec une pastille en plus.
  return phase ? `cy-day cy-day--${phase === 'ovulation' ? 'fertile' : phase}` : '';
}

/** Pastille de l'ovulation estimée (posée dans le coin de la case). */
export function OvulationDot() {
  return <span className="cy-ovu" aria-hidden="true" />;
}

/** Spotting et « jour noté », discrets, sous le numéro. */
export function DayMarks({ mark }: { mark: DayMark | undefined }) {
  return (
    <span className="cy-marks" aria-hidden="true">
      {mark?.spotting && !mark.period && <span className="cy-spot" />}
      {mark?.logged && <span className="cy-logdot" />}
    </span>
  );
}

/** « J12 · Fenêtre fertile » */
export function describeMark(mark: DayMark | undefined, future: boolean): string {
  const parts: string[] = [];
  if (mark?.cycleDay) parts.push(`Jour ${mark.cycleDay} du cycle`);
  if (mark?.period === 'logged') parts.push('Règles');
  else if (mark?.period === 'predicted') parts.push(future ? 'Règles prévues' : 'Règles probables');
  else if (mark?.ovulation) parts.push('Ovulation estimée');
  else if (mark?.fertile) parts.push('Fenêtre fertile estimée');
  else if (mark?.pms) parts.push('SPM probable');
  if (mark?.spotting) parts.push('Spotting');
  return parts.join(' · ');
}

const kg = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const deg = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatKg = (n: number) => `${kg.format(n)} kg`;
export const formatBbt = (n: number) => `${deg.format(n)} °C`;
export const formatSleep = (min: number) => formatDuration(min);

/** Ce qui a été noté un jour, en pastilles. */
export function DayChips({ day, empty = 'Rien de noté.' }: { day?: CycleDay; empty?: string }) {
  const chips: { key: string; label: string; period?: boolean }[] = [];
  if (day?.flow) chips.push({ key: 'flow', label: `Règles · ${FLOW_LABEL[day.flow].toLowerCase()}`, period: true });
  if (day) {
    for (const [category, options] of Object.entries(day.options)) {
      for (const option of options) {
        const single = category === 'pms' || (CATEGORY_BY_KEY.get(category)?.options.length ?? 0) === 0;
        const label = single && category !== 'tags' ? categoryLabel(category) : optionLabel(category, option);
        const sev = day.severity?.[`${category}.${option}`];
        chips.push({
          key: `${category}.${option}`,
          label: sev ? `${label} (${severityWord(sev)})` : label,
          period: category === 'spotting',
        });
      }
    }
    if (day.sleepMin !== undefined) chips.push({ key: 'sleep', label: `Sommeil ${formatSleep(day.sleepMin)}` });
    if (day.bbt !== undefined) chips.push({ key: 'bbt', label: formatBbt(day.bbt) });
    if (day.weightKg !== undefined) chips.push({ key: 'weight', label: formatKg(day.weightKg) });
  }
  if (!chips.length && !day?.note) return <p className="cy-card__sub">{empty}</p>;
  return (
    <>
      {chips.length > 0 && (
        <div className="cy-chips">
          {chips.map((c) => (
            <span key={c.key} className={c.period ? 'cy-tag cy-tag--period' : 'cy-tag'}>
              {c.label}
            </span>
          ))}
        </div>
      )}
      {day?.note && (
        <p style={{ margin: chips.length ? '10px 2px 0' : 0, fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{day.note}</p>
      )}
    </>
  );
}

const SEVERITY_WORD: Record<string, string> = { mild: 'légère', moderate: 'modérée', severe: 'forte', very_severe: 'très forte' };
export const severityWord = (s: string) => SEVERITY_WORD[s] ?? s;

const PHASE_LEGEND: Record<DayPhase, string> = {
  period: 'Règles',
  predicted: 'Règles prévues',
  fertile: 'Fenêtre fertile',
  ovulation: 'Ovulation estimée',
  pms: 'SPM',
};

/** Échantillon d'une phase, rendu comme une case du calendrier. */
export function PhaseSwatch({ phase }: { phase?: DayPhase }) {
  return (
    <span className={`cy-swatch ${phaseClass(phase)}`} aria-hidden="true">
      {phase === 'ovulation' && <OvulationDot />}
    </span>
  );
}

/**
 * Légende des couleurs, avec les mêmes rendus que les cases :
 * `ring` (anneau), `calendar` (calendrier du Cycle), `planner` (mode Calendrier).
 */
export function Legend({ settings, variant }: { settings: CycleSettings; variant: 'ring' | 'calendar' | 'planner' }) {
  const phases: DayPhase[] = ['period', 'predicted'];
  if (settings.showFertile) phases.push('fertile');
  if (settings.showOvulation) phases.push('ovulation');
  if (settings.showPms) phases.push('pms');
  const items: { key: string; label: string; swatch: ReactNode }[] = phases.map((p) => ({
    key: p,
    label: PHASE_LEGEND[p],
    swatch: <PhaseSwatch phase={p} />,
  }));
  if (variant !== 'planner') {
    items.push(
      { key: 'none', label: 'Autres jours', swatch: <PhaseSwatch /> },
      { key: 'today', label: "Aujourd'hui", swatch: <span className="cy-swatch cy-swatch--today" aria-hidden="true" /> },
      { key: 'logged', label: 'Jour noté', swatch: <span className="cy-legend__mark" aria-hidden="true"><span className="cy-logdot" /></span> },
    );
  }
  if (variant === 'calendar') {
    items.push({ key: 'spot', label: 'Spotting', swatch: <span className="cy-legend__mark" aria-hidden="true"><span className="cy-spot" /></span> });
  }
  return (
    <ul className="cy-legend" aria-label="Légende">
      {items.map((i) => (
        <li key={i.key}>
          {i.swatch}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Marques du cycle pour le mode Calendrier, de `from` à `to` : `null` si le réglage
 * « Phases du cycle dans le Calendrier » est coupé ou s'il n'y a pas de règles notées.
 */
export function useCalendarMarks(from: ISODate, to: ISODate): Map<ISODate, DayMark> | null {
  const { settings, byDate, forecast: fc, today } = useCycle();
  return useMemo(() => {
    if (!settings.onCalendar || !fc.cycles.length) return null;
    return dayMarks([...byDate.values()], fc, settings, from, to, today);
  }, [settings, byDate, fc, from, to, today]);
}
