/**
 * Minuteur : durée choisie, temps restant quand il est en pause, et « terminé ».
 *
 * La session en cours est une `TimeEntry` avec `countdownSec` (voir core/timer.ts) ; ce petit
 * état, propre à l'appareil, garde le reste entre deux sessions. `useCountdownWatcher` arrête
 * le minuteur à zéro, même quand l'écran Chrono n'est pas affiché.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { countdownEnd } from '../core/timer';
import { MINUTE, formatDuration } from '../core/time';
import { useStore } from './store';
import { useNav } from './nav';

export interface CountdownState {
  /** Durée choisie, en secondes. */
  durationSec: number;
  /** Secondes restantes quand le minuteur ne tourne pas. */
  leftSec: number;
  /** Arrivé à zéro (jusqu'au prochain départ ou changement de durée). */
  done: boolean;
}

const KEY = 'planning.countdown';
const DEFAULT: CountdownState = { durationSec: 25 * 60, leftSec: 25 * 60, done: false };

function read(): CountdownState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<CountdownState> | null;
    if (saved && saved.durationSec && saved.durationSec > 0) return { ...DEFAULT, ...saved };
  } catch {
    /* stockage indisponible */
  }
  return DEFAULT;
}

let state: CountdownState = read();
const listeners = new Set<() => void>();

export function getCountdown(): CountdownState {
  return state;
}

export function setCountdown(changes: Partial<CountdownState>): void {
  state = { ...state, ...changes };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* préférence non retenue */
  }
  listeners.forEach((l) => l());
}

export function useCountdown(): CountdownState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getCountdown,
  );
}

/** Arrête le minuteur en cours quand il arrive à zéro (à l'heure exacte), et prévient. */
export function useCountdownWatcher(): void {
  const { active, tasks, pauseTimer } = useStore();
  const { showToast } = useNav();
  useEffect(() => {
    const end = active ? countdownEnd(active) : undefined;
    if (!active || !end) return;
    const finish = () => {
      if (Date.now() < end.getTime()) return;
      pauseTimer(end);
      setCountdown({ leftSec: 0, done: true });
      const title = tasks.find((t) => t.id === active.taskId)?.title;
      const spent = formatDuration(Math.round((active.countdownSec ?? 0) / 60));
      showToast({ message: title ? `Minuteur fini · ${spent} sur « ${title} »` : 'Minuteur fini' });
      navigator.vibrate?.([200, 100, 200]);
    };
    const timer = window.setTimeout(finish, Math.max(0, end.getTime() - Date.now()) + 50);
    const onVisible = () => document.visibilityState === 'visible' && finish();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active, tasks, pauseTimer, showToast]);
}

/** Minutes entières d'une durée en secondes (pour les messages). */
export const secToMin = (sec: number) => Math.floor((sec * 1000) / MINUTE);
