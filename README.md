# Planning

Application de planning pour téléphone (PWA installable), dans l'esprit de FlowSavvy :
calendrier avec événements et to-do, **auto-planification** des tâches (priorités, échéances,
dépendances, horaires autorisés), listes/projets, objectifs du jour/semaine/mois et chrono.

Hébergée gratuitement sur GitHub Pages ; les données restent sur l'appareil (IndexedDB),
avec export/import JSON pour les sauvegardes.

**En ligne :** https://kuelitink.github.io/Planning/

L'app fonctionne par **modes**, choisis dans le menu en haut à gauche : Calendrier,
Checklist (to-do du jour auto-planifiée), Listes, Objectifs, Chrono, et Réglages. Les détails
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
  - `time.ts`, `intervals.ts`, `windows.ts`, `events.ts` utilitaires (heure locale, récurrences).
- `src/storage/` — interface `Repository` (IndexedDB, mémoire), export/import JSON.
- `src/state/` — état React : `store.tsx` (données, plan, chrono), `nav.tsx` (modes, feuilles),
  `defaults.ts` (premier lancement, exemple).
- `src/ui/` — thème (DA « Blocs couleur »), icônes, composants partagés, formats de dates.
- `src/modes/` — un fichier par mode ; `src/sheets/` — feuilles du bas (tâche, événement…).
- `tests/` — tests Vitest.

## Déploiement sur GitHub Pages

Chaque push sur `main` lance `.github/workflows/deploy.yml` : tests, build, puis publication de
`dist/` sur la branche `gh-pages`, servie par GitHub Pages (Settings › Pages › Source : branche
`gh-pages`). Sur le téléphone : ouvrir l'URL dans Chrome, puis menu ⋮ › « Ajouter à l'écran
d'accueil » / « Installer l'application ».
