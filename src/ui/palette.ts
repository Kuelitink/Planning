import type { Priority } from '../core/types';

/** Teintes des listes : point (couleur stockée), fond pastel des blocs, texte foncé dessus. */
export interface Tone {
  name: string;
  dot: string;
  fill: string;
  ink: string;
}

export const TONES: Tone[] = [
  { name: 'Bleu', dot: '#3D6FE0', fill: '#BBD3FF', ink: '#10295C' },
  { name: 'Violet', dot: '#7A4BD6', fill: '#D9C6FF', ink: '#2E1660' },
  { name: 'Vert', dot: '#1F9E6B', fill: '#B8EBD3', ink: '#0B4A33' },
  { name: 'Orange', dot: '#E07024', fill: '#FFD0AE', ink: '#5C2A07' },
  { name: 'Rose', dot: '#D6457A', fill: '#FFC9DC', ink: '#5C0F2C' },
  { name: 'Jaune', dot: '#B88A00', fill: '#FFE9A3', ink: '#4D3A00' },
  { name: 'Turquoise', dot: '#1595A8', fill: '#B5E8EF', ink: '#073F48' },
  { name: 'Gris', dot: '#7A8290', fill: '#DADDE3', ink: '#2B303A' },
];

export const NEUTRAL_TONE = TONES[TONES.length - 1];

/** Teinte d'une couleur de liste (repli : gris). */
export function toneOf(color: string | undefined): Tone {
  if (!color) return NEUTRAL_TONE;
  const c = color.toLowerCase();
  return TONES.find((t) => t.dot.toLowerCase() === c) ?? NEUTRAL_TONE;
}

/** Contour des cases et sélecteur de priorité (mêmes valeurs que --p1…--p4 du thème). */
export const PRIORITY_COLOR: Record<Priority, string> = {
  1: '#D7263D',
  2: '#E07A00',
  3: '#8A4D66',
  4: '#3D6FE0', // bleu (même teinte que la liste « Bleu »)
};

/** Libellés affichés : la valeur stockée reste 1 (la plus pressante) … 4. */
export const PRIORITY_LABEL: Record<Priority, string> = {
  1: 'ASAP',
  2: 'Haute',
  3: 'Normale',
  4: 'Basse',
};

/** Ordre d'affichage du sélecteur. */
export const PRIORITIES: Priority[] = [1, 2, 3, 4];
