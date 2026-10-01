# Changelog

Toutes les modifications notables de ce projet sont consignées dans ce fichier.

Le format s'appuie sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et le projet suit le [versionnage sémantique](https://semver.org/lang/fr/).

## [Unreleased]

### Added

- Composants du design system (étape 4, `app/components/`) : Button, BadgeType,
  BadgeSouvenir, BadgeUrgent, Pastille, BottleCard, ShelfGrid, Field, SegmentedControl
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

- `CLAUDE.md` : chemins `docs/` corrigés, schéma MySQL référencé, PHP 8.5.
- Suivi : revue du schéma MySQL contre le cahier des charges et l'architecture ;
  nouveaux points à trancher (C3, P14–P22), dont cinq bloquent l'étape 1.
- Règle de travail : chaque étape du plan est implémentée dans sa propre PR.
- `vitest` épinglé en 5.0.2, comme `@vitest/coverage-v8` (dépendance de pair stricte).
- Test HTTP de l'API déplacé dans `api/tests/Http/`.
- `Banner` déplacé dans `app/components/`, variante neutre renommée et variante `warning` ajoutée.
- Playwright : projets `socle` (Docker) et `catalogue` (Vite).
### Fixed

- Design system : les options du contrôle segmenté font 44 px de haut (`--tap-target`),
  comme l'exige le guide pour toute cible tactile (40 px auparavant).

[Unreleased]: https://github.com/fzed51/invintory/commits/main
