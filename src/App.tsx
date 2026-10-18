import { useEffect } from 'react';
import { StoreProvider, useStore } from './state/store';
import { NavProvider, useNav, type Mode } from './state/nav';
import { ModeMenu, ToastView } from './ui/kit';
import { CalendarMode } from './modes/CalendarMode';
import { ChecklistMode } from './modes/ChecklistMode';
import { ListsMode } from './modes/ListsMode';
import { GoalsMode } from './modes/GoalsMode';
import { ChronoMode } from './modes/ChronoMode';
import { SettingsMode } from './modes/SettingsMode';
import { TaskSheet } from './sheets/TaskSheet';
import { EventSheet } from './sheets/EventSheet';
import { AddSheet } from './sheets/AddSheet';
import { ProjectSheet } from './sheets/ProjectSheet';
import { GoalPickSheet } from './sheets/GoalPickSheet';
import { WindowSheet } from './sheets/WindowSheet';

function CurrentMode() {
  const { mode } = useNav();
  switch (mode) {
    case 'calendar':
      return <CalendarMode />;
    case 'checklist':
      return <ChecklistMode />;
    case 'lists':
      return <ListsMode />;
    case 'goals':
      return <GoalsMode />;
    case 'chrono':
      return <ChronoMode />;
    case 'settings':
      return <SettingsMode />;
  }
}

function CurrentSheet() {
  const { sheet, closeSheet } = useNav();
  if (!sheet) return null;
  switch (sheet.kind) {
    case 'task':
      return <TaskSheet key={sheet.id ?? 'new'} id={sheet.id} defaults={sheet.defaults} onClose={closeSheet} />;
    case 'event':
      return <EventSheet key={sheet.id ?? 'new'} id={sheet.id} date={sheet.date} onClose={closeSheet} />;
    case 'add':
      return <AddSheet date={sheet.date} onClose={closeSheet} />;
    case 'project':
      return <ProjectSheet key={sheet.id ?? 'new'} id={sheet.id} onClose={closeSheet} />;
    case 'goalPick':
      return <GoalPickSheet period={sheet.period} periodStart={sheet.periodStart} onClose={closeSheet} />;
    case 'window':
      return <WindowSheet key={sheet.id ?? 'new'} id={sheet.id} onClose={closeSheet} />;
  }
}

/**
 * DA de la page : « Trait fin » (ui/da-trait-fin.css) sur le Calendrier pour l'instant,
 * « Blocs couleur » (ui/theme.css) ailleurs.
 */
function useDA(mode: Mode) {
  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'calendar') root.dataset.da = 'trait-fin';
    else delete root.dataset.da;
    // Barre du navigateur / de l'app installée : même fond que la page.
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  }, [mode]);
}

function Shell() {
  const { ready } = useStore();
  const { mode } = useNav();
  useDA(mode);
  if (!ready) return <main className="app" aria-busy="true" />;
  return (
    <>
      <main className="app">
        <CurrentMode />
      </main>
      <ModeMenu />
      <CurrentSheet />
      <ToastView />
    </>
  );
}

export function App() {
  return (
    <StoreProvider>
      <NavProvider>
        <Shell />
      </NavProvider>
    </StoreProvider>
  );
}
