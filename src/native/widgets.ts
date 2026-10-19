/**
 * Widgets de l'appli Android (écran d'accueil) : « Aujourd'hui » (la journée et ses cases à cocher)
 * et « Prochaine tâche ». Ils sont dessinés par le code Android (`android/…/widget/`) à partir d'un
 * instantané que l'appli leur envoie à chaque changement : les éléments des 7 prochains jours,
 * pour rester justes même si l'appli n'est pas rouverte de la journée.
 *
 * Dans l'autre sens, une case cochée ou un appui sur un widget est mis en file côté Android
 * (`WidgetAction`) et appliqué par l'appli à son prochain passage au premier plan.
 */

import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { CalendarEvent, ID, ISODate, Project, Settings, Task, TimeWindow } from '../core/types';
import type { ScheduleResult } from '../core/scheduler';
import { dayPlan } from '../core/daily';
import { addDays, startOfDay } from '../core/time';
import { NEUTRAL_TONE, PRIORITY_COLOR } from '../ui/palette';

export const SNAPSHOT_DAYS = 7;

export interface WidgetItem {
  kind: 'task' | 'event';
  /** Identifiant de la tâche ou de l'événement. */
  id: ID;
  title: string;
  /** Début et fin, en ms depuis 1970. */
  start: number;
  end: number;
  allDay: boolean;
  /** Pastille de la liste (`#RRGGBB`), tâches seulement. */
  color?: string;
  /** Contour de la case : la priorité. */
  ring?: string;
  /** Morceau d'une tâche découpée, « 1/2 ». */
  part?: string;
}

export interface WidgetDay {
  date: ISODate;
  items: WidgetItem[];
  /** Tâches terminées ce jour-là. */
  done: number;
}

export interface WidgetSnapshot {
  version: 1;
  generatedAt: number;
  days: WidgetDay[];
}

export interface SnapshotInput {
  plan: ScheduleResult;
  tasks: Task[];
  events: CalendarEvent[];
  projects: Project[];
  windows: TimeWindow[];
  settings: Settings;
}

/** Instantané des `SNAPSHOT_DAYS` jours à partir d'aujourd'hui. */
export function buildSnapshot(input: SnapshotInput, now: Date): WidgetSnapshot {
  const colors = new Map(input.projects.map((p) => [p.id, p.color]));
  const byId = new Map(input.tasks.map((t) => [t.id, t]));
  const days: WidgetDay[] = [];
  for (let i = 0; i < SNAPSHOT_DAYS; i++) {
    const day = dayPlan(input.plan, input.tasks, input.events, addDays(startOfDay(now), i), {
      windows: input.windows,
      settings: input.settings,
    });
    const items = day.items.flatMap((item): WidgetItem[] => {
      if (item.kind === 'event') {
        return [
          { kind: 'event', id: item.eventId, title: item.title, start: item.start.getTime(), end: item.end.getTime(), allDay: item.allDay },
        ];
      }
      if (byId.get(item.taskId)?.status !== 'todo') return [];
      return [
        {
          kind: 'task',
          id: item.taskId,
          title: item.title,
          start: item.start.getTime(),
          end: item.end.getTime(),
          allDay: false,
          color: (item.projectId && colors.get(item.projectId)) || NEUTRAL_TONE.dot,
          ring: PRIORITY_COLOR[item.priority],
          part: item.part && `${item.part.index}/${item.part.count}`,
        },
      ];
    });
    days.push({ date: day.date, items, done: day.done.length });
  }
  return { version: 1, generatedAt: now.getTime(), days };
}

export type WidgetAction =
  /** Case cochée (ou décochée) sur un widget. */
  | { type: 'done'; id: ID; done: boolean; at: number }
  /** Appui sur une ligne : ouvrir la fiche. */
  | { type: 'open'; kind: 'task' | 'event'; id: ID }
  /** Bouton + : nouvelle tâche. */
  | { type: 'add' }
  /** Appui sur le titre : la checklist du jour. */
  | { type: 'today' };

interface PlanningWidgetsPlugin {
  /** Enregistre l'instantané et redessine les widgets. */
  setSnapshot(options: { json: string }): Promise<void>;
  /** Actions faites sur les widgets depuis le dernier appel (et vide la file). */
  takeActions(): Promise<{ actions: WidgetAction[] }>;
  /** Prévient qu'une action attend (widget touché pendant que l'appli tourne). */
  addListener(event: 'actions', listener: () => void): Promise<PluginListenerHandle>;
}

export const PlanningWidgets = registerPlugin<PlanningWidgetsPlugin>('PlanningWidgets');
