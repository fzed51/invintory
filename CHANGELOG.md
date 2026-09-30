# Changelog

Toutes les modifications notables de ce projet sont consignées dans ce fichier.

Le format s'appuie sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et le projet suit le [versionnage sémantique](https://semver.org/lang/fr/).

## [Unreleased]

### Added

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

[Unreleased]: https://github.com/fzed51/invintory/commits/main
