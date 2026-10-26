/**
 * Modèle de données de l'application.
 *
 * Conventions :
 * - Les dates-heures sont des chaînes ISO 8601 (`2026-10-19T09:30:00.000Z`,
 *   ou sans décalage = heure locale). Les dates seules sont au format `YYYY-MM-DD`
 *   et s'entendent en heure locale.
 * - Chaque entité porte `id`, `createdAt` et `updatedAt` pour permettre une
 *   synchronisation multi-appareils plus tard (le plus récent `updatedAt` gagne).
 */

export type ID = string;
/** Date-heure ISO 8601. */
export type ISODateTime = string;
/** Date locale `YYYY-MM-DD`. */
export type ISODate = string;
/** Heure locale `HH:MM` (`24:00` autorisé en fin de plage). */
export type HHMM = string;

export interface Entity {
  id: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Une liste / un projet, façon FlowSavvy. */
export interface Project extends Entity {
  name: string;
  color: string;
  /** Horaires appliqués par défaut aux tâches de la liste. */
  defaultWindowId?: ID;
  archived: boolean;
  order: number;
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = dimanche (comme Date#getDay)

export interface WindowRule {
  weekday: Weekday;
  start: HHMM;
  /** Si `end <= start`, la plage déborde sur le lendemain (ex. 22:00 → 02:00). */
  end: HHMM;
}

/** Des « horaires » nommés : Bureau (lun–ven 9h–18h), Matin, Soir… */
export interface TimeWindow extends Entity {
  name: string;
  rules: WindowRule[];
  /** Périodes spéciales (vacances…) qui remplacent les règles habituelles certains jours. */
  overrides?: WindowOverride[];
}

/** Règles d'une fenêtre pendant une période spéciale, prioritaires sur les règles habituelles. */
export interface WindowOverride {
  /** Même identifiant pour toutes les fenêtres d'une même période spéciale. */
  periodId: ID;
  name: string;
  /** Premier et dernier jour inclus. */
  from: ISODate;
  to: ISODate;
  /** Plages pendant la période ; vide = aucun créneau (horaires fermés). */
  rules: WindowRule[];
}

/** 1 = urgente, 2 = haute, 3 = normale, 4 = basse. */
export type Priority = 1 | 2 | 3 | 4;
export type TaskStatus = 'todo' | 'done';

export interface TimeRange {
  start: ISODateTime;
  end: ISODateTime;
}

export interface Task extends Entity {
  title: string;
  projectId?: ID;
  priority: Priority;
  /** Durée estimée, en minutes. */
  durationMin: number;
  /** Échéance. Une date seule (`YYYY-MM-DD`) vaut « avant la fin de ce jour ». */
  deadline?: ISODateTime | ISODate;
  /** Ne pas planifier avant. Une date seule vaut « à partir de minuit ». */
  earliestStart?: ISODateTime | ISODate;
  /** Tâches qui doivent être terminées avant celle-ci. */
  dependsOn: ID[];
  /** Horaires de la tâche ; sinon ceux de la liste, sinon ceux des réglages. */
  windowId?: ID;
  /** La tâche peut être découpée en plusieurs morceaux. */
  splittable: boolean;
  /** Taille minimale d'un morceau quand la tâche est découpée. */
  minChunkMin: number;
  status: TaskStatus;
  doneAt?: ISODateTime;
  notes?: string;
  /** Créneau fixé à la main : le planificateur ne le déplace pas. */
  pinned?: TimeRange;
  /**
   * Sous-tâche de cette tâche (un seul niveau). Une tâche qui a des sous-tâches à faire
   * n'est pas planifiée elle-même : ses sous-tâches le sont, avec son échéance et sa priorité.
   */
  parentId?: ID;
  /** Rang parmi les sous-tâches de la même tâche (plus petit = plus haut). */
  order?: number;
}

export interface Recurrence {
  freq: 'weekly';
  /** Jours de la semaine concernés (vide = le jour de la première occurrence). */
  weekdays: Weekday[];
  /** Dernier jour inclus. */
  until?: ISODate;
}

/** Un événement prévu, fixe : il bloque le temps. */
export interface CalendarEvent extends Entity {
  title: string;
  start: ISODateTime;
  end: ISODateTime;
  /** Les événements « journée entière » ne bloquent pas de temps. */
  allDay?: boolean;
  recurrence?: Recurrence;
}

export type GoalPeriod = 'day' | 'week' | 'month';

export interface Goal extends Entity {
  title: string;
  period: GoalPeriod;
  /** Début de la période : le jour, le lundi de la semaine ou le 1er du mois. */
  periodStart: ISODate;
  /** Tâches de la checklist de la période, dans l'ordre (en haut = la plus urgente). */
  taskIds: ID[];
  /** Objectif chiffré (ex. « courir 3 fois »). */
  target?: number;
  /** Progression saisie à la main pour un objectif chiffré. */
  progress?: number;
  done: boolean;
}

/** Une session de chrono. `end` absent = chrono en cours (un seul à la fois). */
export interface TimeEntry extends Entity {
  taskId?: ID;
  start: ISODateTime;
  end?: ISODateTime;
  /** Session de minuteur : secondes restantes au départ (elle s'arrête d'elle-même à zéro). */
  countdownSec?: number;
}

/** Intensité des règles, comme dans Clue. */
export type Flow = 'light' | 'medium' | 'heavy' | 'very_heavy';

/**
 * Ce qui a été noté un jour dans le mode Cycle : règles, symptômes, mesures.
 * Un seul enregistrement par jour : l'identifiant est la date.
 */
export interface CycleDay extends Entity {
  date: ISODate;
  /** Règles ce jour-là (le spotting est une catégorie à part, qui ne démarre pas de cycle). */
  flow?: Flow;
  /** Options notées par catégorie (`{ pain: ['period_cramps'], tags: ['voyage'] }`), clés au format Clue. */
  options: Record<string, string[]>;
  /** Intensité d'une option notée (douleurs), par clé `catégorie.option` : `mild`, `moderate`, `severe`… */
  severity?: Record<string, string>;
  /** Durée de sommeil, en minutes. */
  sleepMin?: number;
  /** Température basale, en °C. */
  bbt?: number;
  weightKg?: number;
  note?: string;
}

/** Annotation d'un cycle, repéré par son premier jour de règles (identifiant = cette date). */
export interface CycleMark extends Entity {
  startDate: ISODate;
  /** Cycle ignoré par les prédictions et les moyennes (maladie, stress, oubli de saisie…). */
  excluded: boolean;
  note?: string;
}

export interface CycleSettings {
  /** Durées utilisées tant que l'historique ne suffit pas pour les calculer. */
  cycleLength: number;
  periodLength: number;
  /** Jours de SPM affichés avant les règles prévues. */
  pmsDays: number;
  showFertile: boolean;
  showOvulation: boolean;
  showPms: boolean;
  /** Catégories proposées dans la saisie du jour, dans l'ordre. */
  categories: string[];
  /** Étiquettes perso (catégorie `tags`). */
  customTags: string[];
  /** Rappel N jours avant les règles prévues (0 = désactivé). */
  remindPeriodDays: number;
  remindPms: boolean;
  remindFertile: boolean;
  /** Rappel de saisie du jour à partir de cette heure (absent = désactivé). */
  checkInTime?: HHMM;
  /** Rappels aussi en notification du téléphone (quand l'app est ouverte). */
  notify: boolean;
  /** Règles (notées et prévues) visibles dans le mode Calendrier. */
  onCalendar: boolean;
  /** Auto-planification : alléger les journées en phase lutéale et pendant les règles (voir `cycleLoad.ts`). */
  adaptLoad: boolean;
}

export interface Settings {
  /** Horaires par défaut ; absent = `dayStart`–`dayEnd` tous les jours. */
  defaultWindowId?: ID;
  dayStart: HHMM;
  dayEnd: HHMM;
  /** Pas de planification, en minutes (les tâches démarrent sur cette grille). */
  granularityMin: number;
  /** Nombre de jours planifiés à partir d'aujourd'hui. */
  horizonDays: number;
  weekStartsOn: 0 | 1;
  /** Marge laissée autour de chaque tâche et événement, en minutes. */
  bufferMin: number;
  /** Réglages du mode Cycle (complétés par `DEFAULT_CYCLE_SETTINGS`). */
  cycle?: Partial<CycleSettings>;
  updatedAt?: ISODateTime;
}

export const DEFAULT_SETTINGS: Settings = {
  dayStart: '08:00',
  dayEnd: '20:00',
  granularityMin: 15,
  horizonDays: 14,
  weekStartsOn: 1,
  bufferMin: 0,
};
