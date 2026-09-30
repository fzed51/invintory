# Invintory

Application personnelle de gestion de cave à vin : PWA offline-first (React + TypeScript + Vite)
et API REST PHP (Slim + PHP-DI), déployées sur hébergement mutualisé OVH.
Conventions du projet : `CLAUDE.md`. Étape actuelle : socle technique livré, sans fonctionnalité
métier ; la suite est décrite dans le plan ci-dessous.

## Documentation

| Sujet | Fichier |
|---|---|
| Plan d'implémentation (étapes, critères de fin) | `docs/plan-implementation.md` |
| Suivi (état des étapes, points ouverts, journal) | `docs/suivi-implementation.md` |
| Périmètre fonctionnel | `docs/cahier-des-charges-fonctionnel-cave-a-vin.md` |
| Architecture technique | `docs/architecture-technique-cave-a-vin.md` |
| Schéma MySQL | `docs/schema-mysql-cave-a-vin.md` |
| Design system | `docs/design-systeme-invintory.md` |
| Intégration `auth-service` | `docs/ressources/auth-service-integration.md` |
| Hébergement OVH et doublure Docker | `docs/ressources/hebergement-mutualise-et-doublure-docker.md` |
| Relevé PHP du mutualisé OVH | `docs/ressources/rapport-php-mutualise-ovh.md` |
| Historique des modifications | `CHANGELOG.md` |

## Prérequis

PHP 8.5, Composer, Node 24 et npm, Docker (avec Docker Compose).

## Lancer en local

```sh
cp .env.example .env            # puis adapter les valeurs ; ne jamais versionner .env
composer install --working-dir=api
npm install
npm run build                   # produit dist/ (PWA + public/api/index.php + .htaccess)
docker compose up -d --build
```

Ouvrir <http://localhost:8080> : la page appelle `GET /api/health` et affiche la réponse.
Vérification directe : `curl -i http://localhost:8080/api/health`.

Le service `web` sert `dist/`, comme la production : relancer `npm run build` après chaque
modification du front. `api/` et `dist/` doivent rester deux dossiers frères.
MySQL est exposé sur le port hôte 3307.

## Lancer les vérifications

```sh
# API (dans api/)
composer lint     # PHPCS, PSR-12
composer stan     # PHPStan
composer test     # PHPUnit

# Front (à la racine)
npm run lint      # ESLint
npm run stan      # tsc -b
npm run test      # Vitest
```

Règle du projet : les tests sont écrits **avant** l'implémentation ou le correctif qu'ils
valident, et vus en échec avant de passer au vert. L'outillage complet (suites d'intégration
MySQL, couverture, tests de bout en bout Playwright) arrive à l'étape 0b du plan.

## Ce que la doublure Docker ne prouve pas

Elle reproduit le serveur web (Apache, `.htaccess`), le SAPI (PHP-FPM) et les versions de PHP et
MySQL. Elle ne reproduit pas : les quotas de base SQL, le transfert FTP/SFTP, le SSL, ni le
cluster mutualisé OVH lui-même.
