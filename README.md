# Invintory

Application personnelle de gestion de cave à vin : PWA offline-first (React + TypeScript + Vite)
et API REST PHP (Slim + PHP-DI), déployées sur hébergement mutualisé OVH.
Conventions du projet : `CLAUDE.md`. État actuel : socle, outillage de tests, composants du design
system (étape 4), schéma et migrations (étape 1), authentification (étape 2), contrat d'API
(étape 3.0), emplacements (3a), bouteilles (3b), mouvements et catégories (3c),
synchronisation, photos et export (3d) — API seulement. La suite est décrite dans le plan
ci-dessous.

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

PHP 8.5 avec les extensions `gd` (JPEG) et `zip` (présentes sur le mutualisé OVH et dans
l'image Docker ; à activer dans le `php.ini` de l'hôte pour `composer install` et
`composer test`), Composer, Node 24 et npm, Docker (avec Docker Compose).

## Lancer en local

```sh
cp .env.example .env            # puis remplir DEPLOY_TOKEN et AUTH_CLIENT_SECRET (valeurs
                                # aléatoires) ; ne jamais versionner .env
composer install --working-dir=api
npm install
npm run build                   # produit dist/ (PWA + public/api/index.php + .htaccess)
docker compose up -d --build
```

Ouvrir <http://localhost:8080> : sans session, la PWA ouvre la connexion. Créer un compte
(« Créer un compte »), ouvrir le lien de confirmation consigné par la doublure (voir
**Authentification** ci-dessous), puis se connecter. Vérification directe de l'API :
`curl -i http://localhost:8080/api/health`.

**Écrans de la PWA** (routage `react-router`) : `/` (cave), `/meals`, `/add`,
`/shortages`, `/settings` dans la coque à barre de navigation, encore provisoires
(étapes 6 à 8) ; `/login`, `/register`, `/password/forgot`, `/password/reset` et
`/auth/return` (retour des liens reçus par email). Le jeton d'accès n'est gardé qu'en
mémoire : au rechargement, le ticket de session (cookie) en obtient un nouveau. Les
formulaires de compte vérifient la saisie avant l'envoi (email, mot de passe de 8 à
72 octets), le serveur gardant ses contrôles ; la connexion envoie le nom de l'appareil
détecté (« Chrome sur Windows »), affiché plus tard dans la liste des appareils.

**Cave et emplacements** (`app/ecrans/cave/`) : `/` liste la cave (Armoire > Étagère >
bouteilles, Cartons, Hors rangement) ; `/cabinets/:id` montre une armoire de face et la
gère ; `/cabinets/new`, `/shelves/:id`, `/boxes/new`, `/boxes/:id` créent, modifient et
suppriment armoires, étagères et cartons. Ces modifications demandent le réseau (P7) ;
la consultation fonctionne hors ligne.

**Hors ligne** (`app/hors-ligne/`, Dexie) : une base IndexedDB par compte
(`invintory-<sub>`) garde la dernière réponse de chaque lecture, la file des ajouts,
déplacements et sorties, et les photos en attente. La file part vers `POST /api/sync` au
démarrage, à chaque nouvelle mutation et au retour du réseau ; les photos suivent
(`PUT /api/photos/{client_ref}`). Les écrans qui s'en servent arrivent aux étapes 6 à 8.
Un bandeau signale l'absence de réseau, ce qui attend d'être envoyé et les modifications
refusées par le serveur.

**Thème** : clair ou sombre selon le système ; un choix manuel enregistré dans
`localStorage` (clé `theme`, `light` ou `dark`) prime. Il sera réglable dans Réglages
(étape 8).

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
| `GET /api/cellar` | Bearer | vue globale : armoires, étagères, cartons, hors rangement |
| `POST /api/cabinets`, `PATCH`/`DELETE …/cabinets/{id}` | Bearer | armoires (avec leurs étagères) |
| `POST /api/cabinets/{id}/shelves`, `PATCH`/`DELETE /api/shelves/{id}` | Bearer | étagères |
| `POST /api/boxes`, `PATCH`/`DELETE …/boxes/{id}` | Bearer | cartons |
| `GET /api/locations/suggestion?count&skip` | Bearer | suggestion d'emplacement |
| `POST /api/references/reservations` | Bearer | réserve de références pour l'ajout hors ligne |
| `GET /api/regions?q`, `GET /api/grapes?q` | Bearer | autocomplétion des régions et cépages |
| `GET /api/bottles`, `GET …/bottles/{id}`, `GET …/bottles/by-reference/{ref}` | Bearer | liste filtrée et triée, fiche avec ses mouvements |
| `PATCH /api/bottles/{id}` | Bearer | édition de la fiche, date limite recalculée |
| `GET`/`POST /api/categories`, `PATCH`/`DELETE …/categories/{id}` | Bearer | catégories, seuils et durées de garde |
| `GET /api/shortages` | Bearer | manques et suggestions |
| `POST /api/sync` | Bearer | ajouts, déplacements et sorties (lot de mutations, en ligne comme hors ligne) |
| `PUT /api/photos/{client_ref}` | Bearer | photo d'une bouteille ou d'un lot d'ajout (`image/jpeg`) |
| `GET /api/bottles/{id}/photo`, `…/photo/thumbnail`, `DELETE …/photo` | Bearer | photo, miniature, suppression |
| `GET /api/export` | Bearer | archive ZIP de la cave (`data.json` + photos) |

En production, l'application est déclarée dans l'administration d'auth-service avec la
`redirect_uri` `https://invintory.fr/api/auth/callback` ; `AUTH_SERVICE_URL`, `AUTH_CLIENT_ID`
et `AUTH_CLIENT_SECRET` y prennent les valeurs réelles. Le JWKS est mis en cache dans `cache/`
à la racine du projet, hors webroot (`APP_CACHE_DIR` pour le déplacer). Les photos des
bouteilles sont dans `photos/` à la racine du projet, hors webroot elles aussi
(`APP_PHOTOS_DIR` pour les déplacer) : seule l'API les sert, après authentification.

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

**Intégration continue.** Chaque PR vers `main` déclenche le workflow
`.github/workflows/verification.yml` (onglet *Actions* de GitHub), qui rejoue ces mêmes
commandes : API avec un service MySQL 8.0, front, puis bout en bout contre la doublure
Docker. Il ne déploie rien.

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
