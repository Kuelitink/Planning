/**
 * Catégories de suivi du mode Cycle, reprises de Clue : clés et options au format des
 * exports Clue (`measurements.json`), libellés en français. Une option inconnue (import
 * d'une version plus récente de Clue) reste gardée et s'affiche avec un libellé déduit.
 */

import type { CycleSettings, Flow } from './types';

export type CategoryKind = 'options' | 'minutes' | 'bbt' | 'weight' | 'text';

export interface CycleCategory {
  key: string;
  label: string;
  /** Couleur du point de la catégorie. */
  color: string;
  kind: CategoryKind;
  options: { key: string; label: string }[];
}

export const FLOW_OPTIONS: { key: Flow; label: string }[] = [
  { key: 'light', label: 'Léger' },
  { key: 'medium', label: 'Moyen' },
  { key: 'heavy', label: 'Abondant' },
  { key: 'very_heavy', label: 'Très abondant' },
];

export const FLOW_LABEL = Object.fromEntries(FLOW_OPTIONS.map((o) => [o.key, o.label])) as Record<Flow, string>;

export const SEVERITY_OPTIONS = [
  { key: 'mild', label: 'Légère' },
  { key: 'moderate', label: 'Modérée' },
  { key: 'severe', label: 'Forte' },
  { key: 'very_severe', label: 'Très forte' },
];

const opts = (list: [string, string][]) => list.map(([key, label]) => ({ key, label }));

export const PERIOD_COLOR = '#E5484D';
export const FERTILE_COLOR = '#1595A8';
export const PMS_COLOR = '#7A4BD6';

export const CATEGORIES: CycleCategory[] = [
  {
    key: 'spotting',
    label: 'Spotting',
    color: PERIOD_COLOR,
    kind: 'options',
    options: opts([
      ['red', 'Rouge'],
      ['brown', 'Brun'],
    ]),
  },
  {
    key: 'pain',
    label: 'Douleur',
    color: '#D6457A',
    kind: 'options',
    options: opts([
      ['period_cramps', 'Crampes'],
      ['headache', 'Mal de tête'],
      ['migraine', 'Migraine'],
      ['migraine_with_aura', 'Migraine avec aura'],
      ['ovulation', "Douleur d'ovulation"],
      ['breast_tenderness', 'Seins sensibles'],
      ['lower_back', 'Bas du dos'],
      ['leg', 'Jambes'],
      ['joint', 'Articulations'],
      ['vulvar', 'Vulve'],
      ['pain_free', 'Aucune douleur'],
    ]),
  },
  {
    key: 'feelings',
    label: 'Émotions',
    color: '#E07024',
    kind: 'options',
    options: opts([
      ['happy', 'Joie'],
      ['sensitive', 'Sensibilité'],
      ['sad', 'Tristesse'],
      ['angry', 'Colère'],
      ['irritable', 'Irritabilité'],
      ['anxious', 'Anxiété'],
      ['insecure', 'Insécurité'],
      ['mood_swings', "Sautes d'humeur"],
      ['not_in_control', 'Perte de contrôle'],
      ['indifferent', 'Indifférence'],
      ['excited', 'Excitation'],
      ['grateful', 'Gratitude'],
    ]),
  },
  { key: 'pms', label: 'SPM', color: '#7A4BD6', kind: 'options', options: opts([['yes', 'SPM']]) },
  {
    key: 'energy',
    label: 'Énergie',
    color: '#B88A00',
    kind: 'options',
    options: opts([
      ['exhausted', 'Épuisement'],
      ['tired', 'Fatigue'],
      ['low_energy', "Peu d'énergie"],
      ['energetic', 'En forme'],
      ['fully_energized', 'Pleine énergie'],
    ]),
  },
  {
    key: 'mind',
    label: 'Mental',
    color: '#3D6FE0',
    kind: 'options',
    options: opts([
      ['focused', 'Concentration'],
      ['distracted', 'Distraction'],
      ['calm', 'Calme'],
      ['stressed', 'Stress'],
      ['motivated', 'Motivation'],
      ['unmotivated', 'Démotivation'],
      ['productive', 'Productivité'],
      ['unproductive', 'Improductivité'],
      ['brain_fog', 'Brouillard mental'],
    ]),
  },
  { key: 'sleep_duration', label: 'Sommeil', color: '#3D6FE0', kind: 'minutes', options: [] },
  {
    key: 'sleep_quality',
    label: 'Qualité du sommeil',
    color: '#3D6FE0',
    kind: 'options',
    options: opts([
      ['restful', 'Reposant'],
      ['trouble_falling_asleep', 'Endormissement difficile'],
      ['woke_up_tired', 'Réveil fatigué'],
      ['night_sweats', 'Sueurs nocturnes'],
    ]),
  },
  {
    key: 'sex_life',
    label: 'Sexualité',
    color: '#D6457A',
    kind: 'options',
    options: opts([
      ['protected', 'Protégé'],
      ['unprotected', 'Non protégé'],
      ['withdrawal', 'Retrait'],
      ['masturbation', 'Masturbation'],
      ['high_sex_drive', 'Libido forte'],
      ['low_sex_drive', 'Libido faible'],
      ['no_sex_today', 'Pas de rapport'],
      ['painful_intercourse', 'Rapport douloureux'],
      ['no_orgasm', "Pas d'orgasme"],
      ['sex_toys', 'Sextoys'],
    ]),
  },
  {
    key: 'discharge',
    label: 'Pertes',
    color: '#1595A8',
    kind: 'options',
    options: opts([
      ['none', 'Aucune'],
      ['sticky', 'Collantes'],
      ['creamy', 'Crémeuses'],
      ['egg_white', "Blanc d'œuf"],
      ['atypical', 'Atypiques'],
    ]),
  },
  {
    key: 'collection_method',
    label: 'Protection',
    color: PERIOD_COLOR,
    kind: 'options',
    options: opts([
      ['pad', 'Serviette'],
      ['tampon', 'Tampon'],
      ['panty_liner', 'Protège-slip'],
      ['menstrual_cup', 'Coupe menstruelle'],
      ['period_underwear', 'Culotte menstruelle'],
    ]),
  },
  {
    key: 'social_life',
    label: 'Social',
    color: '#1F9E6B',
    kind: 'options',
    options: opts([
      ['sociable', 'Sociable'],
      ['supportive', 'Soutien'],
      ['withdrawn', 'Repli sur soi'],
      ['argumentative', 'Conflit'],
    ]),
  },
  {
    key: 'digestion',
    label: 'Digestion',
    color: '#1F9E6B',
    kind: 'options',
    options: opts([
      ['ok', 'Bonne digestion'],
      ['bloated', 'Ballonnements'],
      ['gassy', 'Gaz'],
      ['nauseous', 'Nausée'],
    ]),
  },
  {
    key: 'stool',
    label: 'Selles',
    color: '#1F9E6B',
    kind: 'options',
    options: opts([
      ['normal', 'Normales'],
      ['constipated', 'Constipation'],
      ['diarrhea', 'Diarrhée'],
    ]),
  },
  {
    key: 'craving',
    label: 'Envies',
    color: '#E07024',
    kind: 'options',
    options: opts([
      ['sweet', 'Sucré'],
      ['salty', 'Salé'],
      ['carbs', 'Féculents'],
      ['chocolate', 'Chocolat'],
    ]),
  },
  {
    key: 'breasts_and_chest',
    label: 'Poitrine',
    color: '#D6457A',
    kind: 'options',
    options: opts([
      ['swollen_breasts', 'Gonflée'],
      ['dense_or_heavy', 'Lourde'],
    ]),
  },
  {
    key: 'skin',
    label: 'Peau',
    color: '#E07024',
    kind: 'options',
    options: opts([
      ['good', 'Belle peau'],
      ['oily', 'Grasse'],
      ['dry', 'Sèche'],
      ['acne', 'Acné'],
    ]),
  },
  {
    key: 'hair',
    label: 'Cheveux',
    color: '#E07024',
    kind: 'options',
    options: opts([
      ['good', 'Beaux'],
      ['bad', 'Ternes'],
      ['oily', 'Gras'],
      ['dry', 'Secs'],
    ]),
  },
  {
    key: 'exercise',
    label: 'Sport',
    color: '#1F9E6B',
    kind: 'options',
    options: opts([
      ['walking', 'Marche'],
      ['running', 'Course'],
      ['cycling', 'Vélo'],
      ['swimming', 'Natation'],
      ['yoga', 'Yoga'],
      ['pilates', 'Pilates'],
      ['team_sports', 'Sport collectif'],
      ['rest_day', 'Repos'],
    ]),
  },
  {
    key: 'partying',
    label: 'Sorties',
    color: '#7A4BD6',
    kind: 'options',
    options: opts([
      ['alcohol', 'Alcool'],
      ['cigarettes', 'Cigarettes'],
      ['hangover', 'Gueule de bois'],
      ['big_night', 'Grosse soirée'],
    ]),
  },
  {
    key: 'medication',
    label: 'Médicaments',
    color: '#586070',
    kind: 'options',
    options: opts([
      ['painkillers', 'Antidouleurs'],
      ['antibiotics', 'Antibiotiques'],
      ['antihistamine', 'Antihistaminiques'],
      ['cold_or_flu_meds', 'Rhume / grippe'],
      ['hormone_therapy', 'Traitement hormonal'],
      ['estrogen_therapy', 'Œstrogènes'],
      ['progesterone_therapy', 'Progestérone'],
    ]),
  },
  {
    key: 'pill',
    label: 'Pilule',
    color: '#586070',
    kind: 'options',
    options: opts([
      ['taken', 'Prise'],
      ['late', 'Prise en retard'],
      ['missed', 'Oubliée'],
      ['double', 'Double prise'],
    ]),
  },
  {
    key: 'iud',
    label: 'Stérilet',
    color: '#586070',
    kind: 'options',
    options: opts([
      ['inserted', 'Posé'],
      ['thread_checked', 'Fils vérifiés'],
      ['removed', 'Retiré'],
    ]),
  },
  {
    key: 'tests',
    label: 'Tests',
    color: '#1595A8',
    kind: 'options',
    options: opts([
      ['ovulation_positive', 'Ovulation +'],
      ['ovulation_negative', 'Ovulation −'],
      ['pregnancy_positive', 'Grossesse +'],
      ['pregnancy_negative', 'Grossesse −'],
    ]),
  },
  {
    key: 'ailments',
    label: 'Maux',
    color: '#586070',
    kind: 'options',
    options: opts([
      ['cold_flu', 'Rhume / grippe'],
      ['allergy', 'Allergie'],
      ['fever', 'Fièvre'],
      ['injury', 'Blessure'],
    ]),
  },
  {
    key: 'appointments',
    label: 'Rendez-vous',
    color: '#586070',
    kind: 'options',
    options: opts([
      ['ob_gyn', 'Gynéco'],
      ['general_check_up', 'Médecin'],
      ['date', 'Rendez-vous amoureux'],
      ['vacation', 'Vacances'],
    ]),
  },
  { key: 'tags', label: 'Étiquettes', color: '#7A8290', kind: 'options', options: [] },
  { key: 'bbt', label: 'Température basale', color: '#D92D20', kind: 'bbt', options: [] },
  { key: 'weight', label: 'Poids', color: '#586070', kind: 'weight', options: [] },
  { key: 'notes', label: 'Notes', color: '#7A8290', kind: 'text', options: [] },
];

export const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

/** Catégories proposées par défaut dans la saisie du jour. */
export const DEFAULT_CATEGORIES = [
  'spotting',
  'pain',
  'feelings',
  'pms',
  'energy',
  'mind',
  'sleep_duration',
  'sex_life',
  'discharge',
  'collection_method',
  'tags',
  'notes',
];

export const DEFAULT_CYCLE_SETTINGS: CycleSettings = {
  cycleLength: 28,
  periodLength: 5,
  pmsDays: 3,
  showFertile: true,
  showOvulation: true,
  showPms: true,
  categories: DEFAULT_CATEGORIES,
  customTags: [],
  remindPeriodDays: 2,
  remindPms: false,
  remindFertile: false,
  notify: false,
  onCalendar: true,
  adaptLoad: true,
};

/** Réglages du cycle complétés par les valeurs par défaut. */
export function cycleSettingsOf(settings: { cycle?: Partial<CycleSettings> }): CycleSettings {
  return { ...DEFAULT_CYCLE_SETTINGS, ...settings.cycle };
}

/** `lower_back` → « Lower back » : libellé de repli pour une clé inconnue. */
export function humanize(key: string): string {
  const s = key.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function categoryLabel(key: string): string {
  return CATEGORY_BY_KEY.get(key)?.label ?? humanize(key);
}

/** Libellé d'une option ; les étiquettes perso s'affichent telles quelles. */
export function optionLabel(category: string, option: string): string {
  if (category === 'tags') return option;
  return CATEGORY_BY_KEY.get(category)?.options.find((o) => o.key === option)?.label ?? humanize(option);
}
