/** Mode Chrono : le chronomètre seul, et de quoi changer de tâche vite. */

import { useState } from 'react';
import type { ID, Task } from '../core/types';
import { currentGoals } from '../core/goals';
import { entryDuration, totalForDay, totalForWeek } from '../core/timer';
import { MINUTE, formatDuration, formatHM, isSameDay, parseDateTime } from '../core/time';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { Dot, Header, PlayButton, useNow, useTimerClock } from '../ui/kit';
import { IconCheck, IconChevronDown, IconPause, IconPlay } from '../ui/icons';
import { toneOf } from '../ui/palette';

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function TaskRow({ task, color, first }: { task: Task; color: string; first: boolean }) {
  return (
    <div style={{ minHeight: 60, display: 'flex', alignItems: 'center', gap: 12, borderTop: first ? 'none' : '1px solid var(--line)' }}>
      <Dot color={color} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {task.title}
      </span>
      <PlayButton taskId={task.id} title={task.title} />
    </div>
  );
}

const toggleStyle = {
  height: 48,
  padding: '0 4px',
  border: 'none',
  background: 'transparent',
  color: 'var(--muted)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 15,
  fontWeight: 600,
} as const;

export function ChronoMode() {
  const { active, lastTimedTaskId, tasks, projects, goals, plan, timeEntries, settings, startTimer, pauseTimer, finishTimer } = useStore();
  const { showToast } = useNav();
  const clock = useTimerClock(true);
  const now = useNow(30_000);
  const [showAll, setShowAll] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [filter, setFilter] = useState('');

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const colorOf = (projectId?: ID) => toneOf(projects.find((p) => p.id === projectId)?.color).dot;

  const activeTask = active?.taskId ? byId.get(active.taskId) : undefined;
  const pausedTask = !active && lastTimedTaskId ? byId.get(lastTimedTaskId) : undefined;
  const resumable = pausedTask && pausedTask.status === 'todo' ? pausedTask : undefined;
  const shownTask = activeTask ?? resumable;

  const todayMin = Math.floor(totalForDay(timeEntries, now, now) / MINUTE);
  const weekMin = Math.floor(totalForWeek(timeEntries, now, now, settings.weekStartsOn) / MINUTE);

  // Suggestions : tâches des objectifs en cours, puis tâches planifiées aujourd'hui.
  const suggestions: Task[] = [];
  const seen = new Set<ID>(active?.taskId ? [active.taskId] : []);
  const add = (t: Task | undefined) => {
    if (!t || t.status !== 'todo' || seen.has(t.id) || suggestions.length >= 6) return;
    seen.add(t.id);
    suggestions.push(t);
  };
  for (const g of [...currentGoals(goals, 'day', now, settings.weekStartsOn), ...currentGoals(goals, 'week', now, settings.weekStartsOn)]) {
    if (!g.done) g.taskIds.forEach((tid) => add(byId.get(tid)));
  }
  for (const b of [...plan.blocks].sort((a, b2) => a.start.getTime() - b2.start.getTime())) {
    if (isSameDay(b.start, now)) add(byId.get(b.taskId));
  }

  const q = fold(filter.trim());
  const allTodo = tasks
    .filter((t) => t.status === 'todo' && t.id !== active?.taskId && (!q || fold(t.title).includes(q)))
    .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, 'fr'));

  const todaySessions = timeEntries
    .filter((e) => isSameDay(parseDateTime(e.start), now))
    .sort((a, b) => b.start.localeCompare(a.start));

  const finish = () => {
    const title = activeTask?.title;
    finishTimer();
    showToast({ message: title ? 'Tâche terminée' : 'Chrono arrêté' });
  };

  const bigButton = (bg: string) => ({
    width: 88,
    height: 88,
    border: 'none',
    borderRadius: '50%',
    background: bg,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  return (
    <>
      <Header right={null} />

      <div style={{ textAlign: 'center', marginTop: 32 }}>
        <div
          role="timer"
          aria-live="off"
          style={{
            fontSize: 68,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            color: clock ? 'var(--ink)' : 'var(--faint)',
          }}
        >
          {clock ?? '00:00:00'}
        </div>
        <div
          style={{
            marginTop: 14,
            minHeight: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 17,
            fontWeight: 500,
            color: active ? 'var(--ink)' : 'var(--muted)',
          }}
        >
          {shownTask && <Dot color={colorOf(shownTask.projectId)} />}
          <span>
            {active ? (activeTask?.title ?? 'Sans tâche') : resumable ? `En pause · ${resumable.title}` : 'Choisis une tâche ci-dessous'}
          </span>
        </div>
      </div>

      <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        {active ? (
          <>
            <button type="button" aria-label="Pause" onClick={pauseTimer} style={bigButton('var(--accent)')}>
              <IconPause size={32} />
            </button>
            <button type="button" className="pill" style={{ height: 56, padding: '0 22px' }} onClick={finish}>
              <IconCheck />
              <span>Terminer</span>
            </button>
          </>
        ) : resumable ? (
          <button
            type="button"
            aria-label={`Reprendre « ${resumable.title} »`}
            onClick={() => startTimer(resumable.id)}
            style={bigButton('var(--primary)')}
          >
            <IconPlay size={32} />
          </button>
        ) : (
          <button type="button" aria-label="Démarrer un chrono sans tâche" onClick={() => startTimer()} style={bigButton('var(--primary)')}>
            <IconPlay size={32} />
          </button>
        )}
      </div>

      <p style={{ margin: '24px 0 0', textAlign: 'center', fontSize: 15, color: 'var(--muted)' }}>
        Aujourd'hui {formatDuration(todayMin)} · Semaine {formatDuration(weekMin)}
      </p>

      <section className="section" style={{ marginTop: 40 }}>
        <h2 style={{ margin: '0 0 10px 4px', fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>Changer de tâche</h2>
        {suggestions.length > 0 ? (
          <div className="card" style={{ padding: '0 8px 0 18px' }}>
            {suggestions.map((t, i) => (
              <TaskRow key={t.id} task={t} color={colorOf(t.projectId)} first={i === 0} />
            ))}
          </div>
        ) : (
          <p style={{ margin: '0 0 0 4px', fontSize: 14, color: 'var(--muted)' }}>
            Les tâches de tes objectifs et de ta journée apparaîtront ici.
          </p>
        )}

        <button type="button" style={{ ...toggleStyle, marginTop: 8 }} aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
          <span style={{ display: 'inline-flex', transform: showAll ? 'rotate(180deg)' : undefined }}>
            <IconChevronDown size={18} />
          </span>
          <span>Toutes les tâches</span>
        </button>
        {showAll && (
          <>
            <label htmlFor="chrono-filter" className="sr-only">
              Filtrer les tâches
            </label>
            <input
              id="chrono-filter"
              className="text-input"
              type="search"
              placeholder="Filtrer…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            {allTodo.length > 0 ? (
              <div className="card" style={{ padding: '0 8px 0 18px' }}>
                {allTodo.slice(0, 60).map((t, i) => (
                  <TaskRow key={t.id} task={t} color={colorOf(t.projectId)} first={i === 0} />
                ))}
              </div>
            ) : (
              <p style={{ margin: '4px 0 0 4px', fontSize: 14, color: 'var(--muted)' }}>Aucune tâche.</p>
            )}
          </>
        )}
      </section>

      {todaySessions.length > 0 && (
        <section style={{ marginTop: 8 }}>
          <button type="button" style={toggleStyle} aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            <span style={{ display: 'inline-flex', transform: showHistory ? 'rotate(180deg)' : undefined }}>
              <IconChevronDown size={18} />
            </span>
            <span>Historique ({todaySessions.length})</span>
          </button>
          {showHistory && (
            <ul style={{ listStyle: 'none', margin: 0, padding: '0 4px' }}>
              {todaySessions.map((e) => {
                const task = e.taskId ? byId.get(e.taskId) : undefined;
                const start = parseDateTime(e.start);
                return (
                  <li
                    key={e.id}
                    style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}
                  >
                    <span style={{ minWidth: 92 }}>
                      {formatHM(start)}–{e.end ? formatHM(parseDateTime(e.end)) : 'en cours'}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {task?.title ?? 'Sans tâche'}
                    </span>
                    <span>{formatDuration(Math.floor(entryDuration(e, now) / MINUTE))}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
