# Planning

Application de planning pour téléphone (PWA installable), dans l'esprit de FlowSavvy :
calendrier avec événements et to-do, **auto-planification** des tâches (priorités, échéances,
dépendances, horaires autorisés), listes/projets, objectifs du jour/semaine/mois et chrono.

Hébergée gratuitement sur GitHub Pages ; les données restent sur l'appareil (IndexedDB),
avec export/import JSON pour les sauvegardes.

> État : socle technique et moteur de planification. L'interface arrive après le choix de la
> direction artistique.

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
- `tests/` — tests Vitest.

## Déploiement sur GitHub Pages

1. Dans le dépôt GitHub : **Settings › Pages › Source = GitHub Actions**.
2. Chaque push sur `main` lance `.github/workflows/deploy.yml` (tests, build, mise en ligne).
   On peut aussi le lancer à la main depuis l'onglet **Actions**.
3. L'app est servie sur `https://<compte>.github.io/planning/`. Sur le téléphone : ouvrir l'URL,
   puis « Ajouter à l'écran d'accueil » (Safari : bouton Partager ; Chrome : menu ⋮).
