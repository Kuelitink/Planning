/** Navigation : mode affiché, modes visibles, menu des modes, feuilles du bas, toasts. */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { GoalPeriod, ID, ISODate, Task } from '../core/types';

export type Mode = 'calendar' | 'checklist' | 'lists' | 'goals' | 'chrono' | 'settings';

/** Modes proposés dans le menu, dans l'ordre (les réglages sont toujours accessibles). */
export const MODES: Exclude<Mode, 'settings'>[] = ['calendar', 'checklist', 'lists', 'goals', 'chrono'];

export const MODE_LABEL: Record<Mode, string> = {
  calendar: 'Calendrier',
  checklist: 'Checklist',
  lists: 'Listes',
  goals: 'Objectifs',
  chrono: 'Chrono',
  settings: 'Réglages',
};

export type SheetState =
  | { kind: 'task'; id?: ID; defaults?: Partial<Task> }
  | { kind: 'event'; id?: ID; date?: Date }
  | { kind: 'project'; id?: ID }
  /** Choisir les tâches des objectifs d'une période. */
  | { kind: 'goalPick'; period: GoalPeriod; periodStart: ISODate }
  | { kind: 'window'; id?: ID }
  /** Choix « Tâche ou événement ? » depuis le bouton + du calendrier. */
  | { kind: 'add'; date?: Date };

export interface Toast {
  message: string;
  action?: { label: string; run: () => void };
}

export interface Nav {
  mode: Mode;
  setMode(mode: Mode): void;
  visibleModes: Mode[];
  setVisibleModes(modes: Mode[]): void;
  menuOpen: boolean;
  setMenuOpen(open: boolean): void;
  sheet: SheetState | null;
  openSheet(sheet: SheetState): void;
  closeSheet(): void;
  toast: Toast | null;
  showToast(toast: Toast): void;
  /** Liste ouverte dans le mode Listes (null = vue d'ensemble). */
  openListId: ID | null;
  setOpenListId(id: ID | null): void;
}

const MODE_KEY = 'planning.mode';
const VISIBLE_KEY = 'planning.visibleModes';

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible : préférence non retenue */
  }
}

const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error('useNav hors de <NavProvider>');
  return n;
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [visibleModes, setVisibleState] = useState<Mode[]>(() => {
    const saved = readStorage<Mode[]>(VISIBLE_KEY, MODES);
    const valid = saved.filter((m) => (MODES as Mode[]).includes(m));
    return valid.length ? valid : MODES;
  });
  const [mode, setModeState] = useState<Mode>(() => {
    const saved = readStorage<Mode>(MODE_KEY, 'checklist');
    return saved === 'settings' || visibleModes.includes(saved) ? saved : visibleModes[0];
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [openListId, setOpenListId] = useState<ID | null>(null);
  const toastTimer = useRef<number>();

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    setMenuOpen(false);
    writeStorage(MODE_KEY, m);
    window.scrollTo(0, 0);
  }, []);

  const setVisibleModes = useCallback((modes: Mode[]) => {
    const ordered = MODES.filter((m) => modes.includes(m));
    if (!ordered.length) return;
    setVisibleState(ordered);
    writeStorage(VISIBLE_KEY, ordered);
  }, []);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const value: Nav = {
    mode,
    setMode,
    visibleModes,
    setVisibleModes,
    menuOpen,
    setMenuOpen,
    sheet,
    openSheet: setSheet,
    closeSheet: useCallback(() => setSheet(null), []),
    toast,
    showToast,
    openListId,
    setOpenListId,
  };
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}
