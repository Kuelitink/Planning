/** Mode Objectifs : objectifs du jour, de la semaine ou du mois, avec accès direct au chrono. */

import { useState, type CSSProperties } from 'react';
import type { Goal, GoalPeriod, ID } from '../core/types';
import { goalProgress, goalTasks, periodEnd, periodStartFor } from '../core/goals';
import { addDays, parseISODate } from '../core/time';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { Dot, Header, PlayButton } from '../ui/kit';
import { IconCheck, IconChevronDown, IconChevronLeft, IconChevronRight, IconPlus } from '../ui/icons';
import { formatDayMonth, formatMonth, formatRelativeDay, isoWeek } from '../ui/format';
import { toneOf } from '../ui/palette';

const PERIOD_KEY = 'planning.goalsPeriod';

export const PERIOD_OPTIONS: { value: GoalPeriod; label: string }[] = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
];

function readPeriod(): GoalPeriod {
  try {
    const saved = localStorage.getItem(PERIOD_KEY);
    if (saved === 'day' || saved === 'week' || saved === 'month') return saved;
  } catch {
    /* stockage indisponible */
  }
  return 'week';
}

function writePeriod(p: GoalPeriod) {
  try {
    localStorage.setItem(PERIOD_KEY, p);
  } catch {
    /* préférence non retenue */
  }
}

/** Date décalée d'une période (jour, semaine, mois). */
function shift(date: Date, period: GoalPeriod, n: number): Date {
  if (period === 'day') return addDays(date, n);
  if (period === 'week') return addDays(date, 7 * n);
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

/** « Aujourd'hui », « Semaine 43 · 19–25 oct. », « Octobre 2026 ». */
export function periodLabel(period: GoalPeriod, periodStart: string, now = new Date()): string {
  const start = parseISODate(periodStart);
  if (period === 'day') return formatRelativeDay(start, now);
  if (period === 'month') return formatMonth(start);
  const end = addDays(periodEnd(period, periodStart), -1);
  const range =
    start.getMonth() === end.getMonth()
      ? `${start.getDate()}–${formatDayMonth(end)}`
      : `${formatDayMonth(start)} – ${formatDayMonth(end)}`;
  return `Semaine ${isoWeek(start)} · ${range}`;
}

/** Sélecteur de période pleine largeur (pilule blanche, actif en noir). */
export function PeriodPicker({ value, onChange }: { value: GoalPeriod; onChange: (p: GoalPeriod) => void }) {
  return (
    <div
      role="group"
      aria-label="Période"
      style={{
        height: 48,
        padding: 4,
        background: 'var(--card)',
        borderRadius: 999,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 4,
      }}
    >
      {PERIOD_OPTIONS.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            style={{
              border: 'none',
              borderRadius: 999,
              background: on ? 'var(--primary)' : 'transparent',
              color: on ? '#fff' : 'var(--muted)',
              fontSize: 15,
              fontWeight: on ? 600 : 500,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ProgressBar({ ratio, complete, max, now }: { ratio: number; complete: boolean; max: number; now: number }) {
  return (
    <div
      role="progressbar"
      aria-label="Progression"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={now}
      style={{ height: 6, borderRadius: 999, background: 'var(--soft)', overflow: 'hidden' }}
    >
      <div
        style={{
          width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`,
          height: '100%',
          borderRadius: 999,
          background: complete ? '#1F9E6B' : 'var(--ink)',
        }}
      />
    </div>
  );
}

const linkStyle: CSSProperties = {
  minHeight: 44,
  padding: '0 4px',
  border: 'none',
  background: 'transparent',
  color: 'var(--muted)',
  fontSize: 14,
  fontWeight: 500,
  textDecoration: 'underline',
  textUnderlineOffset: 3,
};

const stepStyle: CSSProperties = {
  width: 44,
  height: 44,
  border: '1px solid var(--line)',
  borderRadius: 999,
  background: 'var(--card)',
  fontSize: 20,
  fontWeight: 600,
};

function GoalCard({ goal, expanded, onToggle }: { goal: Goal; expanded: boolean; onToggle: () => void }) {
  const { tasks, projects, saveGoal } = useStore();
  const { openSheet } = useNav();
  const progress = goalProgress(goal, tasks);
  const linked = goalTasks(goal, tasks);
  const colorOf = (projectId?: ID) => toneOf(projects.find((p) => p.id === projectId)?.color).dot;
  const hasTarget = goal.target !== undefined && goal.target > 0;
  const bodyId = `goal-${goal.id}`;

  const setProgress = (value: number) => {
    const target = goal.target ?? 0;
    saveGoal({ ...goal, progress: Math.max(0, Math.min(target, value)) });
  };

  return (
    <div className="card" style={{ padding: expanded ? '14px 18px 8px' : '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={onToggle}
        style={{
          minHeight: 44,
          margin: '0 -8px 0 0',
          padding: 0,
          border: 'none',
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textAlign: 'left',
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 17,
            fontWeight: 600,
            color: progress.complete ? 'var(--muted)' : 'var(--ink)',
          }}
        >
          {goal.title}
        </span>
        {progress.complete && (
          <span style={{ color: '#1F9E6B', display: 'inline-flex' }} aria-label="Atteint">
            <IconCheck size={18} />
          </span>
        )}
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>
          {progress.done}/{progress.total}
        </span>
        <span
          aria-hidden="true"
          style={{
            width: 36,
            height: 36,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
            transform: expanded ? 'rotate(180deg)' : undefined,
          }}
        >
          <IconChevronDown size={20} />
        </span>
      </button>

      <ProgressBar ratio={progress.ratio} complete={progress.complete} max={progress.total} now={progress.done} />

      {expanded && (
        <div id={bodyId} style={{ display: 'flex', flexDirection: 'column' }}>
          {hasTarget && (
            <div style={{ minHeight: 60, display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid var(--line)' }}>
              <span style={{ flex: 1, fontSize: 15, color: 'var(--muted)' }}>Fait</span>
              <button type="button" style={stepStyle} aria-label="Retirer 1" onClick={() => setProgress(progress.done - 1)}>
                −
              </button>
              <span style={{ minWidth: 48, textAlign: 'center', fontSize: 16, fontWeight: 600 }}>
                {progress.done} / {goal.target}
              </span>
              <button type="button" style={stepStyle} aria-label="Ajouter 1" onClick={() => setProgress(progress.done + 1)}>
                +
              </button>
            </div>
          )}

          {linked.map((t) => (
            <div key={t.id} style={{ minHeight: 56, display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid var(--line)' }}>
              <Dot color={colorOf(t.projectId)} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 15,
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: t.status === 'done' ? 'var(--faint)' : 'var(--ink)',
                  textDecoration: t.status === 'done' ? 'line-through' : undefined,
                }}
              >
                {t.title}
              </span>
              {t.status === 'todo' ? (
                <PlayButton taskId={t.id} title={t.title} />
              ) : (
                <span style={{ width: 40, display: 'inline-flex', justifyContent: 'center', color: '#1F9E6B' }} aria-label="Faite">
                  <IconCheck size={18} />
                </span>
              )}
            </div>
          ))}

          {!linked.length && !hasTarget && (
            <p style={{ margin: 0, padding: '14px 0', borderTop: '1px solid var(--line)', fontSize: 14, color: 'var(--muted)' }}>
              Aucune tâche liée.
            </p>
          )}

          <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--line)', paddingTop: 2 }}>
            <button type="button" style={linkStyle} onClick={() => openSheet({ kind: 'goal', id: goal.id })}>
              Lier des tâches
            </button>
            <button type="button" style={linkStyle} onClick={() => openSheet({ kind: 'goal', id: goal.id })}>
              Modifier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function GoalsMode() {
  const { goals, settings } = useStore();
  const { openSheet } = useNav();
  const [period, setPeriodState] = useState<GoalPeriod>(readPeriod);
  const [anchor, setAnchor] = useState(() => new Date());
  /** `undefined` = premier objectif déplié par défaut ; `null` = tout replié. */
  const [expanded, setExpanded] = useState<ID | null | undefined>(undefined);

  const now = new Date();
  const periodStart = periodStartFor(period, anchor, settings.weekStartsOn);
  const isCurrent = periodStart === periodStartFor(period, now, settings.weekStartsOn);
  const list = goals
    .filter((g) => g.period === period && g.periodStart === periodStart)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const openId = expanded === undefined ? list[0]?.id : expanded;

  const setPeriod = (p: GoalPeriod) => {
    setPeriodState(p);
    writePeriod(p);
    setExpanded(undefined);
  };
  const move = (n: number) => {
    setAnchor((d) => shift(d, period, n));
    setExpanded(undefined);
  };

  return (
    <>
      <Header />
      <PeriodPicker value={period} onChange={setPeriod} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0 12px' }}>
        <button type="button" className="icon-btn" aria-label="Période précédente" onClick={() => move(-1)}>
          <IconChevronLeft />
        </button>
        <button
          type="button"
          onClick={() => {
            setAnchor(new Date());
            setExpanded(undefined);
          }}
          disabled={isCurrent}
          aria-label={isCurrent ? undefined : 'Revenir à la période en cours'}
          style={{
            minHeight: 44,
            padding: '0 12px',
            border: 'none',
            background: 'transparent',
            fontSize: 15,
            fontWeight: 600,
            color: isCurrent ? 'var(--ink)' : 'var(--muted)',
            cursor: isCurrent ? 'default' : 'pointer',
          }}
        >
          {periodLabel(period, periodStart, now)}
        </button>
        <button type="button" className="icon-btn" aria-label="Période suivante" onClick={() => move(1)}>
          <IconChevronRight />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((g) => (
          <GoalCard key={g.id} goal={g} expanded={g.id === openId} onToggle={() => setExpanded(g.id === openId ? null : g.id)} />
        ))}
        {!list.length && <p className="empty">Aucun objectif pour cette période.</p>}
        <button
          type="button"
          onClick={() => openSheet({ kind: 'goal', period, periodStart })}
          style={{
            alignSelf: 'flex-start',
            height: 48,
            padding: '0 8px',
            border: 'none',
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          <IconPlus />
          <span>Objectif</span>
        </button>
      </div>
    </>
  );
}
