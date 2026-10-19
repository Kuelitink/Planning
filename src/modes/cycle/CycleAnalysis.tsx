/** Vue Analyse du mode Cycle : moyennes, analyses détaillées, historique des cycles, tendances. */

import { useMemo, useState } from 'react';
import type { Cycle } from '../../core/cycle';
import { addDaysISO, patterns, regularity } from '../../core/cycle';
import { CATEGORY_BY_KEY, categoryLabel, optionLabel } from '../../core/cycleCatalog';
import { byPhase, flowProfile, phaseLifts, timing } from '../../core/insights';
import { parseISODate } from '../../core/time';
import { useCycle } from '../../state/cycle';
import { useNav, type InsightTopic } from '../../state/nav';
import { IconChevronRight } from '../../ui/icons';
import { INSIGHT_COLOR, INSIGHT_TITLE, windowText } from './insights';
import { DAY_PHASE_IN } from './phaseInfo';
import { dayMonth, formatBbt, formatKg, formatRange, formatSleep, plural } from './shared';

const fmt1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const HEAT_DAYS = 40;
const BAR_MAX = 45;

const REGULARITY: Record<NonNullable<ReturnType<typeof regularity>>, string> = {
  regular: 'Régulier',
  fairly: 'Assez régulier',
  irregular: 'Irrégulier',
};

/** « 4 sept. – 30 sept. 2026 », « Depuis le 1 oct. » */
function cycleDates(c: Cycle): string {
  if (!c.next) return `Depuis le ${dayMonth(c.start)}`;
  const end = addDaysISO(c.next, -1);
  const startYear = c.start.slice(0, 4) !== end.slice(0, 4) ? ` ${c.start.slice(0, 4)}` : '';
  return `${dayMonth(c.start)}${startYear} – ${dayMonth(end)} ${end.slice(0, 4)}`;
}

function Tile({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return (
    <div className="cy-tile">
      <div className="cy-tile__label">{label}</div>
      <div className="cy-tile__value">
        {value}
        {unit && <small> {unit}</small>}
      </div>
      {hint && <div className="cy-tile__hint">{hint}</div>}
    </div>
  );
}

/** Ligne d'analyse détaillée : ouvre sa feuille. */
function InsightRow({ topic, summary }: { topic: InsightTopic; summary: string }) {
  const { openSheet } = useNav();
  return (
    <button type="button" className="cy-insight" onClick={() => openSheet({ kind: 'cycleInsight', topic })}>
      <span className="cy-swatch" style={{ background: INSIGHT_COLOR[topic] }} aria-hidden="true" />
      <span className="cy-insight__text">
        <span className="cy-insight__title">{INSIGHT_TITLE[topic]}</span>
        <span className="cy-insight__sub">{summary}</span>
      </span>
      <IconChevronRight size={18} />
    </button>
  );
}

type HistoryFilter = 'all' | 'kept' | 'excluded' | 'atypical' | 'note';

const FILTERS: { value: HistoryFilter; label: string; test: (c: Cycle) => boolean }[] = [
  { value: 'all', label: 'Tous', test: () => true },
  { value: 'kept', label: 'Retenus', test: (c) => !c.excluded && !c.atypical },
  { value: 'excluded', label: 'Exclus', test: (c) => c.excluded },
  { value: 'atypical', label: 'Atypiques', test: (c) => c.atypical },
  { value: 'note', label: 'Avec note', test: (c) => Boolean(c.note) },
];

export function CycleAnalysis() {
  const { openSheet } = useNav();
  const { forecast: fc, days, contexts, today } = useCycle();
  const [allCycles, setAllCycles] = useState(false);
  const [allPatterns, setAllPatterns] = useState(false);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const { stats, cycles } = fc;
  const trends = useMemo(() => patterns(days, cycles, HEAT_DAYS), [days, cycles]);

  // Résumés des analyses détaillées.
  const summaries = useMemo(() => {
    const flow = flowProfile(days, cycles);
    const cramps = timing(days, fc, 'pain', 'period_cramps');
    const lifts = phaseLifts(byPhase(days, contexts, 'feelings'));
    const nights = days.filter((d) => d.sleepMin !== undefined);
    const lastBbt = days.filter((d) => d.bbt !== undefined).sort((a, b) => b.date.localeCompare(a.date))[0];
    const lastWeight = days.filter((d) => d.weightKg !== undefined).sort((a, b) => b.date.localeCompare(a.date))[0];
    return {
      flow: flow.heaviestDay
        ? `Plus abondantes le J${flow.heaviestDay} · ${Math.round(flow.heavyShare * 100)} % avec un jour abondant`
        : 'Abondance jour par jour',
      pain: cramps.cycles
        ? `Crampes dans ${cramps.cycles} cycles sur ${cramps.tracked}${
            cramps.next && cramps.next[1] >= today
              ? ` · prochaines vers le ${formatRange(cramps.next[0], cramps.next[1])}`
              : cramps.window
                ? `, ${windowText(cramps.window)}`
                : ''
          }`
        : 'Moment et intensité des douleurs',
      mood: lifts[0]
        ? `${optionLabel('feelings', lifts[0].option)} : surtout ${DAY_PHASE_IN[lifts[0].phase]}`
        : 'Émotions, mental et énergie selon la phase',
      sleep: nights.length
        ? `${formatSleep(nights.reduce((s, d) => s + d.sleepMin!, 0) / nights.length)} en moyenne · ${plural(nights.length, 'nuit')}`
        : undefined,
      bbt: lastBbt ? `Dernière : ${formatBbt(lastBbt.bbt!)} le ${dayMonth(lastBbt.date)}` : undefined,
      weight: lastWeight,
    };
  }, [days, cycles, fc, contexts, today]);

  if (!cycles.length) {
    return (
      <div className="empty">
        L'analyse apparaît dès que des règles sont notées : durée moyenne du cycle et des règles, régularité, historique et tendances.
      </div>
    );
  }

  const history = [...cycles].reverse().filter(FILTERS.find((f) => f.value === filter)!.test);
  const shownHistory = allCycles ? history : history.slice(0, 12);
  const shownPatterns = allPatterns ? trends : trends.slice(0, 10);
  const reg = regularity(stats.variation);

  return (
    <>
      <div className="cy-tiles section" style={{ marginTop: 16 }}>
        <Tile
          label="Cycle moyen"
          value={stats.meanCycle !== undefined ? fmt1.format(stats.meanCycle) : String(stats.cycleLength)}
          unit="jours"
          hint={stats.sample ? `± ${fmt1.format(stats.sd)} j · ${plural(stats.sample, 'cycle')}` : 'Durée des réglages'}
        />
        <Tile
          label="Règles"
          value={stats.meanPeriod !== undefined ? fmt1.format(stats.meanPeriod) : String(stats.periodLength)}
          unit="jours"
          hint="en moyenne"
        />
        <Tile
          label="Variation"
          value={stats.variation !== null ? String(stats.variation) : '—'}
          unit={stats.variation !== null ? 'jours' : undefined}
          hint={reg ? REGULARITY[reg] : 'Pas assez de cycles'}
        />
        <Tile label="Cycles notés" value={String(cycles.length)} hint={`depuis ${parseISODate(cycles[0].start).getFullYear()}`} />
      </div>
      <p className="cy-foot">
        Repères : un cycle dure en général 21 à 35 jours, des règles 2 à 7 jours ; une variation de 7 jours ou moins entre les 6 derniers
        cycles est considérée comme régulière. Les cycles exclus ou atypiques (moins de 15 jours, plus de 90) ne comptent pas dans les
        moyennes.
      </p>

      <section className="section">
        <h2 className="section-label">Analyses détaillées</h2>
        <div className="cy-card" style={{ padding: '0 16px' }}>
          <InsightRow
            topic="length"
            summary={
              stats.meanCycle !== undefined
                ? `${fmt1.format(stats.meanCycle)} j en moyenne${stats.variation !== null ? ` · variation ${stats.variation} j` : ''}`
                : 'Durée et variation des cycles'
            }
          />
          <InsightRow topic="flow" summary={summaries.flow} />
          <InsightRow topic="pain" summary={summaries.pain} />
          <InsightRow topic="mood" summary={summaries.mood} />
          {summaries.sleep && <InsightRow topic="sleep" summary={summaries.sleep} />}
          <InsightRow topic="bbt" summary={summaries.bbt ?? 'Courbe et décalage thermique'} />
        </div>
        {summaries.weight && (
          <div className="cy-tiles" style={{ marginTop: 8 }}>
            <Tile label="Poids" value={formatKg(summaries.weight.weightKg!)} hint={`le ${dayMonth(summaries.weight.date)}`} />
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="section-label">Historique des cycles</h2>
        <div className="cy-chips" role="group" aria-label="Filtrer les cycles" style={{ marginBottom: 8 }}>
          {FILTERS.map((f) => {
            const n = cycles.filter(f.test).length;
            if (f.value !== 'all' && !n) return null;
            return (
              <button key={f.value} type="button" className="chip" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
                {f.label} · {n}
              </button>
            );
          })}
        </div>
        <div className="cy-card" style={{ padding: '4px 16px' }}>
          {shownHistory.map((c) => {
            const len = c.length ?? fc.cycleDay ?? 1;
            return (
              <button
                key={c.start}
                type="button"
                className={c.excluded ? 'cy-history cy-history--off' : 'cy-history'}
                onClick={() => openSheet({ kind: 'cycle', start: c.start })}
              >
                <span className="cy-history__dates">
                  {cycleDates(c)}
                  {c.excluded && <span className="cy-badge">Exclu</span>}
                  {c.atypical && !c.excluded && <span className="cy-badge">Atypique</span>}
                  {c.note && <span className="cy-badge">Note</span>}
                </span>
                <span className="cy-history__len">{c.length !== undefined ? `${c.length} j` : `J${fc.cycleDay}`}</span>
                <span className="cy-history__bar" aria-hidden="true">
                  <span style={{ width: `${(Math.min(len, BAR_MAX) / BAR_MAX) * 100}%`, background: 'var(--cy-past)' }} />
                  <span style={{ width: `${(Math.min(c.periodDays, BAR_MAX) / BAR_MAX) * 100}%`, background: 'var(--cy-period)' }} />
                </span>
              </button>
            );
          })}
        </div>
        {history.length > 12 && (
          <button type="button" className="link-btn" onClick={() => setAllCycles((v) => !v)}>
            {allCycles ? 'Afficher moins' : `Afficher les ${history.length} cycles`}
          </button>
        )}
      </section>

      {trends.length > 0 && (
        <section className="section">
          <h2 className="section-label">Tendances</h2>
          <div className="cy-card" style={{ padding: '4px 16px' }}>
            {shownPatterns.map((p) => {
              const color = CATEGORY_BY_KEY.get(p.category)?.color ?? '#7A8290';
              const max = Math.max(...p.byDay);
              const peak = p.peak[0] === p.peak[1] ? `J${p.peak[0]}` : `J${p.peak[0]}–J${p.peak[1]}`;
              return (
                <div key={`${p.category}.${p.option}`} className="cy-pattern">
                  <div className="cy-pattern__head">
                    <span className="cy-pattern__name">
                      {p.category === 'pms' ? 'SPM' : optionLabel(p.category, p.option)}
                      {p.category !== 'pms' && <small>{categoryLabel(p.category)}</small>}
                    </span>
                    <span className="cy-pattern__meta">
                      {p.count} fois · {plural(p.cycles, 'cycle')}
                    </span>
                  </div>
                  <div className="cy-heat" aria-hidden="true">
                    {p.byDay.map((n, i) => (
                      <span key={i} style={{ background: n ? color : 'var(--soft)', opacity: n ? 0.25 + 0.75 * (n / max) : 1 }} />
                    ))}
                  </div>
                  <div className="cy-heat__axis" aria-hidden="true">
                    <span>J1</span>
                    <span>Surtout {peak}</span>
                    <span>J{HEAT_DAYS}+</span>
                  </div>
                </div>
              );
            })}
          </div>
          {trends.length > 10 && (
            <button type="button" className="link-btn" onClick={() => setAllPatterns((v) => !v)}>
              {allPatterns ? 'Afficher moins' : `Afficher les ${trends.length} tendances`}
            </button>
          )}
        </section>
      )}
    </>
  );
}
