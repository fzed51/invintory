# Changelog

Toutes les modifications notables de ce projet sont consignées dans ce fichier.

Le format s'appuie sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et le projet suit le [versionnage sémantique](https://semver.org/lang/fr/).

## [Unreleased]

### Added

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

- Design system, étagère : une ligne = une étagère (toutes ses alvéoles sur une ligne,
  réduites au besoin) ; l'étagère entière est la cible tactile, les alvéoles un dessin ;
  nouvelles classes `ivt-armoire`, `ivt-shelf--selected` (alvéoles de 30 px auparavant
  sur un écran de 320 px, grille fixe de 6 colonnes).
- Design system : les options du contrôle segmenté font 44 px de haut (`--tap-target`),
  comme l'exige le guide pour toute cible tactile (40 px auparavant).

[Unreleased]: https://github.com/fzed51/invintory/commits/main
