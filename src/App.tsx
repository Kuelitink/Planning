import { useMemo } from 'react';
import { schedule } from './core/scheduler';
import { dayPlan } from './core/daily';
import { DEFAULT_SETTINGS } from './core/types';
import { formatDuration, formatHM } from './core/time';
import { sampleEvents, sampleNow, sampleProjects, sampleTasks, sampleWindows } from './sample';

/** Écran provisoire : l'interface définitive suivra le choix de direction artistique. */
export function App() {
  const plan = useMemo(() => {
    const result = schedule({
      tasks: sampleTasks,
      events: sampleEvents,
      windows: sampleWindows,
      projects: sampleProjects,
      settings: DEFAULT_SETTINGS,
      now: sampleNow,
    });
    return dayPlan(result, sampleTasks, sampleEvents, sampleNow, { windows: sampleWindows, settings: DEFAULT_SETTINGS });
  }, []);

  const colorOf = (projectId?: string) => sampleProjects.find((p) => p.id === projectId)?.color ?? '#6B7280';

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 480, margin: '0 auto', padding: 16, color: '#14161a' }}>
      <h1 style={{ fontSize: 24, margin: '8px 0 4px' }}>Planning — en construction</h1>
      <p style={{ margin: '0 0 16px', color: '#5b616e' }}>
        Exemple d'auto-planification du lundi 19 octobre : {formatDuration(plan.totals.taskMin)} de tâches,{' '}
        {formatDuration(plan.totals.eventMin)} d'événements, {formatDuration(plan.totals.freeMin)} libres.
      </p>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {plan.items.map((item) => (
          <li
            key={`${item.kind}-${item.kind === 'task' ? item.taskId : item.eventId}-${item.start.getTime()}`}
            style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}
          >
            <span style={{ fontVariantNumeric: 'tabular-nums', color: '#5b616e', minWidth: 96 }}>
              {formatHM(item.start)}–{formatHM(item.end)}
            </span>
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                flex: 'none',
                background: item.kind === 'task' ? colorOf(item.projectId) : 'transparent',
                border: item.kind === 'event' ? '1px dashed #9aa1ae' : 'none',
              }}
            />
            <span>{item.title}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}
