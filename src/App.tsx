import { StoreProvider, useStore } from './state/store';
import { NavProvider, useNav } from './state/nav';
import { ModeMenu, ToastView } from './ui/kit';
import { CalendarMode } from './modes/CalendarMode';
import { ChecklistMode } from './modes/ChecklistMode';
import { ListsMode } from './modes/ListsMode';
import { GoalsMode } from './modes/GoalsMode';
import { ChronoMode } from './modes/ChronoMode';
import { SettingsMode } from './modes/SettingsMode';
import { CycleMode } from './modes/CycleMode';
import { TaskSheet } from './sheets/TaskSheet';
import { EventSheet } from './sheets/EventSheet';
import { AddSheet } from './sheets/AddSheet';
import { ProjectSheet } from './sheets/ProjectSheet';
import { GoalPickSheet } from './sheets/GoalPickSheet';
import { WindowSheet } from './sheets/WindowSheet';
import { CycleDaySheet } from './sheets/CycleDaySheet';
import { CycleSheet } from './sheets/CycleSheet';
import { CycleSettingsSheet } from './sheets/CycleSettingsSheet';
import { CycleImportSheet } from './sheets/CycleImportSheet';
import { CycleInsightSheet } from './sheets/CycleInsightSheet';
import { CycleExportSheet } from './sheets/CycleExportSheet';
import { useCycleNotifications } from './state/cycle';

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
    case 'cycle':
      return <CycleMode />;
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
    case 'cycleDay':
      return <CycleDaySheet key={sheet.date} date={sheet.date} onClose={closeSheet} />;
    case 'cycle':
      return <CycleSheet key={sheet.start} start={sheet.start} onClose={closeSheet} />;
    case 'cycleInsight':
      return <CycleInsightSheet key={sheet.topic} topic={sheet.topic} onClose={closeSheet} />;
    case 'cycleSettings':
      return <CycleSettingsSheet onClose={closeSheet} />;
    case 'cycleImport':
      return <CycleImportSheet onClose={closeSheet} />;
    case 'cycleExport':
      return <CycleExportSheet onClose={closeSheet} />;
  }
}

/** Rappels du cycle en notification (si permis), même hors de l'onglet Cycle. */
function CycleNotifications() {
  useCycleNotifications();
  return null;
}

function Shell() {
  const { ready } = useStore();
  if (!ready) return <main className="app" aria-busy="true" />;
  return (
    <>
      <main className="app">
        <CurrentMode />
      </main>
      <ModeMenu />
      <CurrentSheet />
      <ToastView />
      <CycleNotifications />
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
