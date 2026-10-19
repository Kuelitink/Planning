# Planning — notes pour Claude

- **Pousser directement sur `main`**, sans branche ni pull request (choix du propriétaire du dépôt).
  Chaque push sur `main` lance les tests, le build et la mise en ligne sur GitHub Pages
  (`.github/workflows/deploy.yml`).
- Avant de pousser : `npm test`, `npm run typecheck` et `npm run build` doivent passer.
- Interface, commentaires et messages de commit en français ; style de l'interface : DA « Trait fin »
  (`src/ui/theme.css`).
- Le dépôt est public : ne jamais y mettre de données personnelles (exports Clue, données de santé…).
  Les tests utilisent des données synthétiques (`tests/fixtures/`).
