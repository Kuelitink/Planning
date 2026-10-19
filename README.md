# Planning

Application de planning pour téléphone (PWA installable), dans l'esprit de FlowSavvy :
calendrier avec événements et to-do, **auto-planification** des tâches (priorités, échéances,
dépendances, horaires autorisés), listes/projets, objectifs du jour/semaine/mois, chrono, et suivi
du cycle menstruel façon Clue (avec import des données Clue).

Hébergée gratuitement sur GitHub Pages ; les données restent sur l'appareil (IndexedDB),
avec export/import JSON pour les sauvegardes.

**En ligne :** https://kuelitink.github.io/Planning/

L'app fonctionne par **modes**, choisis dans le menu en haut à gauche : Calendrier,
Checklist (to-do du jour auto-planifiée), Listes, Objectifs, Chrono, Cycle, et Réglages. Les détails
d'une tâche (priorité, échéance, dépendances, horaires, découpage) sont dans sa fiche.

## Commandes

```bash
npm install         # dépendances
npm run dev         # serveur local (http://localhost:5173)
npm test            # tests (Vitest, fuseau Europe/Paris)
npm run typecheck   # vérification TypeScript
npm run build       # build de production dans dist/
node scripts/gen-icons.mjs  # régénère les icônes PNG
```

## Organisation

- `src/core/` — logique pure, sans interface :
  - `types.ts` modèle de données (listes, horaires, tâches, événements, objectifs, chrono, réglages) ;
  - `scheduler.ts` auto-planification (règles et score d'urgence documentés en tête du fichier) ;
  - `daily.ts` to-do du jour et totaux ; `goals.ts` objectifs ; `timer.ts` chrono ;
  - `time.ts`, `intervals.ts`, `windows.ts`, `events.ts` utilitaires (heure locale, récurrences) ;
  - `cycle.ts` cycles, moyennes et prédictions (règles de calcul en tête du fichier) ;
    `cycleCatalog.ts` catégories de suivi ; `reminders.ts` rappels ;
    `clue.ts` import des exports Clue ; `zip.ts` lecture des zip chiffrés (ZipCrypto).
- `src/storage/` — interface `Repository` (IndexedDB, mémoire), export/import JSON.
- `src/state/` — état React : `store.tsx` (données, plan, chrono, cycle), `cycle.ts` (prédictions
  du jour, notifications), `nav.tsx` (modes, feuilles),
  `defaults.ts` (premier lancement, exemple), `urgency.ts` (objectifs, tri par urgence, recherche).
- `src/ui/` — thème (DA « Trait fin » : rose pâle, fin trait prune, Fredoka + Nunito), icônes, composants partagés, formats de dates.
- `src/modes/` — un fichier par mode (vues du mode Cycle dans `modes/cycle/`) ;
  `src/sheets/` — feuilles du bas (tâche, événement, jour du cycle…).
- `tests/` — tests Vitest.

## Mode Cycle

Suivi du cycle menstruel inspiré de Clue :

- **Cycle** : l'anneau du cycle en cours (jour, phase, règles, fenêtre fertile, ovulation, SPM),
  les rappels du jour, la semaine, ce qui est noté aujourd'hui et les prédictions (prochaines
  règles avec fourchette, fenêtre fertile, ovulation, SPM, retard).
- **Calendrier** : règles notées et prévues, fenêtres fertiles, SPM et jours notés, mois par mois.
- **Analyse** : cycle et règles moyens, variation (régularité), durée des derniers cycles,
  historique (exclure un cycle des prédictions, l'annoter), tendances des symptômes par jour du
  cycle, sommeil, température basale et poids.
- **Noter un jour** : règles (4 intensités), spotting, douleurs (avec intensité), émotions, SPM,
  énergie, mental, sommeil, sexualité, pertes, protection, social, digestion, selles, envies,
  poitrine, peau, cheveux, sport, sorties, médicaments, pilule, stérilet, tests, maux,
  rendez-vous, étiquettes perso, température basale, poids et notes. Les catégories suivies se
  choisissent dans les réglages du cycle (icône en haut à droite).
- **Rappels** : règles proches ou en retard, SPM, fenêtre fertile, saisie du jour ; affichés dans
  l'onglet, et en notification du téléphone quand l'app est ouverte (pas de serveur).
- **Import Clue** : dans Clue, Réglages › « Télécharger mes données » ; Clue affiche un mot de
  passe et envoie un lien vers un `.zip`. Dans l'onglet Cycle : réglages › « Importer depuis
  Clue », choisir le `.zip` (ou les `.json` qu'il contient, ou une ancienne sauvegarde
  `.cluedata`) et saisir le mot de passe. Mesures, cycles exclus et notes, durées, affichage,
  étiquettes et rappels sont repris. Le fichier est lu sur le téléphone : rien n'est envoyé.

Les prédictions sont des estimations, pas une méthode de contraception.

## Déploiement sur GitHub Pages

Chaque push sur `main` lance `.github/workflows/deploy.yml` : tests, build, puis publication de
`dist/` sur la branche `gh-pages`, servie par GitHub Pages (Settings › Pages › Source : branche
`gh-pages`). Sur le téléphone : ouvrir l'URL dans Chrome, puis menu ⋮ › « Ajouter à l'écran
d'accueil » / « Installer l'application ».
