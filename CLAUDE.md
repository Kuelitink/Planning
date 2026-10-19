# Planning — notes pour Claude

- **Pousser directement sur `main`**, sans branche ni pull request (choix du propriétaire du dépôt).
  Chaque push sur `main` lance les tests, le build et la mise en ligne sur GitHub Pages
  (`.github/workflows/deploy.yml`), ainsi que l'APK Android publiée en release (`android.yml`).
- Avant de pousser : `npm test`, `npm run typecheck` et `npm run build` doivent passer.
- Interface, commentaires et messages de commit en français ; style de l'interface : DA « Trait fin »
  (`src/ui/theme.css`).
- Le dépôt est public : ne jamais y mettre de données personnelles (exports Clue, données de santé…).
  Les tests utilisent des données synthétiques (`tests/fixtures/`).
- Appli Android (`android/`, Capacitor) : `npm run build:android` avant Gradle ; si le code des widgets
  change, `cd android && ./gradlew testDebugUnitTest assembleDebug` doit passer (et regarder les images de
  `app/build/widget-previews/`). Le format de l'instantané des widgets est défini deux fois :
  `src/native/widgets.ts` et `android/…/widget/Snapshot.java` (les garder d'accord).
- `android/planning-release.p12` (clé de signature de l'APK) est créé par le workflow Android et protégé
  par le secret `ANDROID_KEYSTORE_PASSWORD` : ne jamais le supprimer ni le remplacer.
