/**
 * Analyses détaillées du mode Cycle, une par feuille : durée du cycle, règles, douleurs,
 * humeur et énergie, sommeil, température basale. Les calculs sont dans `core/insights.ts`.
 */

import { useMemo, useState, type ReactNode } from 'react';
import type { Cycle } from '../../core/cycle';
import { addDaysISO, daysBetween, regularity } from '../../core/cycle';
import { CATEGORY_BY_KEY, FLOW_LABEL, SEVERITY_OPTIONS, optionLabel } from '../../core/cycleCatalog';
import {
  DAY_PHASES,
  FLOW_ORDER,
  TIMING_BEFORE,
  bbtShift,
  byPhase,
  cycleSeries,
  flowProfile,
  indexOffset,
  measureByPhase,
  phaseLifts,
  timing,
  type Timing,
} from '../../core/insights';
import { parseISODate } from '../../core/time';
import type { InsightTopic } from '../../state/nav';
import { useCycle } from '../../state/cycle';
import { Segmented } from '../../ui/kit';
import { IconChevronLeft, IconChevronRight } from '../../ui/icons';
import { BarList, ChartLegend, ColumnChart, LineChart, type Column } from './charts';
import { DAY_PHASE_LABEL } from './phaseInfo';
import { dayMonth, formatBbt, formatRange, formatSleep, plural, relativeDays } from './shared';

const fmt1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Rampe d'intensité des règles (léger → très abondant), vérifiée pour le contraste. */
export const FLOW_COLOR: Record<string, string> = { light: '#f0909d', medium: '#dc4a5f', heavy: '#b51c36', very_heavy: '#6e0d1c' };
const PAIN_COLOR = '#D6457A';
const SLEEP_COLOR = '#3D6FE0';
const LENGTH_COLOR = '#c2185b';
const BBT_COLOR = '#c2185b';

export const INSIGHT_TITLE: Record<InsightTopic, string> = {
  length: 'Durée du cycle',
  flow: 'Règles',
  pain: 'Crampes et douleurs',
  mood: 'Humeur et énergie',
  sleep: 'Sommeil',
  bbt: 'Température basale',
};

export const INSIGHT_COLOR: Record<InsightTopic, string> = {
  length: LENGTH_COLOR,
  flow: FLOW_COLOR.medium,
  pain: PAIN_COLOR,
  mood: '#E07024',
  sleep: SLEEP_COLOR,
  bbt: BBT_COLOR,
};

/** « 2 j avant les règles », « J1 » */
export function offsetText(o: number): string {
  return o < 0 ? `${-o} j avant les règles` : `J${o}`;
}

/** « de 2 j avant les règles au J1 », « au J2 » */
export function windowText([a, b]: [number, number]): string {
  if (a === b) return a < 0 ? offsetText(a) : `le ${offsetText(a)}`;
  if (a < 0 && b < 0) return `${-a} à ${-b} j avant les règles`;
  return `${a < 0 ? `de ${offsetText(a)}` : `du ${offsetText(a)}`} au ${offsetText(b)}`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: ReactNode }) {
  return (
    <div className="cy-pred">
      <span className="cy-pred__label">{label}</span>
      <span className="cy-pred__value">
        {value}
        {sub && <small>{sub}</small>}
      </span>
    </div>
  );
}

function Block({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 18 }}>
      {title && (
        <h3 className="section-label" style={{ margin: '0 0 8px 2px' }}>
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="cy-card__sub" style={{ margin: '12px 2px' }}>
    {children}
  </p>
);

// --- Durée du cycle --------------------------------------------------------------------------

function LengthInsight() {
  const { forecast: fc } = useCycle();
  const { stats, cycles } = fc;
  const done = cycles.filter((c) => c.length !== undefined);
  const recent = done.slice(-12);
  const kept = done.filter((c) => !c.excluded && !c.atypical);
  const last12 = kept.slice(-12);
  if (!recent.length) return <Empty>Il faut au moins deux règles notées pour mesurer un cycle.</Empty>;

  const lengths = last12.map((c) => c.length!);
  const sorted = [...lengths].sort((a, b) => a - b);
  const median = sorted.length
    ? sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : undefined;
  const shortest = last12.reduce<Cycle | undefined>((m, c) => (!m || c.length! < m.length! ? c : m), undefined);
  const longest = last12.reduce<Cycle | undefined>((m, c) => (!m || c.length! > m.length! ? c : m), undefined);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const last6 = kept.slice(-6).map((c) => c.length!);
  const prev6 = kept.slice(-12, -6).map((c) => c.length!);
  const trend = last6.length >= 3 && prev6.length >= 3 ? mean(last6) - mean(prev6) : undefined;
  const reg = regularity(stats.variation);
  const buckets: [string, (n: number) => boolean][] = [
    ['25 j ou moins', (n) => n <= 25],
    ['26 à 28 j', (n) => n >= 26 && n <= 28],
    ['29 à 31 j', (n) => n >= 29 && n <= 31],
    ['32 à 35 j', (n) => n >= 32 && n <= 35],
    ['36 j ou plus', (n) => n >= 36],
  ];
  const all = kept.map((c) => c.length!);

  const columns: Column[] = recent.map((c) => {
    const off = c.excluded || c.atypical;
    const date = parseISODate(c.start).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    return {
      label: parseISODate(c.start).toLocaleDateString('fr-FR', { month: 'narrow' }),
      parts: [{ value: c.length!, color: LENGTH_COLOR }],
      tip: `Cycle du ${date} : ${c.length} jours${c.excluded ? ' (exclu)' : c.atypical ? ' (atypique)' : ''}`,
      muted: off,
    };
  });

  return (
    <>
      <div className="cy-card">
        <ColumnChart
          columns={columns}
          label={`Durée des ${recent.length} derniers cycles`}
          summary={`${recent.length} derniers cycles · touche une barre pour le détail`}
          reference={
            stats.meanCycle !== undefined ? { value: stats.meanCycle, label: `moyenne ${fmt1.format(stats.meanCycle)} j` } : undefined
          }
        />
      </div>
      <Block>
        <div className="cy-card" style={{ padding: '4px 16px' }}>
          {shortest && (
            <Stat
              label="Le plus court"
              value={`${shortest.length} j`}
              sub={`cycle du ${dayMonth(shortest.start)} ${shortest.start.slice(0, 4)}`}
            />
          )}
          {longest && (
            <Stat
              label="Le plus long"
              value={`${longest.length} j`}
              sub={`cycle du ${dayMonth(longest.start)} ${longest.start.slice(0, 4)}`}
            />
          )}
          {median !== undefined && (
            <Stat label="Durée médiane" value={`${fmt1.format(median)} j`} sub={`${plural(last12.length, 'cycle')} retenus`} />
          )}
          {stats.variation !== null && (
            <Stat
              label="Variation"
              value={`${stats.variation} j`}
              sub={reg === 'regular' ? 'régulier (7 j ou moins)' : reg === 'fairly' ? 'assez régulier' : 'irrégulier (plus de 9 j)'}
            />
          )}
          {trend !== undefined && (
            <Stat
              label="Tendance"
              value={Math.abs(trend) < 1 ? 'Stable' : `${trend > 0 ? '+' : '−'}${fmt1.format(Math.abs(trend))} j`}
              sub="6 derniers cycles comparés aux 6 d'avant"
            />
          )}
        </div>
      </Block>
      {all.length >= 3 && (
        <Block title={`Répartition (${plural(all.length, 'cycle')})`}>
          <div className="cy-card">
            <BarList
              color={LENGTH_COLOR}
              rows={buckets.map(([label, test]) => {
                const n = all.filter(test).length;
                return { label, value: n, text: `${n} · ${pct(n / all.length)}` };
              })}
            />
          </div>
        </Block>
      )}
      <p className="cy-foot">
        Un cycle dure en général de 21 à 35 jours, et sa durée varie d'un mois à l'autre. Une variation de plus de 9 jours, ou des cycles
        souvent hors de cette plage, valent la peine d'en parler à un ou une professionnelle de santé.
      </p>
    </>
  );
}

// --- Règles --------------------------------------------------------------------------------

function FlowInsight() {
  const { forecast: fc, days } = useCycle();
  const profile = useMemo(() => flowProfile(days, fc.cycles), [days, fc.cycles]);
  const spotting = useMemo(() => {
    const options = new Set(days.flatMap((d) => d.options.spotting ?? []));
    return [...options].map((o) => timing(days, fc, 'spotting', o)).sort((a, b) => b.cycles - a.cycles);
  }, [days, fc]);
  if (!profile.periods) return <Empty>Aucune règle notée pour l'instant.</Empty>;

  const lastDay = profile.byDay.reduce((m, d, i) => (FLOW_ORDER.some((f) => d[f] > 0) ? i : m), 0);
  const columns: Column[] = profile.byDay.slice(0, lastDay + 1).map((d, i) => {
    const n = FLOW_ORDER.reduce((s, f) => s + d[f], 0);
    const detail = FLOW_ORDER.filter((f) => d[f])
      .map((f) => `${FLOW_LABEL[f].toLowerCase()} ${pct(d[f] / n)}`)
      .join(', ');
    return {
      label: `J${i + 1}`,
      parts: FLOW_ORDER.map((f) => ({ value: d[f], color: FLOW_COLOR[f] })),
      tip: n ? `J${i + 1} : ${plural(n, 'règle')} notées — ${detail}` : `J${i + 1} : rien de noté`,
    };
  });
  const meanLen = fc.stats.meanPeriod;

  return (
    <>
      <div className="cy-card">
        <ColumnChart
          columns={columns}
          max={profile.periods}
          label="Abondance des règles, jour par jour"
          summary={
            profile.heaviestDay
              ? `Plus abondantes le J${profile.heaviestDay} · hauteur = règles notées ce jour-là`
              : 'Hauteur = règles notées ce jour-là'
          }
        />
        <ChartLegend items={FLOW_ORDER.map((f) => ({ label: FLOW_LABEL[f], color: FLOW_COLOR[f] }))} />
      </div>
      <Block>
        <div className="cy-card" style={{ padding: '4px 16px' }}>
          {meanLen !== undefined && <Stat label="Durée moyenne" value={`${fmt1.format(meanLen)} j`} sub="repère : 2 à 7 jours" />}
          {profile.heaviestDay && <Stat label="Jour le plus abondant" value={`J${profile.heaviestDay}`} sub="en moyenne" />}
          <Stat label="Avec un jour abondant" value={pct(profile.heavyShare)} sub={`de ${plural(profile.periods, 'règle')}`} />
        </div>
      </Block>
      <Block title="Dernières règles">
        <div className="cy-card">
          <div className="cy-flowgrid" role="table" aria-label="Abondance des dernières règles">
            {profile.recent.map((r) => (
              <div key={r.start} className="cy-flowgrid__row" role="row">
                <span className="cy-flowgrid__date" role="rowheader">
                  {dayMonth(r.start)} {r.start.slice(2, 4)}
                </span>
                {Array.from({ length: 8 }, (_, i) => {
                  const f = r.flows[i];
                  return (
                    <span
                      key={i}
                      role="cell"
                      className="cy-flowgrid__cell"
                      title={f ? `J${i + 1} : ${FLOW_LABEL[f]}` : undefined}
                      aria-label={f ? `J${i + 1} : ${FLOW_LABEL[f]}` : i < r.flows.length ? `J${i + 1} : non précisé` : ''}
                      style={{ background: f ? FLOW_COLOR[f] : i < r.flows.length ? 'var(--soft)' : 'transparent' }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <ChartLegend items={FLOW_ORDER.map((f) => ({ label: FLOW_LABEL[f], color: FLOW_COLOR[f] }))} />
        </div>
      </Block>
      {spotting.length > 0 && (
        <Block title="Spotting">
          <div className="cy-card" style={{ padding: '4px 16px' }}>
            {spotting.map((t) => (
              <TimingRow key={t.option} t={t} />
            ))}
          </div>
        </Block>
      )}
      <p className="cy-foot">
        Des règles très abondantes (protection changée toutes les heures, caillots), très douloureuses ou de plus de 7 jours méritent d'en
        parler à un ou une professionnelle de santé.
      </p>
    </>
  );
}

// --- Douleurs -------------------------------------------------------------------------------

function TimingRow({ t, highlight }: { t: Timing; highlight?: boolean }) {
  const { today } = useCycle();
  const name = optionLabel(t.category, t.option);
  return (
    <div className="cy-pred" style={highlight ? undefined : { minHeight: 52 }}>
      <span className="cy-pred__label" style={{ color: 'var(--ink)' }}>
        {name}
        <small style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
          {plural(t.cycles, 'cycle')} sur {t.tracked} suivis
        </small>
      </span>
      <span className="cy-pred__value">
        {t.window ? windowText(t.window) : '—'}
        {t.next && t.next[1] >= today && (
          <small>
            prochaine fois : {formatRange(t.next[0], t.next[1])} ({relativeDays(daysBetween(today, t.next[0]))})
          </small>
        )}
      </span>
    </div>
  );
}

function PainInsight() {
  const { forecast: fc, days, today } = useCycle();
  const all = useMemo(() => {
    const options = new Set(days.flatMap((d) => d.options.pain ?? []));
    options.delete('pain_free');
    return [...options].map((o) => timing(days, fc, 'pain', o)).sort((a, b) => b.cycles - a.cycles);
  }, [days, fc]);
  const cramps = all.find((t) => t.option === 'period_cramps');
  const others = all.filter((t) => t !== cramps && t.cycles >= 1);
  if (!all.length)
    return <Empty>Aucune douleur notée pour l'instant. Note tes crampes (et leur intensité) pour voir quand elles reviennent.</Empty>;

  const columns: Column[] | undefined = cramps?.byOffset.slice(0, TIMING_BEFORE + 14).map((n, i) => {
    const o = indexOffset(i);
    return {
      label: o === -7 || o === -1 || o === 1 || o === 7 || o === 14 ? (o < 0 ? `${o}` : `J${o}`) : '',
      parts: [{ value: n, color: PAIN_COLOR }],
      tip: `${o < 0 ? `${-o} j avant les règles` : `J${o}`} : ${n} fois`,
    };
  });
  const sevTotal = cramps ? Object.values(cramps.severity).reduce((s, n) => s + n, 0) : 0;

  return (
    <>
      {cramps && (
        <>
          <div className="cy-card" style={{ padding: '4px 16px' }}>
            <Stat
              label="Crampes"
              value={pct(cramps.cycles / Math.max(1, cramps.tracked))}
              sub={`des cycles suivis (${cramps.cycles} sur ${cramps.tracked})`}
            />
            {cramps.window && <Stat label="Moment habituel" value={windowText(cramps.window)} />}
            {cramps.next && cramps.next[1] >= today && (
              <Stat
                label="Prochaines crampes probables"
                value={formatRange(cramps.next[0], cramps.next[1])}
                sub={relativeDays(daysBetween(today, cramps.next[0]))}
              />
            )}
          </div>
          {columns && (
            <Block title="Quand elles arrivent">
              <div className="cy-card">
                <ColumnChart
                  columns={columns}
                  label="Crampes selon le jour du cycle"
                  summary="Crampes notées, de 7 jours avant les règles au J14"
                />
              </div>
            </Block>
          )}
          <Block title="Intensité">
            <div className="cy-card">
              {sevTotal ? (
                <BarList
                  color={PAIN_COLOR}
                  rows={SEVERITY_OPTIONS.map((s) => ({
                    label: s.label,
                    value: cramps.severity[s.key] ?? 0,
                    text: `${cramps.severity[s.key] ?? 0} · ${pct((cramps.severity[s.key] ?? 0) / sevTotal)}`,
                  }))}
                />
              ) : (
                <p className="cy-card__sub" style={{ margin: 0 }}>
                  Pas encore d'intensité notée : choisis-la sous « Crampes » en notant un jour.
                </p>
              )}
            </div>
          </Block>
        </>
      )}
      {others.length > 0 && (
        <Block title="Autres douleurs">
          <div className="cy-card" style={{ padding: '4px 16px' }}>
            {others.map((t) => (
              <TimingRow key={t.option} t={t} />
            ))}
          </div>
        </Block>
      )}
      <p className="cy-foot">
        Prédiction à partir de 3 cycles concernés : moment habituel appliqué aux prochaines règles attendues. Des douleurs qui empêchent les
        activités habituelles ne sont pas « normales » : parles-en à un ou une professionnelle de santé.
      </p>
    </>
  );
}

// --- Humeur et énergie ------------------------------------------------------------------------

const MOOD_CATEGORIES = [
  { key: 'feelings', label: 'Émotions' },
  { key: 'mind', label: 'Mental' },
  { key: 'energy', label: 'Énergie' },
];

function MoodInsight() {
  const { days, contexts } = useCycle();
  const [category, setCategory] = useState('feelings');
  const shares = useMemo(() => byPhase(days, contexts, category), [days, contexts, category]);
  const lifts = phaseLifts(shares);
  const color = CATEGORY_BY_KEY.get(category)?.color ?? '#E07024';
  const total = shares.reduce((s, p) => s + p.days, 0);

  return (
    <>
      <Segmented<string>
        label="Catégorie"
        value={category}
        onChange={setCategory}
        options={MOOD_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
      />
      {!total ? (
        <Empty>Rien de noté dans cette catégorie pour l'instant.</Empty>
      ) : (
        <>
          {lifts.length > 0 && (
            <Block title="Ce qui ressort">
              <div className="cy-card" style={{ padding: '4px 16px' }}>
                {lifts.map((l) => (
                  <Stat
                    key={l.option}
                    label={optionLabel(category, l.option)}
                    value={DAY_PHASE_LABEL[l.phase]}
                    sub={`${fmt1.format(l.lift)}× plus souvent · ${pct(l.share)} des jours notés`}
                  />
                ))}
              </div>
            </Block>
          )}
          {DAY_PHASES.map((phase) => {
            const s = shares.find((x) => x.phase === phase)!;
            return (
              <Block key={phase} title={`${DAY_PHASE_LABEL[phase]} · ${plural(s.days, 'jour')} notés`}>
                <div className="cy-card">
                  {s.days ? (
                    <BarList
                      color={color}
                      rows={s.options
                        .slice(0, 4)
                        .map((o) => ({ label: optionLabel(category, o.option), value: o.share, text: pct(o.share) }))}
                    />
                  ) : (
                    <p className="cy-card__sub" style={{ margin: 0 }}>
                      Rien de noté pendant cette phase.
                    </p>
                  )}
                </div>
              </Block>
            );
          })}
        </>
      )}
      <p className="cy-foot">
        Part des jours notés de chaque phase où l'option apparaît. Phases estimées à partir des règles (ovulation 14 jours avant les règles
        suivantes) ; les cycles exclus ou atypiques ne comptent pas.
      </p>
    </>
  );
}

// --- Sommeil -------------------------------------------------------------------------------------

function SleepInsight() {
  const { days, contexts, today } = useCycle();
  const nights = useMemo(() => days.filter((d) => d.sleepMin !== undefined).sort((a, b) => a.date.localeCompare(b.date)), [days]);
  const phases = useMemo(() => measureByPhase(days, contexts, (d) => d.sleepMin), [days, contexts]);
  if (!nights.length) return <Empty>Aucune nuit notée. Note ta durée de sommeil pour voir son lien avec ton cycle.</Empty>;

  const avg = nights.reduce((s, d) => s + d.sleepMin!, 0) / nights.length;
  const recent = nights.slice(-30);
  const known = phases.filter((p) => p.mean !== null);
  const best = known.reduce((m, p) => (!m || p.mean! > m.mean! ? p : m), undefined as (typeof known)[number] | undefined);
  const worst = known.reduce((m, p) => (!m || p.mean! < m.mean! ? p : m), undefined as (typeof known)[number] | undefined);
  const gap = best && worst && best !== worst ? best.mean! - worst.mean! : 0;

  return (
    <>
      <div className="cy-card" style={{ padding: '4px 16px' }}>
        <Stat label="Sommeil moyen" value={formatSleep(avg)} sub={plural(nights.length, 'nuit') + ' notées'} />
        {gap >= 20 && best && worst && (
          <Stat
            label="Selon la phase"
            value={`${formatSleep(gap)} d'écart`}
            sub={
              <>
                plus long : {DAY_PHASE_LABEL[best.phase].toLowerCase().replace('spm', 'SPM')}
                <br />
                plus court : {DAY_PHASE_LABEL[worst.phase].toLowerCase().replace('spm', 'SPM')}
              </>
            }
          />
        )}
      </div>
      <Block title={`Dernières nuits notées (${recent.length})`}>
        <div className="cy-card">
          <ColumnChart
            columns={recent.map((d) => ({
              label: '',
              parts: [{ value: d.sleepMin! / 60, color: SLEEP_COLOR }],
              tip: `${dayMonth(d.date)} ${d.date.slice(0, 4)}${d.date === today ? " (aujourd'hui)" : ''} : ${formatSleep(d.sleepMin!)}`,
            }))}
            label="Durée de sommeil des dernières nuits notées"
            summary={`Du ${dayMonth(recent[0].date)} ${recent[0].date.slice(0, 4)} au ${dayMonth(recent[recent.length - 1].date)} ${recent[recent.length - 1].date.slice(0, 4)}`}
            reference={{ value: avg / 60, label: `moyenne ${formatSleep(avg)}` }}
          />
        </div>
      </Block>
      <Block title="Par phase du cycle">
        <div className="cy-card">
          <BarList
            color={SLEEP_COLOR}
            rows={phases.map((p) => ({
              label: DAY_PHASE_LABEL[p.phase],
              value: p.mean ?? 0,
              text: p.mean !== null ? `${formatSleep(p.mean)} · ${p.count}` : '—',
            }))}
          />
        </div>
      </Block>
      <p className="cy-foot">Moyenne par phase estimée, avec le nombre de nuits notées.</p>
    </>
  );
}

// --- Température basale --------------------------------------------------------------------------

function BbtInsight() {
  const { forecast: fc, days, today } = useCycle();
  const usable = useMemo(
    () =>
      fc.cycles
        .map((c) => ({ c, points: cycleSeries(days, c, today, (d) => d.bbt) }))
        .filter((x) => x.points.length >= 3)
        .reverse(),
    [fc.cycles, days, today],
  );
  const [index, setIndex] = useState(0);
  if (!usable.length) {
    return (
      <Empty>
        Note ta température basale chaque matin (au réveil, avant de te lever) pour voir sa courbe et le décalage après l'ovulation.
      </Empty>
    );
  }
  const { c, points } = usable[Math.min(index, usable.length - 1)];
  const shift = bbtShift(points);
  const expectedNext = c.next ?? (fc.cycleStart === c.start ? fc.nextPeriod : undefined);
  const estimated = expectedNext ? daysBetween(c.start, addDaysISO(expectedNext, -14)) + 1 : undefined;
  const length = c.length ?? Math.max(fc.stats.cycleLength, points[points.length - 1].cycleDay);

  return (
    <>
      <div className="cy-month-nav">
        <button
          type="button"
          className="icon-btn"
          aria-label="Cycle précédent"
          disabled={index >= usable.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          <IconChevronLeft />
        </button>
        <span className="cy-daynav__label">
          Cycle du {dayMonth(c.start)} {c.start.slice(0, 4)}
        </span>
        <button type="button" className="icon-btn" aria-label="Cycle suivant" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          <IconChevronRight />
        </button>
      </div>
      <div className="cy-card">
        <LineChart
          points={points.map((p) => ({ x: p.cycleDay, y: p.value, tip: `J${p.cycleDay} (${dayMonth(p.date)}) : ${formatBbt(p.value)}` }))}
          color={BBT_COLOR}
          format={(v) => fmt1.format(v)}
          xMax={length}
          label={`Température basale du cycle du ${dayMonth(c.start)}`}
          summary={`${plural(points.length, 'température')} · touche un point pour le détail`}
          baseline={shift ? { value: shift.coverline, label: `ligne de base ${formatBbt(shift.coverline)}` } : undefined}
          marker={
            shift
              ? { x: shift.ovulationDay, label: `ovulation J${shift.ovulationDay}` }
              : estimated && estimated >= 1
                ? { x: estimated, label: 'ovulation estimée' }
                : undefined
          }
        />
      </div>
      <Block>
        <div className="cy-card" style={{ padding: '4px 16px' }}>
          {shift ? (
            <Stat
              label="Décalage thermique"
              value={`Ovulation vers le J${shift.ovulationDay}`}
              sub={`le ${dayMonth(addDaysISO(c.start, shift.ovulationDay - 1))}, d'après ta courbe`}
            />
          ) : (
            <Stat label="Décalage thermique" value="Pas encore net" sub="il faut 3 températures au-dessus des 6 précédentes" />
          )}
          {estimated && estimated >= 1 && (
            <Stat label="Ovulation d'après le calendrier" value={`J${estimated}`} sub="14 jours avant les règles" />
          )}
        </div>
      </Block>
      <p className="cy-foot">
        Après l'ovulation, la progestérone fait monter la température de 0,2 à 0,5 °C jusqu'aux règles. Règle « 3 au-dessus de 6 » : quand 3
        températures de suite dépassent les 6 précédentes, l'ovulation a probablement eu lieu la veille. Mesure au réveil, à la même heure,
        avant de te lever ; fièvre, alcool ou nuit courte faussent la mesure. Ce n'est pas une méthode de contraception.
      </p>
    </>
  );
}

export function InsightDetail({ topic }: { topic: InsightTopic }) {
  switch (topic) {
    case 'length':
      return <LengthInsight />;
    case 'flow':
      return <FlowInsight />;
    case 'pain':
      return <PainInsight />;
    case 'mood':
      return <MoodInsight />;
    case 'sleep':
      return <SleepInsight />;
    case 'bbt':
      return <BbtInsight />;
  }
}
