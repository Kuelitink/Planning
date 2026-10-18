/** Feuille « Ajouter » : tâche ou événement. */

import { useNav } from '../state/nav';
import { Sheet } from '../ui/kit';
import { IconCalendar, IconChecklist } from '../ui/icons';
import '../modes/calendar.css';

export function AddSheet({ date, onClose }: { date?: Date; onClose: () => void }) {
  const { openSheet } = useNav();
  return (
    <Sheet title="Ajouter" onClose={onClose}>
      <div className="add-choices">
        <button type="button" onClick={() => openSheet({ kind: 'task', defaults: {} })}>
          <IconChecklist size={28} />
          Tâche
        </button>
        <button type="button" onClick={() => openSheet({ kind: 'event', date })}>
          <IconCalendar size={28} />
          Événement
        </button>
      </div>
    </Sheet>
  );
}
