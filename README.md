# Invintory

Application personnelle de gestion de cave à vin : PWA offline-first (React + TypeScript + Vite)
et API REST PHP (Slim + PHP-DI), déployées sur hébergement mutualisé OVH.
Conventions du projet : `CLAUDE.md`. État actuel : socle, outillage de tests, composants du design
system (étape 4), schéma et migrations (étape 1), authentification (étape 2) ; pas encore de
fonctionnalité métier. La suite est décrite dans le plan ci-dessous.

## Documentation

| Sujet | Fichier |
|---|---|
| Plan d'implémentation (étapes, critères de fin) | `docs/plan-implementation.md` |
| Suivi (état des étapes, points ouverts, journal) | `docs/suivi-implementation.md` |
| Périmètre fonctionnel | `docs/cahier-des-charges-fonctionnel-cave-a-vin.md` |
| Architecture technique | `docs/architecture-technique-cave-a-vin.md` |
| Schéma MySQL | `docs/schema-mysql-cave-a-vin.md` |
| Contrat d'API (routes, formats, `/sync`, photos, export) | `docs/contrat-api.md` |
| Design system | `docs/design-systeme-invintory.md` |
| Intégration `auth-service` | `docs/ressources/auth-service-integration.md` |
| Hébergement OVH et doublure Docker | `docs/ressources/hebergement-mutualise-et-doublure-docker.md` |
| Relevé PHP du mutualisé OVH | `docs/ressources/rapport-php-mutualise-ovh.md` |
| Historique des modifications | `CHANGELOG.md` |

## Prérequis

PHP 8.5, Composer, Node 24 et npm, Docker (avec Docker Compose).

## Lancer en local

```sh
cp .env.example .env            # puis remplir DEPLOY_TOKEN et AUTH_CLIENT_SECRET (valeurs
                                # aléatoires) ; ne jamais versionner .env
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

**Schéma de la base.** Les migrations (`api/migrations/mysql/`, une instruction par fichier,
outil `fzed51/migration`) s'appliquent par la route protégée, avec le `DEPLOY_TOKEN` du `.env` :

```sh
curl -X POST -H "X-Deploy-Token: <DEPLOY_TOKEN>" http://localhost:8080/api/internal/migrate
```

La réponse liste les fichiers exécutés (`{"executed": [...]}`) ; une relance n'exécute rien.
Sans jeton configuré ou avec un mauvais jeton : 401 `INVALID_DEPLOY_TOKEN`.

**Authentification.** En local, `auth-service` est remplacé par une doublure (service `auth`,
<http://localhost:8081>) qui suit le même contrat (`docs/ressources/auth-service-integration.md`).
Elle lit `AUTH_CLIENT_ID` et `AUTH_CLIENT_SECRET` dans le `.env`, comme l'API. Aucun email ne
part : ils sont consignés et lisibles sur `http://localhost:8081/_doublure/emails?a=<adresse>`,
avec le lien de confirmation à ouvrir dans le navigateur.

| Route | Accès | Rôle |
|---|---|---|
| `POST /api/auth/register`, `…/register/resend` | public | inscription, renvoi du lien |
| `POST /api/auth/login` | public | access token (corps) + ticket en cookie `ivt_session` |
| `POST /api/auth/refresh`, `…/logout` | cookie | nouveau jeton, ticket renouvelé ; fin de session |
| `POST /api/auth/password/forgot`, `…/reset` | public / cookie `ivt_reinit` | réinitialisation |
| `GET /api/auth/callback` | public | `redirect_uri` d'auth-service, redirige vers la page `/auth/return` de la PWA |
| `GET /api/auth/devices`, `DELETE …/devices/{id}` | Bearer | appareils connectés, révocation |
| `GET /api/account`, `POST /api/account/email` | Bearer | profil, changement d'email |

En production, l'application est déclarée dans l'administration d'auth-service avec la
`redirect_uri` `https://invintory.fr/api/auth/callback` ; `AUTH_SERVICE_URL`, `AUTH_CLIENT_ID`
et `AUTH_CLIENT_SECRET` y prennent les valeurs réelles. Le JWKS est mis en cache dans `cache/`
à la racine du projet, hors webroot (`APP_CACHE_DIR` pour le déplacer).

Chemins et champs JSON de l'API sont en anglais ; le détail de chaque route est dans
`docs/contrat-api.md`. Toute autre route exige `Authorization: Bearer <jeton>`. Le ticket de session ne quitte jamais
le cookie `HttpOnly` ; il change à chaque rafraîchissement et expire après 30 jours sans usage.

## Lancer les vérifications

```sh
# API (dans api/)
composer lint               # PHPCS, PSR-12
composer stan               # PHPStan
composer test               # PHPUnit, les trois suites
composer test:unit          # PHP pur
composer test:integration   # base MySQL de test (docker compose up -d db)
composer test:http          # application Slim complète, sans serveur
composer test:coverage      # couverture via Xdebug, rapport HTML dans coverage/php

# Front (à la racine)
npm run lint                # ESLint
npm run stan                # tsc -b
npm run test                # Vitest (jsdom, IndexedDB simulé par fake-indexeddb)
npm run test:coverage       # couverture V8, rapport HTML dans coverage/front

# Bout en bout (à la racine), contre la doublure Docker
npm run build && docker compose up -d
npx playwright install chromium   # une seule fois
npm run e2e                 # Playwright : projets « socle » et « catalogue »
npm run e2e -- --project=catalogue   # composants seuls (lance « npm run dev » au besoin)
```

**Composants et catalogue.** Les composants du design system sont dans `app/components/`
(un test par composant). En développement (`npm run dev`), <http://localhost:5173/catalogue>
les présente tous, avec un sélecteur de thème clair/sombre ; cette page n'est jamais
embarquée dans le build.

**Suite d'intégration.** Elle utilise une base dédiée `invintory_test`, créée au premier
lancement (compte root de la doublure) et vidée avant chaque test ; un garde-fou refuse
toute base dont le nom ne finit pas par `_test`. Paramètres (variables d'environnement,
défauts = MySQL Docker vu depuis l'hôte) : `DB_TEST_HOST` (127.0.0.1), `DB_TEST_PORT`
(3307), `DB_TEST_NAME` (invintory_test), `DB_TEST_USER` (invintory), `DB_TEST_PASSWORD`
(changeme), `DB_TEST_ROOT_PASSWORD` (root).
Les tests de migration repartent d'une base vide et comparent le résultat, via
`information_schema`, au DDL de `docs/schema-mysql-cave-a-vin.md` exécuté dans une seconde
base `invintory_ref_test`.

**Dans le conteneur PHP** (pcov installé, désactivé par défaut) :
`docker compose exec -w /var/www/html/api php php -d pcov.enabled=1 vendor/bin/phpunit --coverage-text`
(sous Git Bash, préfixer par `MSYS_NO_PATHCONV=1`).

Règle du projet : les tests sont écrits **avant** l'implémentation ou le correctif qu'ils
valident, et vus en échec avant de passer au vert.

## Ce que la doublure Docker ne prouve pas

Elle reproduit le serveur web (Apache, `.htaccess`), le SAPI (PHP-FPM) et les versions de PHP et
MySQL. Elle ne reproduit pas : les quotas de base SQL, le transfert FTP/SFTP, le SSL, ni le
cluster mutualisé OVH lui-même. L'auth-service y est une doublure : le parcours réel (emails en
boîte de réception, vrais identifiants) reste à jouer en recette (étape 9).
