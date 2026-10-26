# Planning

Application de planning pour téléphone Android (APK), dans l'esprit de FlowSavvy :
calendrier avec événements et to-do, **auto-planification** des tâches (priorités, échéances,
dépendances, horaires autorisés), listes/projets, checklist du jour/semaine/mois, chrono, et suivi
du cycle menstruel façon Clue (avec import des données Clue).

Les données restent sur l'appareil (IndexedDB), avec export/import JSON (à envoyer sur Drive par
le menu de partage) et une sauvegarde automatique chiffrée dans un dépôt GitHub privé.
Deux widgets d'écran d'accueil (voir plus bas).

L'app fonctionne par **modes**, choisis dans le menu en haut à gauche : Calendrier,
Checklist, Listes, Chrono, Cycle, et Réglages. Les détails d'une tâche (priorité, échéance,
dépendances, horaires, découpage) sont dans sa fiche : on l'ouvre en touchant son titre ou son
échéance, à droite.

- **Calendrier** : vues Jour, 3 jours, Semaine (grille de minuit à minuit, qui défile jour par jour ;
  pincer pour étirer les heures) et Mois.
- **Checklist** : les tâches importantes du jour, de la semaine ou du mois, dans l'ordre (en haut =
  la plus urgente). Une tâche de la checklist est planifiée comme ASAP (jour), haute (semaine) ou
  normale (mois). Appui long puis glisser pour réordonner ; glisser à droite pour en faire une
  sous-tâche de la ligne du dessus (elle suit sa mère), à gauche pour la remettre au premier
  niveau ou la retirer. Une tâche ajoutée dans la checklist est planifiée.
- **Listes** : même fonctionnement que la Checklist (appui long pour réordonner, glisser à
  droite pour une sous-tâche) ; à priorité égale, une tâche plus haut dans sa liste est
  planifiée avant.
- **Planning** : une case sur chaque tâche de la grille pour la terminer sans ouvrir sa fiche ;
  un champ « + Ajouter une tâche… » au-dessus de la grille (la tâche rejoint la checklist du
  jour affiché) ; appui long sur une tâche puis glisser pour la poser à l'heure et au jour
  voulus (créneau fixé, au quart d'heure) ; le bouton + ouvre la même recherche que dans la
  Checklist (pour le jour affiché), avec « Tâche à heure fixe » et « Événement ».
- **Heure fixe** : dans la fiche d'une tâche, l'interrupteur « Heure fixe » la pose « le … de …
  à … » ; décoché, elle repasse à l'auto-planification.
- **Chrono** : la tâche en haut avec le temps déjà passé dessus, un cercle avec le temps, le
  statut, play/pause et « Terminer », puis « Changer de tâche » (les plus probables d'abord,
  et une recherche). Glisser vers la droite : le minuteur (5 à 60 min). Chaque arrêt ajoute
  le temps de la session à la tâche.
- **Sous-tâches** : planifiées chacune à la place de leur tâche mère, avec son échéance, sa
  priorité et sa place ; cocher la dernière coche la mère.
- **Hiérarchie des listes** : à priorité égale, la liste du dessus passe avant celle du dessous
  (une haute d'une liste du dessous passe quand même avant une normale du dessus).

**Auto-planification** : les tâches à faire sont placées au plus tôt dans les créneaux libres,
la plus urgente d'abord (échéance, priorité, dépendances), et replacées à chaque modification.
Avec des données de cycle, la charge s'adapte au cycle (Réglages › Planification › « Adapter la
charge au cycle », actif par défaut) : journées pleines en phases folliculaire et ovulatoire, de
plus en plus légères en phase lutéale (85 % du temps libre au début, 50 % la veille des règles),
70 % pendant les règles. Ce plafond cède toujours devant une échéance ou un manque de place :
le cycle ne crée jamais de retard.

## Commandes

```bash
npm install         # dépendances
npm run dev         # serveur local (http://localhost:5173)
npm test            # tests (Vitest, fuseau Europe/Paris)
npm run typecheck   # vérification TypeScript
npm run build       # build de production dans dist/
node scripts/gen-icons.mjs  # régénère les icônes PNG (PWA et Android)

# Appli Android (JDK 21 et SDK Android requis)
npm run build:android                         # appli web sans service worker, copiée dans android/
cd android && ./gradlew assembleDebug         # APK de test : android/app/build/outputs/apk/debug/
cd android && ./gradlew testDebugUnitTest     # tests des widgets (images dans app/build/widget-previews/)
```

## Organisation

- `src/core/` — logique pure, sans interface :
  - `types.ts` modèle de données (listes, horaires, tâches, événements, objectifs, chrono, réglages) ;
  - `scheduler.ts` auto-planification (règles et score d'urgence documentés en tête du fichier) ;
    `cycleLoad.ts` charge de chaque jour selon le cycle ;
  - `daily.ts` to-do du jour et totaux ; `goals.ts` périodes de la checklist ; `checklist.ts` ordre et sous-tâches de la checklist ; `timer.ts` chrono ;
  - `time.ts`, `intervals.ts`, `windows.ts`, `events.ts` utilitaires (heure locale, récurrences) ;
  - `cycle.ts` cycles, moyennes et prédictions (règles de calcul en tête du fichier) ;
    `cycleCatalog.ts` catégories de suivi ; `insights.ts` analyses détaillées ; `reminders.ts` rappels ;
    `clue.ts` import des exports Clue ; `clueExport.ts` export au même format ; `zip.ts` lecture des zip chiffrés (ZipCrypto).
- `src/storage/` — interface `Repository` (IndexedDB, mémoire), export/import JSON.
- `src/sync/` — sauvegarde chiffrée sur GitHub (chiffrement, API « contents », envoi/restauration).
- `src/native/` — appli Android : `widgets.ts` (instantané envoyé aux widgets, actions reçues),
  `NativeBridge.tsx` (widgets, bouton retour), `update.ts` (nouvelle APK disponible).
- `android/` — projet Android (Capacitor) ; widgets dans `app/src/main/java/…/widget/`.
- `src/state/` — état React : `store.tsx` (données, plan, chrono, cycle), `cycle.ts` (prédictions
  du jour, notifications), `nav.tsx` (modes, feuilles),
  `defaults.ts` (premier lancement, exemple), `urgency.ts` (checklist, tri par urgence, recherche).
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
  Chaque case prend la couleur de sa phase : rouge pour les règles notées, rouge désaturé en
  pointillé pour les règles prévues, bleu clair pour la fenêtre fertile (avec une pastille bleu
  soutenu le jour de l'ovulation estimée), mauve pastel pour le SPM ; aujourd'hui a un contour
  épais. L'anneau et la légende reprennent exactement ce code couleur.
- **Phases du cycle dans le Calendrier** (réglage du cycle, activé par défaut) : le mode
  Calendrier teinte les cases du mois avec ces mêmes couleurs (les points des tâches restent
  visibles) et marque les en-têtes des jours en vues Semaine et Jour.
- **Analyse** : cycle et règles moyens, variation (régularité), historique filtrable (exclure un
  cycle des prédictions, l'annoter), tendances des symptômes par jour du cycle, et des analyses
  détaillées façon Clue Plus :
  - durée du cycle (derniers cycles, plus court / plus long, médiane, tendance, répartition) ;
  - règles (abondance jour par jour, jour le plus abondant, dernières règles, spotting) ;
  - crampes et douleurs (moment habituel, intensité, prochaines crampes probables) ;
  - humeur et énergie par phase (émotions, mental, énergie : ce qui ressort de chaque phase) ;
  - sommeil (dernières nuits, moyenne par phase) ;
  - température basale (courbe par cycle, décalage thermique « 3 au-dessus de 6 »).
- **Phase en cours** : ce qui se passe dans le corps et ce qui revient chez toi à ce moment du cycle.
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
- **Export au format Clue** : réglages du cycle › « Exporter au format Clue » crée le même dossier
  `ClueDataDownload-…` (`measurements.json`, `cycle_attributes.json`, `profile.json`…), non
  chiffré, réimportable ici ou dans une autre appli qui lit les exports Clue. « Enregistrer sur
  Drive ou partager » ouvre le menu de partage du téléphone ; sinon, téléchargement du `.zip`.

Les prédictions sont des estimations, pas une méthode de contraception.

## Sauvegarde GitHub (chiffrée)

Réglages › Données › « Sauvegarde GitHub » envoie toutes les données (tâches, calendrier,
cycle…) dans un fichier `planning-sauvegarde.json` d'un **dépôt privé** (par exemple
`planning-donnees`), une minute après chaque modification et quand on quitte l'app (tant
qu'elle est ouverte). Au démarrage, une version envoyée par un autre appareil est fusionnée.

- Chiffrement sur le téléphone avant l'envoi : AES-GCM 256 bits, clé dérivée du mot de passe
  (PBKDF2-SHA-256, 600 000 itérations). Le mot de passe n'est pas conservé ; sans lui, la
  sauvegarde est illisible.
- Accès par une clé « fine-grained » limitée au dépôt (Contents : Read and write), gardée sur
  l'appareil seulement (jamais dans les exports). L'app refuse un dépôt public.
- Code : `src/sync/` (chiffrement, API GitHub, envoi et restauration) et `src/state/sync.tsx`.

## Appli Android et widgets

L'appli web, empaquetée avec [Capacitor](https://capacitorjs.com/) : les données restent dans
l'appli. L'ancienne version en ligne (GitHub Pages, arrêtée) avait ses propres données : pour les
retrouver, utiliser la sauvegarde GitHub ou export/import. En plus de l'appli web :

- **Widget « Aujourd'hui »** : la journée planifiée (événements, tâches avec leur case à cocher,
  pastille de la liste, heure), le nombre de tâches à faire et faites, et un bouton + pour ajouter
  une tâche. Redimensionnable ; « + N autres » quand tout ne tient pas.
- **Widget « Prochaine tâche »** : ce qui est en cours (« Maintenant · jusqu'à 11:00 ») ou juste
  après, avec sa case à cocher ; le soir, le premier élément du lendemain.
- Cocher sur un widget n'ouvre pas l'appli : la case est cochée tout de suite, l'appli
  l'enregistre (et la sauvegarde GitHub l'envoie) à sa prochaine ouverture, ou aussitôt si elle
  tourne en arrière-plan. Toucher une ligne ouvre sa fiche.
- Les widgets se redessinent à chaque modification dans l'appli, au début et à la fin de chaque
  élément, à minuit, et toutes les 30 min. L'appli leur envoie les 7 prochains jours.
- Bouton retour du téléphone : ferme la feuille ou le menu ouvert. Export et partage passent
  par le menu de partage d'Android ; « Télécharger » enregistre dans Documents › Planning.

**Installer** : sur le téléphone, ouvrir
[la dernière release](https://github.com/Kuelitink/Planning/releases/latest), télécharger
`planning.apk`, l'ouvrir et autoriser l'installation depuis le navigateur si Android le demande.
Puis appui long sur l'écran d'accueil › Widgets › Planning. Quand une nouvelle version existe,
Réglages propose de la télécharger ; elle s'installe par-dessus l'ancienne sans perdre les données.

**Publication** (`.github/workflows/android.yml`) : à chaque push sur `main`, tests (web et
widgets), APK signée, et release GitHub `apk-<numéro>`. Il faut une fois ajouter le secret
`ANDROID_KEYSTORE_PASSWORD` (Settings › Secrets and variables › Actions › New repository secret,
un long mot de passe à garder). Au premier passage, la clé de signature est créée, chiffrée par
ce mot de passe, et enregistrée dans `android/planning-release.p12`. Sans le secret, l'APK est
construite (artefact du passage) mais pas publiée. Ne pas perdre ce mot de passe : une APK signée
avec une autre clé ne s'installe pas par-dessus (il faudrait désinstaller, puis restaurer depuis
la sauvegarde GitHub).
