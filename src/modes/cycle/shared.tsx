/** Outils partagés par les vues du mode Cycle. */

import type { CSSProperties } from 'react';
import type { CycleDay, CycleSettings, ISODate } from '../../core/types';
import type { DayMark, Phase } from '../../core/cycle';
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

/** Classes de la pastille d'un jour. */
export function numClass(mark: DayMark | undefined, isToday: boolean): string {
  const cls = ['cy-num'];
  if (mark?.period === 'logged') cls.push('cy-num--period');
  else if (mark?.period === 'predicted') cls.push('cy-num--predicted');
  else if (mark?.ovulation) cls.push('cy-num--ovulation');
  else if (mark?.fertile) cls.push('cy-num--fertile');
  else if (mark?.pms) cls.push('cy-num--pms');
  if (mark?.spotting && !mark.period) cls.push('cy-num--spotting');
  if (isToday) cls.push('cy-num--today');
  return cls.join(' ');
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

/** Légende des couleurs. */
export function Legend({ settings }: { settings: CycleSettings }) {
  const items = [
    { label: 'Règles', style: { background: 'var(--cy-period)' } },
    { label: 'Prévues', style: { background: 'var(--cy-period-soft)', outline: '1px dashed var(--cy-period)' } },
    settings.showFertile && { label: 'Fertile', style: { background: 'var(--cy-fertile-soft)' } },
    settings.showOvulation && { label: 'Ovulation', style: { background: 'var(--cy-fertile)' } },
    settings.showPms && { label: 'SPM', style: { background: 'var(--cy-pms-soft)' } },
  ].filter(Boolean) as { label: string; style: CSSProperties }[];
  return (
    <ul className="cy-legend" aria-label="Légende">
      {items.map((i) => (
        <li key={i.label}>
          <span className="cy-swatch" style={i.style} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
