# Changelog

Toutes les modifications notables de ce projet sont consignées dans ce fichier.

Le format s'appuie sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et le projet suit le [versionnage sémantique](https://semver.org/lang/fr/).

## [Unreleased]

### Added

- Fiche bouteille et recherche par référence (étape 6b) :
  - fiche (`/bottles/:id`) : référence, badges, photo, attributs du CdC §2.2 (« non
    millésimé », date limite), emplacement relié à son armoire ou carton, historique des
    mouvements ; hors ligne, la copie de la fiche ou, à défaut, celle de la liste ;
  - photo chargée par la route authentifiée et affichée par `URL.createObjectURL` ;
    client API : option `format: 'blob'` ;
  - modification de la fiche (`/bottles/:id/edit`, en ligne) : type, domaine, région et
    cépage avec autocomplétion, millésime, date d'entrée, origine, souvenir, note ;
    saisie vérifiée avant l'envoi ;
  - recherche par référence en tête de la cave (casse et espaces ignorés) ; hors ligne,
    dans la copie des bouteilles en cave ;
  - tests : 27 Vitest ajoutés (324 en tout), 2 de bout en bout (42 en tout).
- Vue de la cave et emplacements (étape 6a) :
  - écran Cave : liste hiérarchique Armoire > Étagère > bouteilles, puis Cartons et Hors
    rangement (BottleCard : référence, type, souvenir, « À boire d'urgence ») ; lue
    « réseau d'abord », la dernière copie locale reste consultable hors ligne ;
  - écran Armoire (`/cabinets/:id`) : vue visuelle, une ligne par étagère (alvéoles
    occupées de la couleur du type), renommage, ajout d'une étagère, suppression ;
  - création d'une armoire avec ses étagères (`/cabinets/new`), modification et
    suppression d'une étagère (`/shelves/:id`), création, modification et suppression
    d'un carton (`/boxes/new`, `/boxes/:id`) ;
  - suppression d'un emplacement non vide confirmée dans une feuille basse qui annonce le
    passage de ses bouteilles en Hors rangement ;
  - saisie vérifiée avant l'envoi (nom, capacité de 1 à 65 535, jamais sous l'occupation) ;
    hors ligne, modifications désactivées (« Réseau requis… », décision P7) ;
  - composant Armoire : `titreVisible` pour un écran qui porte déjà le nom de l'armoire ;
  - tests : 44 Vitest ajoutés (297 en tout), 3 de bout en bout (40 en tout).
- Formulaires de compte (décision P35) :
  - validation côté front, avant l'envoi : email (forme générale), mot de passe présent, et
    de 8 à 72 octets pour l'inscription et le nouveau mot de passe, comme auth-service ;
    message sous le champ, focus sur le premier champ en erreur, erreur effacée dès que le
    champ change ; le serveur garde ses contrôles en garde-fou ;
  - la connexion envoie le nom de l'appareil détecté (`device`, « Chrome sur Windows »,
    « Safari sur iPhone »…), rien s'il n'est pas reconnu ;
  - tests : 37 Vitest ajoutés (253 en tout), 1 de bout en bout (37 en tout).
- Hors ligne visible et recette de l'étape 5 (étape 5c) :
  - bandeau de synchronisation en tête des écrans : « Hors ligne » (mouvements et photos
    en attente), « En attente de synchronisation » avec un bouton Réessayer,
    « Modifications refusées » avec les motifs du serveur ; icône « cercle barré » ;
  - thème : un choix manuel enregistré (`localStorage` « theme ») prime sur
    `prefers-color-scheme`, y compris s'il est fait dans un autre onglet (réglage visible à
    l'étape 8) ;
  - scénario Chrome contre Docker : réseau coupé, rechargement servi par le service worker,
    mutation en file, envoyée une seule fois au retour du réseau ;
  - tests : 16 Vitest ajoutés (216 en tout), 1 de bout en bout (36 en tout).
- Données hors ligne et synchronisation de la PWA (étape 5b) :
  - `dexie` (nouvelle dépendance) : une base IndexedDB par compte (`invintory-<sub>`,
    décision P36), avec cache de lecture, file de mutations, photos en attente (Blob),
    correspondances `client_ref` → id et référence, rejets consignés ;
  - cache de lecture « réseau d'abord » : la réponse du serveur remplace la copie ; serveur
    injoignable, la dernière copie est rendue avec sa date ;
  - file de mutations (`add`, `move`, `exit` du contrat §10) : `client_ref` UUID v4 et
    `schemaVersion` sur chaque entrée, chaîne de migration appliquée avant l'envoi ;
  - moteur de synchronisation : ajouts avant mouvements, lots de 200, renvoi sans doublon
    après une coupure, rejets traités selon le contrat §10.3, photos envoyées ensuite
    (`PUT /api/photos/{client_ref}`) ; lancé au démarrage, à chaque mise en file et au
    retour du réseau ; une passe à la fois, verrou entre onglets ;
  - client d'API : envoi d'un corps binaire (photo), compte de la session lu dans le jeton ;
  - tests : 52 Vitest ajoutés (200 en tout).
- Session et routage de la PWA (étape 5a) :
  - routage `react-router` (nouvelle dépendance) ; coque des écrans avec la barre de
    navigation ; écrans métier provisoires (`/`, `/meals`, `/add`, `/shortages`,
    `/settings`) en attendant les étapes 6 à 8 ; page « Page introuvable » ;
  - écrans de compte : connexion (`/login`), inscription avec renvoi du lien
    (`/register`), mot de passe oublié au message anti-énumération (`/password/forgot`),
    nouveau mot de passe (`/password/reset`), page de retour du callback pour chaque
    couple `type`/`status` (`/auth/return`) ;
  - client d'API : jeton d'accès en mémoire seulement, ticket dans le cookie HttpOnly ;
    un seul rafraîchissement à la fois (requêtes simultanées comprises), rejeu unique
    après un 401, nouvelle tentative sur `SESSION_ALREADY_REFRESHED`, retour à la
    connexion sur `SESSION_INVALID`/`ACCESS_REVOKED`, session conservée réseau coupé ;
    erreurs de l'enveloppe affichées telles quelles ;
  - décision P27 : adresses des écrans en anglais ;
  - tests : 55 Vitest ajoutés (148 en tout), 3 de bout en bout contre Docker (inscription
    → lien → connexion → rechargement ; mot de passe oublié complet ; refus).
- CI de vérification des PR (étape 0c) : workflow GitHub Actions `Vérification` sur
  chaque PR vers `main`, trois jobs — API (PHPCS, PHPStan, PHPUnit avec un service MySQL
  8.0), front (ESLint, tsc, Vitest, build), bout en bout (Playwright contre la doublure
  Docker, `.env` généré au lancement avec des valeurs aléatoires masquées) ; rapport
  Playwright et journaux en artefact en cas d'échec ; aucun déploiement (étape 9).
- Synchronisation, photos et export (étape 3d, contrat §10 à §12) :
  - `POST /api/sync` : lot de 200 mutations au plus (`add` de 1 à 100 bouteilles, `move`,
    `exit`) traité en une transaction, dans l'ordre reçu, chaque mutation dans un point de
    sauvegarde ; résultats `applied`, `already_applied` (idempotence par `client_ref`,
    réponse reconstruite à l'identique) ou `rejected` (`BOTTLE_NOT_FOUND`, `BOTTLE_EXITED`,
    `REFERENCE_NOT_RESERVED`, `REFERENCE_TAKEN`, `UNSUPPORTED_SCHEMA_VERSION`,
    `VALIDATION_FAILED`) ; lot mal formé → 400, trop gros → 413 `PAYLOAD_TOO_LARGE` ;
  - `PUT /api/photos/{client_ref}` (corps `image/jpeg`, 10 Mo au plus, sinon 413 ; autre
    type → 415 `UNSUPPORTED_MEDIA_TYPE`) : par la bouteille ou par le lot (une copie par
    bouteille), rejouable ; orientation EXIF appliquée (lue sans l'extension exif),
    recompression JPEG, 1600 px au plus, miniature de 400 px ;
  - `GET /api/bottles/{id}/photo`, `…/photo/thumbnail`, `DELETE /api/bottles/{id}/photo` :
    photos stockées hors webroot (`{user_id}/{reference}.jpg`), servies par route
    authentifiée ;
  - `GET /api/export` : archive ZIP `invintory-AAAA-MM-JJ.zip`, `data.json` (emplacements,
    référentiels, catégories, bouteilles de tout statut avec leurs mouvements, sans aucun
    id interne) et `photos/{reference}.jpg` ;
  - décision C2 : photos stockées en JPEG (Arch §5.2) ;
  - configuration : `APP_PHOTOS_DIR` facultatif (défaut `photos/` à la racine du projet,
    hors webroot) ; extensions `gd` et `zip` exigées (`composer.json`), ajoutées à l'image
    PHP de la doublure Docker ;
  - tests : 102 PHP (dont orientation EXIF des 8 valeurs, même lot envoyé deux fois,
    conflit de deux appareils, isolation de chaque route), 2 de bout en bout contre Docker.
- Mouvements et catégories (étape 3c, contrat §9, §10.2, §10.4) :
  - actions d'entrée (unitaire et en masse, 1 à 100 bouteilles), de déplacement et de
    sortie, prêtes pour `POST /api/sync` (étape 3d) qui les exposera : références
    fournies vérifiées (`REFERENCE_NOT_RESERVED`, `REFERENCE_TAKEN`) ou générées, horloge
    logique (un mouvement plus ancien est historisé sans changer l'état), sortie terminale
    (P19, `BOTTLE_EXITED`), bouteille inconnue (`BOTTLE_NOT_FOUND`), redirection vers hors
    rangement (`CAPACITY_EXCEEDED`, `LOCATION_NOT_FOUND`) sous verrou de l'emplacement ;
  - transactions imbriquées du `Repository` en points de sauvegarde (une mutation rejetée
    n'annule qu'elle) ;
  - `GET`/`POST /api/categories`, `PATCH`/`DELETE /api/categories/{id}` : unicité (type,
    région) y compris générique (409 `CATEGORY_EXISTS`), comptage P6, dates limites du type
    recalculées dans la même transaction (P17) ;
  - `GET /api/shortages` : catégories sous leur seuil, quantité manquante, 10 suggestions
    de vins déjà eus au plus, du dernier mouvement le plus récent au plus ancien ;
  - choix validés (P33) : référence mal formée → `REFERENCE_NOT_RESERVED` ; ranger là où
    la bouteille est déjà ne redirige jamais ; seuil 0 jamais en manque ;
  - tests : 81 PHP, 2 de bout en bout contre Docker.
- Bouteilles (étape 3b, contrat §4, §6, §7, §8) :
  - `POST /api/references/reservations` (1 à 100 codes, P1) : codes suivants de la séquence
    du compte (`a0`, `a1`… puis `a00` une fois les 816 codes à 2 caractères épuisés), sous
    verrou ; deux réservations simultanées ne reçoivent jamais le même code ;
  - `GET /api/regions?q`, `GET /api/grapes?q` : autocomplétion (contient, insensible à la
    casse, sensible aux accents) ; régions et cépages créés à la volée par l'édition ;
  - `GET /api/bottles` : filtres `status`, `location` (`hors_rangement`, `etagere:N`,
    `carton:N`, `cabinet:N`), `type`, `region_id`, `grape_id`, tris `priority` et `age`,
    `limit` ; drapeau `urgent` (date limite dépassée) ;
  - `GET /api/bottles/{id}` et `GET /api/bottles/by-reference/{reference}` (majuscules et
    espaces tolérés) : fiche avec ses mouvements, « Emplacement supprimé » le cas échéant ;
  - `PATCH /api/bottles/{id}` : type, région, cépage, domaine, millésime, date d'entrée,
    origine, note, souvenir ; date limite recalculée (P17 : catégorie spécifique, sinon
    générique, sinon garde par défaut du type) ;
  - choix validés (P32) : premier code `a0` ; catégorie sans durée de garde ignorée ;
    recherche par référence étendue aux bouteilles sorties ;
  - tests : 117 PHP (dont réservations concurrentes en 4 processus), 2 de bout en bout
    contre Docker.
- Emplacements (étape 3a, contrat §5) :
  - `GET /api/cellar` : armoires et étagères, cartons, occupation (bouteilles en cave
    seulement) et nombre de bouteilles hors rangement ;
  - armoires (`POST /api/cabinets` avec ses étagères, `PATCH`, `DELETE`), étagères
    (`POST /api/cabinets/{id}/shelves`, `PATCH`/`DELETE /api/shelves/{id}`), cartons
    (`POST /api/boxes`, `PATCH`, `DELETE`) ;
  - capacité réduite sous l'occupation refusée : 409 `CAPACITY_BELOW_OCCUPANCY` (P5) ;
  - suppression d'un emplacement non vide : bouteilles basculées en hors rangement dans la
    même transaction, un mouvement `deplacement` chacune, horloge logique avancée sans
    jamais reculer (P20) ; une armoire supprimée emporte ses étagères ;
  - `GET /api/locations/suggestion?count&skip` : premier emplacement assez libre, dans
    l'ordre que la PWA reproduira hors ligne ; `skip` pour « Autre emplacement » ;
  - classe de base `CaveAVin\Donnees\Repository` (connexion, transaction, requêtes) ;
  - choix validés (P31) : positions 1, 2… et nouvelle étagère après la dernière ;
    `name: null` efface le nom d'une étagère ; armoire sans étagère admise ;
  - tests : 75 PHP (CRUD, validation, capacité, bascule, suggestion, isolation), 2 de bout
    en bout contre Docker.
- Contrat d'API (`docs/contrat-api.md` v1.0, étape 3.0, validé) : conventions,
  emplacements et suggestion, référentiels, bouteilles, mouvements, catégories et manques,
  réserve de références (P1), format du lot `POST /api/sync` et de sa réponse, photos,
  export ; décisions P1, P5, P6, P7, P17, P19, P20, P29 et P30 intégrées.
- Authentification (étape 2), contre une doublure d'auth-service :
  - connexion : le refresh token reste en base, la PWA reçoit l'access token et un ticket
    opaque en cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/auth` (décision P3) ;
  - rafraîchissement sérialisé par verrou (`SELECT … FOR UPDATE`), ticket renouvelé à chaque
    usage, rejeu détecté (session supprimée), 30 jours glissants ;
  - vérification locale des jetons : signature, expiration (tolérance 60 s), `aud` et `iss`,
    JWKS en cache fichier 1 h, nouveau téléchargement sur `kid` inconnu ;
  - middleware Bearer sur toute route, sauf la liste explicite des routes publiques ;
  - callback (`redirect_uri`), inscription, renvoi du lien, mot de passe oublié et nouveau
    mot de passe, profil, changement d'email, appareils connectés et révocation (P14) ;
  - doublure d'auth-service (tests en processus, service Docker `auth` sur le port 8081) ;
  - configuration (`.env.example`) : `AUTH_SERVICE_URL`, `AUTH_CLIENT_ID`,
    `AUTH_CLIENT_SECRET` (jamais versionné) et `APP_CACHE_DIR` facultatif (cache du JWKS,
    par défaut `cache/` à la racine du projet, hors webroot et ignoré par git) ;
  - domaine `invintory.fr` (P2) : `redirect_uri` = `https://invintory.fr/api/auth/callback`,
    à déclarer dans l'administration d'auth-service ;
  - tests : 155 PHP (dont deux processus concurrents), 8 de bout en bout contre Docker.
- Schéma et migrations (étape 1) :
  - 11 migrations `api/migrations/mysql/` (une instruction par fichier), générées depuis le
    DDL du schéma v1.1, appliquées par `fzed51/migration` v3.1.1 ;
  - route `POST /api/internal/migrate` protégée par `X-Deploy-Token` (`DEPLOY_TOKEN`,
    comparaison `hash_equals`, refus si le jeton n'est pas configuré) ;
  - connexion MySQL commune (`CaveAVin\Donnees\Connexion`) : utf8mb4, session en UTC ;
  - tests : discipline des fichiers, schéma migré identique au DDL de référence
    (`information_schema`), relance sans effet, contraintes (RESTRICT, CASCADE, colonne
    générée, collation), route refusée sans le bon jeton ; e2e du refus.
- Composants du design system (étape 4, `app/components/`) : Button, BadgeType,
  BadgeSouvenir, BadgeUrgent, Pastille, BottleCard, ShelfGrid et Armoire, Field, SegmentedControl
  (pilotable aux flèches), BottomNav, Banner (quatre variantes), Sheet (`<dialog>` modal),
  jeu d'icônes SVG ; un fichier de test par composant.
- Page `/catalogue` en développement uniquement (absente du build), contrôlée par
  Playwright en thème clair et sombre (projet `catalogue`, serveur Vite lancé au besoin).
- Outillage de tests (étape 0b) :
  - PHPUnit en trois suites `unit` / `integration` / `http`, scripts `composer test:*` ;
  - base MySQL de test `invintory_test` dans la doublure Docker, créée au premier lancement,
    vidée avant chaque test, protégée par un garde-fou sur le suffixe `_test` ;
  - couverture PHP (`composer test:coverage`, Xdebug ; pcov dans l'image Docker, désactivé
    par défaut) et front (`npm run test:coverage`, `@vitest/coverage-v8`) ;
  - `fake-indexeddb` chargé dans Vitest ;
  - Playwright (`npm run e2e`) : vérifications du socle automatisées contre Docker ;
  - tests unitaires de `Environnement`.
- Schéma MySQL détaillé `docs/schema-mysql-cave-a-vin.md` (v1.0), restauré à l'identique
  depuis l'historique.
- Plan d'implémentation complète en étapes cadrées (`docs/plan-implementation.md`) et
  fichier de suivi (`docs/suivi-implementation.md`) : état des étapes, critères de fin,
  points ouverts, journal.
- Règles de travail : tests écrits avant l'implémentation ou le correctif ; README et
  CHANGELOG mis à jour à chaque étape.
- Documentation de référence dans `docs/` : cahier des charges fonctionnel, architecture
  technique, design system, intégration `auth-service`, notes sur l'hébergement OVH.
- `CLAUDE.md` : décisions techniques et règles de travail du projet.
- Socle technique :
  - API Slim 4 + PHP-DI sous `/api`, route `GET`/`HEAD /api/health`, enveloppe d'erreur
    `{"error": {"code", "message"}}` (404, 405, 500 journalisée) ;
  - front controller `public/api/index.php` et `.htaccess` avec le correctif de l'en-tête
    `Authorization` sous FastCGI ;
  - PWA React + TypeScript + Vite, `vite-plugin-pwa` en mode `prompt` avec vérification
    horaire et bandeau « Nouvelle version disponible », design system intégré, thème
    automatique clair/sombre ;
  - doublure Docker : Apache, PHP 8.5-FPM, MySQL 8.0 ;
  - qualité : PHPCS (PSR-12), PHPStan, PHPUnit, ESLint, `tsc`, Vitest.

### Changed

- BottleCard : lien du routeur (`Link`), la fiche s'ouvre sans recharger la page ; le
  catalogue l'affiche dans un routeur en mémoire.

- PWA : la page d'accueil n'affiche plus la réponse de `/api/health` ; sans session, elle
  ouvre la connexion. BottomNav : liens du routeur (sans rechargement), adresses en
  anglais (`/meals`, `/add`, `/shortages`, `/settings`) ; le catalogue l'affiche dans un
  routeur en mémoire.
- API : chemins et champs JSON en anglais (P29). `/api/auth/connexion` → `/api/auth/login`,
  `rafraichir` → `refresh`, `deconnexion` → `logout`, `inscription` → `register`
  (`…/renvoi` → `…/resend`), `mot-de-passe/oubli` et `…/nouveau` → `password/forgot` et
  `…/reset`, `appareils` → `devices`, `/api/compte` → `/api/account` ; champs
  `access_token`, `expires_in`, `device`, `status` (`confirmation_pending`,
  `reset_pending`), `executed` ; page de retour de la PWA `/retour` → `/auth/return` ;
  cookie `ivt_reinit` limité à `/api/auth/password`. Les anciens chemins répondent 404.
- Règle de travail : la documentation (`CHANGELOG.md` en particulier) est mise à jour en
  préparant la publication d'une PR, avant sa fusion.
- Schéma MySQL v1.2 : `user_sessions.previous_refresh_session_hash` (rotation du ticket, P3),
  ajoutée par deux migrations additives.
- Tests : la base de test se migre d'elle-même et se vide par `DELETE` (suite 13 fois plus
  rapide) ; `migration_story` toujours préservée.
- Erreurs d'API : refus d'auth-service relayés avec leur code ; `UNAUTHORIZED` journalisé
  comme défaut de configuration.
- Schéma MySQL v1.1 : décisions P15, P16, P18, P21, P22 — bouteille sortie en hors
  rangement, isolation des étagères par jointure, `DATETIME(3)` en UTC pour les mouvements,
  `auth_sub VARCHAR(36)`, `utf8mb4` / `utf8mb4_0900_as_ci` déclarés sur chaque table.
- Suivi : écarts restants de l'étape 4 consignés (P25 à P27).
- Playwright : projets `socle` (Docker) et `catalogue` (Vite).
- `Banner` déplacé dans `app/components/`, variante neutre renommée et variante `warning` ajoutée.
- Test HTTP de l'API déplacé dans `api/tests/Http/`.
- `vitest` épinglé en 5.0.2, comme `@vitest/coverage-v8` (dépendance de pair stricte).
- Règle de travail : chaque étape du plan est implémentée dans sa propre PR.
- Suivi : revue du schéma MySQL contre le cahier des charges et l'architecture ;
  nouveaux points à trancher (C3, P14–P22), dont cinq bloquent l'étape 1.
- `CLAUDE.md` : chemins `docs/` corrigés, schéma MySQL référencé, PHP 8.5.

### Fixed

- Test de bout en bout du catalogue instable : les polices étaient vérifiées avant la fin
  de leur chargement ; il attend désormais le chargement et exige au moins une police
  chargée.
- Design system, étagère : une ligne = une étagère (toutes ses alvéoles sur une ligne,
  réduites au besoin) ; l'étagère entière est la cible tactile, les alvéoles un dessin ;
  nouvelles classes `ivt-armoire`, `ivt-shelf--selected` (alvéoles de 30 px auparavant
  sur un écran de 320 px, grille fixe de 6 colonnes).
- Design system : les options du contrôle segmenté font 44 px de haut (`--tap-target`),
  comme l'exige le guide pour toute cible tactile (40 px auparavant).

[Unreleased]: https://github.com/fzed51/invintory/commits/main
