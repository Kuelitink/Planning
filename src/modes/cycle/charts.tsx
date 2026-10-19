/**
 * Petits graphiques SVG des analyses du cycle. Barres de 24 px au plus, extrémité arrondie
 * (4 px) côté données et carrée côté base, 2 px de fond entre segments empilés, lignes de 2 px,
 * grille en filet discret. Toucher une barre ou un point affiche sa valeur dans la légende
 * au-dessus du graphique.
 */

import { useState, type ReactNode } from 'react';

const SURFACE = 'var(--card)';
const GRID = 'var(--line)';
const TEXT = 'var(--muted)';
/** Étiquette posée sur le graphique : un liseré de fond la garde lisible au-dessus des barres. */
const HALO = {
  fontSize: 10,
  fontWeight: 700,
  fill: TEXT,
  paintOrder: 'stroke',
  stroke: SURFACE,
  strokeWidth: 4,
  strokeLinejoin: 'round',
} as const;

/** Colonne arrondie en haut, carrée en bas. */
function columnPath(x: number, top: number, w: number, base: number, r = 4): string {
  const h = base - top;
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x} ${base}V${top + rr}Q${x} ${top} ${x + rr} ${top}H${x + w - rr}Q${x + w} ${top} ${x + w} ${top + rr}V${base}Z`;
}

/** Légende d'un graphique : le détail de l'élément touché, sinon le résumé. */
function Caption({ children }: { children: ReactNode }) {
  return (
    <p className="cy-chart__caption" aria-live="polite">
      {children}
    </p>
  );
}

export interface Column {
  label: string;
  /** Segments empilés, de bas en haut (une seule valeur pour une colonne simple). */
  parts: { value: number; color: string }[];
  /** Texte affiché quand on touche la colonne. */
  tip: string;
  muted?: boolean;
}

/** Colonnes simples ou empilées, avec une ligne de référence facultative (moyenne). */
export function ColumnChart({
  columns,
  max,
  summary,
  reference,
  label,
  height = 150,
  labelEvery = 1,
}: {
  columns: Column[];
  max?: number;
  summary: ReactNode;
  reference?: { value: number; label: string };
  label: string;
  height?: number;
  /** N'afficher qu'une étiquette d'axe sur n. */
  labelEvery?: number;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const W = 320;
  const top = 14;
  const bottom = 20;
  const base = height - bottom;
  const total = (c: Column) => c.parts.reduce((s, p) => s + p.value, 0);
  const top0 = max ?? Math.max(1, ...columns.map(total), reference?.value ?? 0);
  const y = (v: number) => base - ((base - top) * v) / top0;
  const slot = W / Math.max(columns.length, 1);
  const bw = Math.min(24, slot * 0.7);

  return (
    <div>
      <Caption>{selected !== null ? columns[selected].tip : summary}</Caption>
      <svg className="cy-chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
        <line x1={0} x2={W} y1={base + 0.5} y2={base + 0.5} style={{ stroke: GRID, strokeWidth: 1 }} />
        {columns.map((c, i) => {
          const x = i * slot + (slot - bw) / 2;
          let acc = 0;
          const n = c.parts.filter((p) => p.value > 0).length;
          let k = 0;
          return (
            <g
              key={i}
              role="button"
              tabIndex={0}
              aria-label={c.tip}
              style={{ cursor: 'pointer', opacity: selected !== null && selected !== i ? 0.45 : c.muted ? 0.5 : 1 }}
              onClick={() => setSelected(selected === i ? null : i)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelected(selected === i ? null : i))}
            >
              <rect x={i * slot} y={top} width={slot} height={base - top} style={{ fill: 'transparent' }} />
              {c.parts.map((p, j) => {
                if (p.value <= 0) return null;
                const from = y(acc);
                acc += p.value;
                const last = ++k === n;
                // 2 px de fond entre segments empilés.
                const to = y(acc) + (last ? 0 : 2);
                return last ? (
                  <path key={j} d={columnPath(x, to, bw, from)} style={{ fill: p.color }} />
                ) : (
                  <rect key={j} x={x} y={to} width={bw} height={Math.max(0, from - to)} style={{ fill: p.color }} />
                );
              })}
              {i % labelEvery === 0 && (
                <text x={x + bw / 2} y={height - 6} textAnchor="middle" style={{ fontSize: 10, fontWeight: 600, fill: TEXT }}>
                  {c.label}
                </text>
              )}
            </g>
          );
        })}
        {reference && (
          <g>
            <line
              x1={0}
              x2={W}
              y1={y(reference.value)}
              y2={y(reference.value)}
              style={{ stroke: 'var(--ink)', strokeWidth: 1, opacity: 0.5 }}
            />
            <text x={W} y={y(reference.value) - 4} textAnchor="end" style={HALO}>
              {reference.label}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

/** Barres horizontales (une couleur), valeur à droite. */
export function BarList({ rows, color }: { rows: { label: ReactNode; value: number; text: string }[]; color: string }) {
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  return (
    <div className="cy-bars">
      {rows.map((r, i) => (
        <div key={i} className="cy-bars__row">
          <span className="cy-bars__label">{r.label}</span>
          <span className="cy-bars__track">
            <span style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </span>
          <span className="cy-bars__value">{r.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Courbe (température basale…) par jour du cycle, avec une ligne de base et un repère vertical facultatifs. */
export function LineChart({
  points,
  color,
  summary,
  label,
  format,
  baseline,
  marker,
  xMax,
}: {
  points: { x: number; y: number; tip: string }[];
  color: string;
  summary: ReactNode;
  label: string;
  format: (v: number) => string;
  baseline?: { value: number; label: string };
  marker?: { x: number; label: string };
  xMax?: number;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const W = 320;
  const H = 160;
  const pad = { l: 34, r: 8, t: 14, b: 20 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y).concat(baseline ? [baseline.value] : []);
  const x0 = 1;
  const x1 = Math.max(xMax ?? 0, ...xs, 2);
  const y0 = Math.min(...ys) - 0.1;
  const y1 = Math.max(...ys) + 0.1;
  const px = (x: number) => pad.l + ((W - pad.l - pad.r) * (x - x0)) / (x1 - x0);
  const py = (v: number) => pad.t + ((H - pad.t - pad.b) * (y1 - v)) / (y1 - y0);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join('');
  const ticks = [y0 + 0.1, (y0 + y1) / 2, y1 - 0.1];

  return (
    <div>
      <Caption>{selected !== null ? points[selected].tip : summary}</Caption>
      <svg className="cy-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={py(t)} y2={py(t)} style={{ stroke: GRID, strokeWidth: 1 }} />
            <text x={pad.l - 4} y={py(t) + 3} textAnchor="end" style={{ fontSize: 9, fontWeight: 600, fill: TEXT }}>
              {format(t)}
            </text>
          </g>
        ))}
        {[1, Math.round(x1 / 2), x1].map((t) => (
          <text key={t} x={px(t)} y={H - 6} textAnchor="middle" style={{ fontSize: 10, fontWeight: 600, fill: TEXT }}>
            J{t}
          </text>
        ))}
        {baseline && (
          <g>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={py(baseline.value)}
              y2={py(baseline.value)}
              style={{ stroke: 'var(--ink)', strokeWidth: 1, opacity: 0.5 }}
            />
            <text x={W - pad.r} y={py(baseline.value) - 4} textAnchor="end" style={HALO}>
              {baseline.label}
            </text>
          </g>
        )}
        {marker && (
          <g>
            <line x1={px(marker.x)} x2={px(marker.x)} y1={pad.t} y2={H - pad.b} style={{ stroke: 'var(--cy-fertile)', strokeWidth: 1.5 }} />
            <text x={px(marker.x) + 4} y={pad.t + 8} style={HALO}>
              {marker.label}
            </text>
          </g>
        )}
        <path d={d} style={{ fill: 'none', stroke: color, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' }} />
        {points.map((p, i) => (
          <circle
            key={p.x}
            cx={px(p.x)}
            cy={py(p.y)}
            r={selected === i ? 6 : 4}
            role="button"
            tabIndex={0}
            aria-label={p.tip}
            style={{ fill: color, stroke: SURFACE, strokeWidth: 2, cursor: 'pointer' }}
            onClick={() => setSelected(selected === i ? null : i)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelected(selected === i ? null : i))}
          />
        ))}
      </svg>
    </div>
  );
}

/** Légende des couleurs d'un graphique à plusieurs séries. */
export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="cy-legend" style={{ justifyContent: 'flex-start', marginTop: 4 }}>
      {items.map((i) => (
        <li key={i.label}>
          <span className="cy-swatch" style={{ background: i.color, borderColor: i.color }} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
