/** Vue Analyse du mode Cycle : moyennes, régularité, historique des cycles, tendances, mesures. */

import { useMemo, useState } from 'react';
import type { Cycle } from '../../core/cycle';
import { addDaysISO, daysBetween, patterns, regularity } from '../../core/cycle';
import { CATEGORY_BY_KEY, categoryLabel, optionLabel } from '../../core/cycleCatalog';
import { parseISODate } from '../../core/time';
import { useCycle } from '../../state/cycle';
import { useNav } from '../../state/nav';
import { dayMonth, formatBbt, formatKg, formatSleep, plural } from './shared';

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
  return `${dayMonth(c.start)} – ${dayMonth(end)} ${end.slice(0, 4)}`;
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

/** Durées des derniers cycles en barres, avec la moyenne. */
function LengthChart({ cycles, mean }: { cycles: Cycle[]; mean?: number }) {
  const W = 320;
  const H = 130;
  const top = 10;
  const bottom = 22;
  const max = Math.max(40, ...cycles.map((c) => c.length ?? 0));
  const bw = W / Math.max(cycles.length, 1);
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  return (
    <svg className="cy-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Durée des ${cycles.length} derniers cycles`}>
      {cycles.map((c, i) => {
        const off = c.excluded || c.atypical;
        const len = c.length ?? 0;
        return (
          <g key={c.start}>
            <rect
              x={i * bw + bw * 0.18}
              y={y(len)}
              width={bw * 0.64}
              height={Math.max(0, H - bottom - y(len))}
              rx={4}
              style={{ fill: off ? 'var(--line)' : 'var(--cy-period-soft)' }}
            />
            <text
              x={i * bw + bw / 2}
              y={y(len) - 3}
              textAnchor="middle"
              style={{ fontSize: 10, fontWeight: 600, fill: off ? 'var(--faint)' : 'var(--ink)' }}
            >
              {len}
            </text>
            <text x={i * bw + bw / 2} y={H - 6} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--muted)' }}>
              {parseISODate(c.start).toLocaleDateString('fr-FR', { month: 'narrow' })}
            </text>
          </g>
        );
      })}
      {mean !== undefined && (
        <line x1={0} x2={W} y1={y(mean)} y2={y(mean)} style={{ stroke: 'var(--cy-period)', strokeWidth: 1.5, strokeDasharray: '4 3' }} />
      )}
    </svg>
  );
}

/** Courbe d'une mesure (température basale) sur les jours du cycle en cours. */
function LineChart({ points, label }: { points: { x: number; y: number }[]; label: string }) {
  const W = 320;
  const H = 120;
  const pad = 12;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs, Math.min(...xs) + 1)];
  const [y0, y1] = [Math.min(...ys) - 0.1, Math.max(...ys) + 0.1];
  const px = (x: number) => pad + ((W - 2 * pad) * (x - x0)) / (x1 - x0);
  const py = (v: number) => pad + ((H - 2 * pad) * (y1 - v)) / (y1 - y0);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join('');
  return (
    <svg className="cy-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <path d={d} style={{ fill: 'none', stroke: 'var(--cy-period)', strokeWidth: 2 }} />
      {points.map((p) => (
        <circle key={p.x} cx={px(p.x)} cy={py(p.y)} r={3} style={{ fill: 'var(--cy-period)' }} />
      ))}
    </svg>
  );
}

export function CycleAnalysis() {
  const { openSheet } = useNav();
  const { forecast: fc, byDate, today } = useCycle();
  const [allCycles, setAllCycles] = useState(false);
  const [allPatterns, setAllPatterns] = useState(false);
  const { stats, cycles } = fc;
  const days = useMemo(() => [...byDate.values()], [byDate]);
  const trends = useMemo(() => patterns(days, cycles, HEAT_DAYS), [days, cycles]);

  const measures = useMemo(() => {
    const since = addDaysISO(today, -90);
    const sleep = days.filter((d) => d.sleepMin !== undefined && d.date >= since);
    const sleepAll = days.filter((d) => d.sleepMin !== undefined);
    const sleepSet = sleep.length ? sleep : sleepAll;
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const lastBbt = [...sorted].reverse().find((d) => d.bbt !== undefined);
    const lastWeight = [...sorted].reverse().find((d) => d.weightKg !== undefined);
    const bbtCycle = fc.cycleStart
      ? sorted
          .filter((d) => d.bbt !== undefined && d.date >= fc.cycleStart!)
          .map((d) => ({ x: daysBetween(fc.cycleStart!, d.date) + 1, y: d.bbt! }))
      : [];
    return {
      sleepAvg: sleepSet.length ? sleepSet.reduce((s, d) => s + d.sleepMin!, 0) / sleepSet.length : undefined,
      sleepCount: sleepSet.length,
      sleepRecent: sleep.length > 0,
      lastBbt,
      lastWeight,
      bbtCycle,
    };
  }, [days, today, fc.cycleStart]);

  if (!cycles.length) {
    return (
      <div className="empty">
        L'analyse apparaît dès que des règles sont notées : durée moyenne du cycle et des règles, régularité, historique et tendances.
      </div>
    );
  }

  const completed = cycles.filter((c) => c.length !== undefined);
  const recent = completed.slice(-12);
  const history = [...cycles].reverse();
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

      {recent.length > 1 && (
        <section className="section">
          <h2 className="section-label">Durée des derniers cycles</h2>
          <div className="cy-card">
            <LengthChart cycles={recent} mean={stats.meanCycle} />
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section-label">Historique des cycles</h2>
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
                  <span style={{ width: `${(Math.min(len, BAR_MAX) / BAR_MAX) * 100}%`, background: '#cfd5de' }} />
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

      {(measures.sleepAvg !== undefined || measures.lastBbt || measures.lastWeight) && (
        <section className="section">
          <h2 className="section-label">Mesures</h2>
          <div className="cy-tiles">
            {measures.sleepAvg !== undefined && (
              <Tile
                label="Sommeil moyen"
                value={formatSleep(measures.sleepAvg)}
                hint={`${plural(measures.sleepCount, 'nuit')}${measures.sleepRecent ? ' · 90 derniers jours' : ''}`}
              />
            )}
            {measures.lastBbt && (
              <Tile label="Température" value={formatBbt(measures.lastBbt.bbt!)} hint={`le ${dayMonth(measures.lastBbt.date)}`} />
            )}
            {measures.lastWeight && (
              <Tile label="Poids" value={formatKg(measures.lastWeight.weightKg!)} hint={`le ${dayMonth(measures.lastWeight.date)}`} />
            )}
          </div>
          {measures.bbtCycle.length >= 3 && (
            <div className="cy-card" style={{ marginTop: 8 }}>
              <p className="cy-card__sub" style={{ margin: '0 0 8px' }}>
                Température basale du cycle en cours
              </p>
              <LineChart points={measures.bbtCycle} label="Température basale du cycle en cours" />
            </div>
          )}
        </section>
      )}
    </>
  );
}
