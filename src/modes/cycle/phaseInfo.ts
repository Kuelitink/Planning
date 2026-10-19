/**
 * Ce qui se passe à chaque phase du cycle (comme les « Cycle Phase Insights » de Clue).
 * Informations générales, pas un avis médical : chaque corps est différent.
 */

import type { Phase } from '../../core/cycle';
import type { DayPhase } from '../../core/insights';

export interface PhaseInfo {
  /** Hormones et ce que fait le corps. */
  body: string;
  /** Ce qui est souvent ressenti. */
  feel: string;
  tip: string;
}

export const PHASE_INFO: Record<Exclude<Phase, 'ovulation'>, PhaseInfo> = {
  period: {
    body: "Les œstrogènes et la progestérone sont au plus bas : la muqueuse de l'utérus s'élimine, ce sont les règles.",
    feel: 'Crampes, fatigue, baisse d’énergie ou besoin de calme sont fréquents, surtout les premiers jours.',
    tip: 'Chaleur sur le ventre, mouvement doux et hydratation peuvent soulager les crampes.',
  },
  follicular: {
    body: 'Les œstrogènes remontent pendant que des follicules mûrissent dans les ovaires ; la muqueuse de l’utérus s’épaissit.',
    feel: "L'énergie, la motivation et l'humeur ont souvent tendance à remonter.",
    tip: 'Une bonne période pour les projets qui demandent de l’élan.',
  },
  fertile: {
    body: "Les œstrogènes atteignent leur pic, puis l'hormone LH déclenche l'ovulation : l'ovule vit environ 24 heures. Une grossesse est possible pendant ces jours.",
    feel: "Les pertes peuvent devenir claires et élastiques (blanc d'œuf) ; certaines personnes sentent une douleur d'un côté du bas-ventre.",
    tip: 'Ces dates sont des estimations : elles ne remplacent pas une contraception.',
  },
  luteal: {
    body: "Après l'ovulation, le corps jaune produit de la progestérone : la température basale monte légèrement.",
    feel: 'Fatigue, seins sensibles, ballonnements ou besoin de sommeil peuvent apparaître.',
    tip: 'Un rythme plus régulier (sommeil, repas) aide souvent à mieux passer cette phase.',
  },
  pms: {
    body: 'Sans grossesse, la progestérone et les œstrogènes chutent dans les jours qui précèdent les règles.',
    feel: 'Irritabilité, sensibilité, envies alimentaires, maux de tête ou crampes sont courants.',
    tip: 'Noter ces jours-là aide à repérer ce qui revient d’un cycle à l’autre.',
  },
  late: {
    body: 'Les règles se font attendre. Stress, maladie, voyage, changement de rythme ou d’alimentation peuvent décaler un cycle, tout comme une grossesse.',
    feel: 'Un retard isolé de quelques jours est fréquent.',
    tip: 'En cas de doute, un test de grossesse lève l’incertitude ; si les retards se répètent, parles-en à un ou une professionnelle de santé.',
  },
};

/** Phase du jour → phase des jours passés, pour comparer avec l'historique. */
export function historyPhase(phase: Phase): DayPhase {
  if (phase === 'ovulation') return 'fertile';
  if (phase === 'late') return 'pms';
  return phase;
}

/** « pendant les règles », « en phase lutéale »… */
export const DAY_PHASE_IN: Record<DayPhase, string> = {
  period: 'pendant les règles',
  follicular: 'en phase folliculaire',
  fertile: 'pendant la fenêtre fertile',
  luteal: 'en phase lutéale',
  pms: 'pendant le SPM',
};

export const DAY_PHASE_LABEL: Record<DayPhase, string> = {
  period: 'Règles',
  follicular: 'Folliculaire',
  fertile: 'Fenêtre fertile',
  luteal: 'Lutéale',
  pms: 'SPM',
};
