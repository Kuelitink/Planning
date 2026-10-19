/** L'anneau du cycle, façon Clue : un segment par jour, coloré selon la phase. */

import type { ReactNode } from 'react';
import type { DayMark } from '../../core/cycle';
import { addDaysISO } from '../../core/cycle';
import type { ISODate } from '../../core/types';
import { describeMark, dayShort } from './shared';

const SIZE = 340;
const C = SIZE / 2;
const OUTER = 152;
const INNER = 120;

function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

/** Secteur d'anneau entre deux angles (degrés, 0 = 3 h, sens horaire). */
function sector(a0: number, a1: number): string {
  const [x0, y0] = polar(OUTER, a0);
  const [x1, y1] = polar(OUTER, a1);
  const [x2, y2] = polar(INNER, a1);
  const [x3, y3] = polar(INNER, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  const f = (n: number) => n.toFixed(2);
  return `M${f(x0)} ${f(y0)}A${OUTER} ${OUTER} 0 ${large} 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${INNER} ${INNER} 0 ${large} 0 ${f(x3)} ${f(y3)}Z`;
}

function segmentColor(mark: DayMark | undefined, past: boolean): string {
  if (mark?.period === 'logged') return 'var(--cy-period)';
  if (mark?.period === 'predicted') return 'var(--cy-period-soft)';
  if (mark?.ovulation) return 'var(--cy-fertile)';
  if (mark?.fertile) return 'var(--cy-fertile-soft)';
  if (mark?.pms) return 'var(--cy-pms-soft)';
  return past ? 'var(--cy-past)' : 'var(--cy-future)';
}

export function CycleRing({
  start,
  length,
  today,
  marks,
  onPick,
  children,
}: {
  /** Premier jour du cycle affiché (absent : anneau vide). */
  start?: ISODate;
  length: number;
  today: ISODate;
  marks: Map<ISODate, DayMark>;
  onPick: (date: ISODate) => void;
  children: ReactNode;
}) {
  const step = 360 / length;
  const gap = Math.min(1.6, step * 0.18);
  const days = Array.from({ length }, (_, i) => (start ? addDaysISO(start, i) : undefined));
  const todayIndex = start ? days.indexOf(today) : -1;

  return (
    <div className="cy-ring">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label="Jours du cycle">
        {days.map((date, i) => {
          const a0 = -90 + i * step + gap / 2;
          const a1 = a0 + step - gap;
          const mark = date ? marks.get(date) : undefined;
          const past = date !== undefined && date < today;
          const pickable = date !== undefined && date <= today;
          const label = date ? `${dayShort(date)} — ${describeMark(mark, date > today) || `Jour ${i + 1}`}` : undefined;
          return (
            <path
              key={i}
              d={sector(a0, a1)}
              style={{ fill: segmentColor(mark, past), stroke: 'var(--ink)', strokeWidth: 1.2, strokeLinejoin: 'round' }}
              className={pickable ? 'cy-ring__seg' : undefined}
              role={pickable ? 'button' : undefined}
              tabIndex={pickable ? 0 : undefined}
              aria-label={pickable ? `Noter le ${label}` : label}
              onClick={pickable ? () => onPick(date!) : undefined}
              onKeyDown={
                pickable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onPick(date!);
                      }
                    }
                  : undefined
              }
            >
              {label && <title>{label}</title>}
            </path>
          );
        })}
        {days.map((date, i) => {
          if (!date || !marks.get(date)?.logged) return null;
          const [x, y] = polar(INNER - 9, -90 + (i + 0.5) * step);
          return <circle key={`l${i}`} cx={x} cy={y} r={2.6} style={{ fill: 'var(--muted)' }} aria-hidden="true" />;
        })}
        {todayIndex >= 0 &&
          (() => {
            const a0 = -90 + todayIndex * step + gap / 2;
            const [x, y] = polar(OUTER + 11, -90 + (todayIndex + 0.5) * step);
            return (
              <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
                <path
                  d={sector(a0, a0 + step - gap)}
                  style={{ fill: 'none', stroke: 'var(--ink)', strokeWidth: 3, strokeLinejoin: 'round' }}
                />
                <circle cx={x} cy={y} r={6.5} style={{ fill: 'var(--pop)', stroke: 'var(--ink)', strokeWidth: 1.5 }} />
              </g>
            );
          })()}
      </svg>
      <div className="cy-ring__center">{children}</div>
    </div>
  );
}
