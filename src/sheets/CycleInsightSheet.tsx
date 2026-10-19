/** Feuille d'une analyse détaillée du mode Cycle (durée, règles, douleurs, humeur, sommeil, température). */

import type { InsightTopic } from '../state/nav';
import { Sheet } from '../ui/kit';
import { INSIGHT_TITLE, InsightDetail } from '../modes/cycle/insights';
import '../modes/cycle.css';

export function CycleInsightSheet({ topic, onClose }: { topic: InsightTopic; onClose: () => void }) {
  return (
    <Sheet title={INSIGHT_TITLE[topic]} onClose={onClose}>
      <InsightDetail topic={topic} />
      <div className="sheet__actions">
        <button type="button" className="btn btn--secondary btn--block" onClick={onClose}>
          Fermer
        </button>
      </div>
    </Sheet>
  );
}
