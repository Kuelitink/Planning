/**
 * Mode Chrono : deux écrans côte à côte, chrono et minuteur (glisser vers la droite pour le
 * minuteur ; les points en bas montrent l'écran affiché). En haut, la tâche dans son
 * encadré blanc avec le temps déjà passé dessus ; au milieu, un cercle avec le temps, le
 * statut, play/pause et « Terminer » ; dessous, « Changer de tâche ».
 *
 * Chaque arrêt (pause, fin, changement de tâche, minuteur à zéro) enregistre la session :
 * le temps passé s'ajoute à la tâche.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ID } from '../core/types';
import { countdownLeft, formatClock } from '../core/timer';
import { MINUTE, formatDuration, parseDateTime } from '../core/time';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { setCountdown, useCountdown } from '../state/countdown';
import { Dot, Header, useNow } from '../ui/kit';
import { IconCheck, IconPause, IconPlay } from '../ui/icons';
import { toneOf } from '../ui/palette';
import { TaskSwitchSheet } from '../sheets/TaskSwitchSheet';
import './chrono.css';

type Page = 'timer' | 'chrono';

/** Durées proposées pour le minuteur, en minutes. */
const PRESETS = [5, 10, 15, 25, 45, 60];
/** Périmètre du cercle (rayon 46 dans une boîte de 100). */
const ARC = 2 * Math.PI * 46;

const TASK_KEY = 'planning.chronoTask';
/** Temps du chrono déjà fait sur la tâche depuis qu'on l'a choisie (pauses comprises). */
const SITTING_KEY = 'planning.chronoSitting';

interface Sitting {
  taskId?: ID;
  ms: number;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* préférence non retenue */
  }
}

const minutesOf = (ms: number) => Math.floor(ms / MINUTE);

export function ChronoMode() {
  const { active, lastTimedTaskId, tasks, projects, startTimer, pauseTimer, setTaskDone, timeSpent } = useStore();
  const { showToast } = useNav();
  const now = useNow(1000);
  const countdown = useCountdown();
  const [switching, setSwitching] = useState(false);
  const [chosen, setChosenState] = useState<ID | undefined>(() => readJSON<ID | null>(TASK_KEY, null) ?? undefined);
  const [sitting, setSittingState] = useState<Sitting>(() => readJSON<Sitting>(SITTING_KEY, { ms: 0 }));

  const running = active && active.countdownSec === undefined ? active : undefined;
  const counting = active && active.countdownSec !== undefined ? active : undefined;

  const setChosen = (id: ID | undefined) => {
    setChosenState(id);
    writeJSON(TASK_KEY, id ?? null);
  };
  const setSitting = (s: Sitting) => {
    setSittingState(s);
    writeJSON(SITTING_KEY, s);
  };

  // Tâche affichée : celle qui tourne, sinon celle choisie, sinon la dernière chronométrée.
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const todo = (id?: ID) => {
    const t = id ? byId.get(id) : undefined;
    return t && t.status === 'todo' ? t : undefined;
  };
  const task = active ? (active.taskId ? byId.get(active.taskId) : undefined) : (todo(chosen) ?? todo(lastTimedTaskId));
  const color = toneOf(projects.find((p) => p.id === task?.projectId)?.color).dot;
  const spentMin = task ? minutesOf(timeSpent(task.id, now)) : 0;

  const sessionMs = active ? now.getTime() - parseDateTime(active.start).getTime() : 0;
  const sittingMs = (sitting.taskId === task?.id ? sitting.ms : 0) + (running ? sessionMs : 0);
  const left = counting ? (countdownLeft(counting, now) ?? 0) : countdown.leftSec;

  const added = (ms: number, title?: string) =>
    showToast({
      message: !title
        ? 'Chrono arrêté'
        : ms < MINUTE
          ? `Session enregistrée sur « ${title} »`
          : `${formatDuration(minutesOf(ms))} ajoutées à « ${title} »`,
    });

  // --- Chrono ---------------------------------------------------------------------
  const toggleChrono = () => {
    if (running) {
      pauseTimer();
      setSitting({ taskId: task?.id, ms: sittingMs });
      added(sessionMs, task?.title);
      return;
    }
    if (counting) pauseCountdown(false);
    if (sitting.taskId !== task?.id) setSitting({ taskId: task?.id, ms: 0 });
    startTimer(task?.id);
  };

  // --- Minuteur -------------------------------------------------------------------
  function pauseCountdown(notify = true) {
    if (!counting) return;
    pauseTimer();
    setCountdown({ leftSec: Math.max(0, left) });
    if (notify) added(sessionMs, task?.title);
  }
  const toggleCountdown = () => {
    if (counting) return pauseCountdown();
    const start = countdown.done || countdown.leftSec <= 0 ? countdown.durationSec : countdown.leftSec;
    setCountdown({ leftSec: start, done: false });
    startTimer(task?.id, start);
  };
  const pickDuration = (min: number) => {
    pauseCountdown(false);
    setCountdown({ durationSec: min * 60, leftSec: min * 60, done: false });
  };
  const cancelCountdown = () => {
    if (counting) {
      pauseTimer();
      added(sessionMs, task?.title);
    }
    setCountdown({ leftSec: countdown.durationSec, done: false });
  };

  // --- Terminer la tâche, changer de tâche -------------------------------------------
  const finish = () => {
    if (active) pauseTimer();
    if (counting) setCountdown({ leftSec: countdown.durationSec, done: false });
    setSitting({ ms: 0 });
    if (task) {
      setTaskDone(task.id, true);
      showToast({ message: 'Tâche terminée', action: { label: 'Annuler', run: () => setTaskDone(task.id, false) } });
      setChosen(undefined);
    } else showToast({ message: 'Chrono arrêté' });
  };

  const pick = (id: ID) => {
    setSwitching(false);
    setChosen(id);
    setSitting({ taskId: id, ms: 0 });
    if (!active) return;
    // Ça tournait : la session s'arrête sur l'ancienne tâche et continue sur la nouvelle.
    added(sessionMs, task?.title);
    if (counting) {
      setCountdown({ leftSec: left });
      startTimer(id, left);
    } else startTimer(id);
  };

  // --- Écrans : minuteur à gauche, chrono à droite ------------------------------------
  const pager = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<Page>(() => (counting ? 'timer' : 'chrono'));
  const showPage = (p: Page, smooth = true) => {
    const el = pager.current;
    if (!el) return;
    el.scrollTo({ left: p === 'timer' ? 0 : el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  };
  useLayoutEffect(() => showPage(page, false), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = pager.current;
    if (!el) return;
    const keep = new ResizeObserver(() => showPage(page, false));
    keep.observe(el);
    return () => keep.disconnect();
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = () => {
    const el = pager.current;
    if (!el) return;
    const p: Page = el.scrollLeft < el.clientWidth / 2 ? 'timer' : 'chrono';
    if (p !== page) setPage(p);
  };

  const card = (
    <div className="chrono-card">
      <span className="chrono-card__title">
        {task && <Dot color={color} />}
        <span>{task ? task.title : active ? 'Sans tâche' : 'Choisis une tâche'}</span>
      </span>
      {task && (
        <span className="chrono-card__meta">
          <span>Temps passé</span>
          <b>{formatDuration(spentMin)}</b>
        </span>
      )}
    </div>
  );

  const switchButton = (
    <button type="button" className="chrono-switch" onClick={() => setSwitching(true)}>
      <span aria-hidden="true">⇄</span>
      <span>Changer de tâche</span>
    </button>
  );

  const status = (kind: 'run' | 'done' | '', text: string) => (
    <span className={kind ? `chrono-status chrono-status--${kind}` : 'chrono-status'}>
      <span className="chrono-status__led" aria-hidden="true" />
      <span>{text}</span>
    </span>
  );

  const playButton = (on: boolean, onClick: () => void, label: string) => (
    <button type="button" className={on ? 'chrono-play chrono-play--on' : 'chrono-play'} aria-label={label} onClick={onClick}>
      {on ? <IconPause size={28} /> : <IconPlay size={28} />}
    </button>
  );

  const dial = (ratio: number, children: ReactNode) => (
    <div className="chrono-dial">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" className="chrono-dial__track" />
        <circle cx="50" cy="50" r="46" className="chrono-dial__arc" strokeDasharray={ARC} strokeDashoffset={ARC * (1 - ratio)} />
        <circle cx="50" cy="50" r="48.6" className="chrono-dial__rim" />
      </svg>
      <div className="chrono-dial__inner">{children}</div>
    </div>
  );

  const chronoText = formatClock(sittingMs);
  const leftClock = formatClock(Math.ceil(left) * 1000);

  return (
    <>
      <Header right={null} />

      <div ref={pager} className="chrono-pager" onScroll={onScroll}>
        <section className="chrono-page" aria-label="Minuteur">
          {card}
          {dial(
            countdown.durationSec ? Math.max(0, left) / countdown.durationSec : 0,
            <>
              <div className="chrono-clock" role="timer">
                {left >= 3600 ? leftClock : leftClock.slice(3)}
              </div>
              {counting
                ? status('run', 'En cours')
                : countdown.done
                  ? status('done', 'Terminé')
                  : status('', countdown.leftSec < countdown.durationSec ? 'En pause' : 'Prêt')}
              <div className="chrono-dial__controls">
                {playButton(Boolean(counting), toggleCountdown, counting ? 'Mettre le minuteur en pause' : 'Démarrer le minuteur')}
                <button type="button" className="chrono-done" onClick={finish} disabled={!task && !active}>
                  <IconCheck size={18} />
                  <span>Terminer</span>
                </button>
              </div>
            </>,
          )}
          {switchButton}
          <div className="chrono-presets" role="group" aria-label="Durée du minuteur">
            {PRESETS.map((m) => (
              <button key={m} type="button" aria-pressed={countdown.durationSec === m * 60} onClick={() => pickDuration(m)}>
                {m} min
              </button>
            ))}
          </div>
          <button type="button" className="link-btn chrono-cancel" onClick={cancelCountdown}>
            Annuler le minuteur
          </button>
        </section>

        <section className="chrono-page" aria-label="Chrono">
          {card}
          {dial(
            (sittingMs % (60 * MINUTE)) / (60 * MINUTE),
            <>
              <div className={running || sittingMs ? 'chrono-clock' : 'chrono-clock chrono-clock--idle'} role="timer">
                {chronoText}
              </div>
              {running ? status('run', 'En cours') : status('', sittingMs ? 'En pause' : 'Prêt')}
              <div className="chrono-dial__controls">
                {playButton(Boolean(running), toggleChrono, running ? 'Mettre en pause' : 'Démarrer le chrono')}
                <button type="button" className="chrono-done" onClick={finish} disabled={!task && !active}>
                  <IconCheck size={18} />
                  <span>Terminer</span>
                </button>
              </div>
            </>,
          )}
          {switchButton}
        </section>
      </div>

      <div className="chrono-dots" role="group" aria-label="Écran">
        {(['timer', 'chrono'] as const).map((p) => (
          <button key={p} type="button" aria-current={page === p} aria-label={p === 'chrono' ? 'Chrono' : 'Minuteur'} onClick={() => showPage(p)}>
            <span />
          </button>
        ))}
      </div>

      {switching && <TaskSwitchSheet currentId={task?.id} onPick={pick} onClose={() => setSwitching(false)} />}
    </>
  );
}
