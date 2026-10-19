/**
 * Liens avec Android, actifs seulement dans l'APK : instantané envoyé aux widgets, actions faites
 * sur les widgets (case cochée, ouverture d'une fiche, +), bouton retour du téléphone.
 */

import { useCallback, useEffect, useRef } from 'react';
import { App } from '@capacitor/app';
import { MINUTE, toISODate } from '../core/time';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { useNow } from '../ui/kit';
import { buildSnapshot, PlanningWidgets, type WidgetAction } from './widgets';

/** Attente avant d'envoyer l'instantané (plusieurs modifications de suite = un seul envoi). */
const SNAPSHOT_DELAY = 800;
/** Appli en arrière-plan : nouveau plan (donc widgets à jour) tous les quarts d'heure, tant qu'Android la garde. */
const BACKGROUND_REPLAN = 15 * MINUTE;

export function NativeBridge() {
  const { plan, planAt, tasks, events, projects, windows, settings, setTaskDone, replan } = useStore();
  const nav = useNav();
  const navRef = useRef(nav);
  navRef.current = nav;
  const dayKey = toISODate(useNow(60_000));

  // --- Instantané pour les widgets ------------------------------------------------
  useEffect(() => {
    const id = window.setTimeout(() => {
      const snapshot = buildSnapshot({ plan, tasks, events, projects, windows, settings }, new Date());
      PlanningWidgets.setSnapshot({ json: JSON.stringify(snapshot) }).catch((err) => console.error('Widgets non mis à jour', err));
    }, SNAPSHOT_DELAY);
    return () => window.clearTimeout(id);
    // `planAt` : nouveau calcul du plan ; `dayKey` : changement de jour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, planAt, tasks, events, projects, windows, settings, dayKey]);

  useEffect(() => {
    const id = window.setInterval(() => document.visibilityState === 'hidden' && replan(), BACKGROUND_REPLAN);
    return () => window.clearInterval(id);
  }, [replan]);

  // --- Actions faites sur les widgets ----------------------------------------------
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const apply = useCallback(
    (action: WidgetAction) => {
      const { openSheet, closeSheet, setMode } = navRef.current;
      switch (action.type) {
        case 'done': {
          const task = tasksRef.current.find((t) => t.id === action.id);
          if (task && (task.status === 'done') !== action.done) setTaskDone(action.id, action.done);
          break;
        }
        case 'open':
          openSheet(action.kind === 'task' ? { kind: 'task', id: action.id } : { kind: 'event', id: action.id });
          break;
        case 'add':
          openSheet({ kind: 'task', defaults: {} });
          break;
        case 'today':
          closeSheet();
          setMode('checklist');
          break;
      }
    },
    [setTaskDone],
  );

  const busy = useRef(false);
  const takeActions = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const { actions } = await PlanningWidgets.takeActions();
      actions.forEach(apply);
    } catch (err) {
      console.error('Actions des widgets illisibles', err);
    } finally {
      busy.current = false;
    }
  }, [apply]);

  useEffect(() => {
    void takeActions();
    const listener = PlanningWidgets.addListener('actions', () => void takeActions());
    const onVisible = () => document.visibilityState === 'visible' && void takeActions();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      void listener.then((l) => l.remove());
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [takeActions]);

  // --- Bouton retour : ferme la feuille ou le menu, sinon met l'appli en arrière-plan ---
  useEffect(() => {
    const listener = App.addListener('backButton', () => {
      const { sheet, closeSheet, menuOpen, setMenuOpen } = navRef.current;
      if (sheet) closeSheet();
      else if (menuOpen) setMenuOpen(false);
      else void App.minimizeApp();
    });
    return () => void listener.then((l) => l.remove());
  }, []);

  return null;
}
