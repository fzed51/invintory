# Suivi de l'implémentation — Invintory

Tableau de bord du plan `docs/plan-implementation.md`. À mettre à jour à chaque fin
d'étape (ou de sous-étape) et à chaque décision prise.

Légende : ⬜ à faire · 🟨 en cours · ✅ terminé (tous les critères prouvés) · ⛔ bloqué

## Vue d'ensemble

| Étape | Intitulé | État | Branche | Commit | Bloquée par |
|---|---|---|---|---|---|
| Socle | Squelette API, PWA, doublure Docker | ✅ | `feat/socle` | edc3aae | — |
| 0 | Mise à niveau documentaire | ✅ | `feat/etape-0-docs` | 18720e5 (docs) | — |
| 0b | Outillage de tests | ✅ | `feat/etape-0b-tests` | PR #2 (224a722) | — |
| 1 | Schéma et migrations | ✅ | `feat/etape-1-schema` | PR #4 | — |
| 2 | Authentification (backend, simulé) | 🟨 | `feat/etape-2-auth` | | — |
| 3.0 | Contrat d'API | ⬜ | | | 2 |
| 3a | Emplacements | ⬜ | | | 3.0, P5, P20 |
| 3b | Bouteilles | ⬜ | | | 3a, P1, P17 |
| 3c | Mouvements et catégories | ⬜ | | | 3b, P6, P17, P19 |
| 3d | Sync, photos, export | ⬜ | | | 3c, P7, C2 |
| 4 | Composants du design system | ✅ | `feat/etape-4-composants` | PR #3 | — |
| 5 | Fondations front (session, offline, sync) | ⬜ | | | 2, 3, 4, P3 |
| 6 | Cave, emplacements, fiche bouteille | ⬜ | | | 5 |
| 7 | Ajout de bouteilles | ⬜ | | | 6, P1, P4 |
| 8 | Repas, manques, catégories, réglages, export | ⬜ | | | 6, 7, P14 |
| 9 | Déploiement continu et recette finale | ⬜ | | | 8, C1, P2, identifiants auth-service |

## Tests — règle et mesures

Règle : un maximum de tests, **écrits avant** l'implémentation ou le correctif, vus en
échec pour la bonne raison, puis au vert (détail : plan, « Stratégie de tests »).
Chaque étape ci-dessous porte implicitement ces cases :
- [ ] Tests de l'étape écrits et vus en échec **avant** l'implémentation
- [ ] Scénarios de fin automatisés (Playwright) quand l'étape a une interface
- [ ] `README.md` et `CHANGELOG.md` mis à jour, ce fichier de suivi aussi

| Étape | Tests PHP ajoutés | Tests front ajoutés | Tests e2e ajoutés | Couverture PHP | Couverture front |
|---|---|---|---|---|---|
| Socle | 6 | 3 | 0 | non mesurée | non mesurée |
| 0b | 22 (unit 17, integration 5) | 2 | 5 | lignes 98,2 % (55/56) | lignes 66,1 %, instructions 59,4 % |
| 4 | 0 | 91 (11 fichiers, un par composant) | 10 (catalogue) | inchangée | lignes 91,9 % ; composants 99,4 % |
| 1 | 57 (unit 34, integration 16, http 7) | 0 | 1 (socle) | lignes 98,8 % (84/85) | inchangée |
| 2 | 155 (unit 68, integration 87) | 0 | 8 (auth, contre Docker) | lignes 99,0 % (512/517) | inchangée |

## Critères de fin par étape

### Étape 0 — Mise à niveau documentaire
- [x] `docs/` et `CLAUDE.md` commités et poussés (18720e5)
- [x] `PROMPT.md` supprimé
- [x] `docs/schema-mysql-cave-a-vin.md` restauré, identique à 91a8e0b (même blob git)
- [x] `CLAUDE.md` corrigé (`docs/`, PHP 8.5, schéma présent)
- [x] Branche locale `feat/socle` supprimée (confirmée par l'utilisateur)
- [x] `git status` propre

### Étape 0b — Outillage de tests
- [x] Suites PHPUnit `unit` / `integration` / `http` + base MySQL de test dans Docker (`invintory_test`, garde-fou `_test`)
- [x] `composer test:coverage` (Xdebug local ; pcov dans l'image Docker, désactivé par défaut, vérifié dans le conteneur)
- [x] `@vitest/coverage-v8` (même version que `vitest`, 5.0.2 épinglées), `fake-indexeddb`, `npm run test:coverage`
- [x] Playwright + `npm run e2e` ; vérifications du socle réécrites en e2e (5 tests)
- [x] Un test volontairement faux échoue dans chaque suite (unit, integration, http, Vitest, Playwright), puis est retiré
- [x] README : commandes de test

### Étape 1 — Schéma et migrations
- [x] Décisions P15, P16, P18, P21, P22 reportées dans le schéma (v1.1)
- [x] Migrations `api/migrations/mysql/YYYYMMDD-NN-*.sql`, une instruction par fichier, 11 tables
- [x] Test d'intégration comparant `information_schema` au schéma v1.1 (colonnes, types, index, FK, encodage)
- [x] Relance de la migration : aucun fichier exécuté
- [x] `POST /api/internal/migrate` : 401 en enveloppe sans jeton ou avec un mauvais jeton (`hash_equals`) ; migre avec le bon
- [x] Scénario sous Docker : base vide → migrate → 11 tables + `migration_story`
- [x] Qualité (lint/stan/test PHP + front, build) au vert
- [x] `README.md`, `CHANGELOG.md` et suivi à jour

### Étape 2 — Authentification
- [x] JWT : valide / expiré / mauvais `aud` / mauvais `iss` / signature falsifiée / `kid` inconnu (+ tolérance 60 s, JWKS en cache, injoignable)
- [x] Refresh nominal
- [x] Deux refresh concurrents → un seul appel au service (deux processus PHP ; sans le verrou, le test échoue : rejeu détecté, session perdue)
- [x] Rejeu du refresh token → toutes les sessions révoquées chez auth-service (doublure), et la session locale supprimée au refus ; rejeu du ticket → session supprimée
- [x] Callback : chaque couple `type`/`status`, `reset_token` retiré de l'URL (cookie `ivt_reinit`), `Referrer-Policy: no-referrer`, aucune page rendue
- [x] Carve-out : refus testés (y compris `HEAD`) et `HEAD /health` → 200 ; routes publiques nommées `public.*`
- [x] Ticket (P3) : cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`, renouvelé à chaque rafraîchissement, rejeu → session supprimée, 30 jours glissants
- [x] Appareils (P14) : liste et révocation, isolées par utilisateur
- [x] Migrations v1.2 additives ; schéma migré toujours identique au DDL
- [x] Doublure auth-service (Docker) : contrat §2–4, JWKS RS256 avec `kid`
- [x] Route protégée sous Docker via `.htaccess` → 200 (Playwright)
- [x] Qualité au vert
- [x] `README.md`, `CHANGELOG.md` et suivi à jour

### Étape 3 — Contrat d'API et API métier
- [ ] 3.0 `docs/contrat-api.md` rédigé **et validé par l'utilisateur**
- [ ] 3a Emplacements (CRUD, suppression non vide → hors rangement, suggestion)
- [ ] 3b Bouteilles (édition, référentiels, référence, recherche, DLC)
- [ ] 3c Mouvements et catégories (entrée/masse, déplacement, sortie, horloge logique, catégories, repas, manques)
- [ ] 3d Sync, photos, export
- [ ] Test d'isolation : B → 404 sur chaque ressource de A, chaque route
- [ ] Même lot `/sync` ×2 → aucun doublon
- [ ] Conflit deux appareils → état = mouvement le plus récent, deux mouvements en historique
- [ ] Export ouvert et vérifié
- [ ] Qualité au vert

### Étape 4 — Composants du design system
- [x] Button, Badge/Pastille, BottleCard, ShelfGrid, Field, SegmentedControl, BottomNav, Banner, Sheet, icônes (`app/components/`)
- [x] Un test par composant (ARIA, états, clavier) : 10 fichiers, 86 tests
- [x] Catalogue absent de `dist/` (grep insensible à la casse)
- [x] `/catalogue` contrôlé dans Chromium (Playwright, écran Pixel 7), clair et sombre : captures relues, aucune erreur console, polices chargées
- [x] Aucune couleur/police en dur hors `app/design/` (grep)
- [x] Cibles ≥ 44 px : vérifié automatiquement à 320 et 412 px ; contrôle segmenté corrigé (P23) ; étagère entière comme cible (P24, option A)
- [x] Textes conformes au guide de style (contrôle : ni emoji ni point d'exclamation)
- [x] Qualité au vert

### Étape 5 — Fondations front
- [ ] Écrans connexion, inscription, oubli, nouveau mot de passe, retours callback
- [ ] Client API (refresh unique côté client)
- [ ] Dexie : cache de lecture, file de mutations versionnée, photos en Blob
- [ ] Tests Vitest : migrations de file, idempotence, refresh unique, reprise
- [ ] Scénario Chrome hors ligne → retour réseau → mutation envoyée une fois
- [ ] Qualité au vert

### Étape 6 — Cave, emplacements, fiche bouteille
- [ ] Scénarios Chrome en ligne **et** hors ligne (armoire, déplacement, sortie, suppression non vide, recherche par référence)
- [ ] Tests Vitest des écrans clés
- [ ] Qualité au vert

### Étape 7 — Ajout de bouteilles
- [ ] Ajout en masse ×6 hors ligne avec photo → 6 références, 6 photos + miniatures
- [ ] Blocage de capacité vérifié
- [ ] Tests Vitest (formulaire, compression)
- [ ] Qualité au vert

### Étape 8 — Repas, manques, catégories, réglages, export
- [ ] Catégorie sous seuil → pastille + écran Manques
- [ ] Durée de garde modifiée → DLC et tri mis à jour
- [ ] Export téléchargé et vérifié
- [ ] Qualité au vert

### Étape 9 — Déploiement continu et recette
- [ ] Commit déployé par la CI sans action manuelle
- [ ] Smoke test `GET` et `HEAD /api/health`
- [ ] Parcours Auth §5 avec les vrais identifiants
- [ ] `Authorization` vérifié en production
- [ ] Parcours complet sur les deux comptes + isolation
- [ ] Bandeau de mise à jour après un second déploiement
- [ ] Matrice de couverture entièrement prouvée

## Contradictions et points ouverts

| Id | Sujet | Bloque | Décision | Date |
|---|---|---|---|---|
| C1 | Transport de déploiement : FTP en clair (Arch, Héb) vs SFTP (Relevé 26/09) | 9 | | |
| C2 | Photos stockées : JPEG (Arch §5.2) vs WebP (Relevé) — plan : JPEG | 3d | | |
| P1 | Référence d'une bouteille créée hors ligne (générée par le serveur) | 3b, 7 | | |
| P2 | Sous-domaine de l'app et `redirect_uri` | 2, 9 | Domaine `invintory.fr` (racine, pas de sous-domaine) ; `redirect_uri` = `https://invintory.fr/api/auth/callback` | 2026-10-05 |
| P3 | Durée de vie de l'identifiant opaque (proposé : 30 j glissants) | 2, 5 | Ticket opaque en cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/auth` ; 30 jours glissants (`last_used_at`) ; renouvelé à chaque rafraîchissement avec détection du rejeu (colonne `previous_refresh_session_hash`, schéma v1.2 ; fenêtre de 10 s pour les requêtes concurrentes) ; révocation par appareil | 2026-10-05 |
| P4 | Brouillon de saisie persisté en continu | 7 | | |
| P5 | Capacité réduite sous l'occupation actuelle | 3a | | |
| P6 | Seuil générique : compte-t-il les bouteilles d'une catégorie spécifique ? | 3c | | |
| P7 | Emplacements et catégories en ligne uniquement ? | 3d, 5 | | |
| P8 | Rotation des journaux (fichier unique ou par jour) | 2 | | |
| P9 | Même compte OVH qu'auth-service ? | 9 | | |
| P10 | Version MySQL 8.0.x exacte (CHECK ≥ 8.0.16) | 1 | Pas de CHECK en attendant | |
| P11 | Sauvegarde MySQL automatique OVH | 9 | | |
| P12 | Icônes PWA à fournir | 5 | | |
| P13 | Identifiants auth-service (`client_id`, `client_secret`) demandés à l'exploitant | 9 | | |
| C3 | Formulations périmées : Arch §4.5 dit `date_dernier_mouvement_applique` absente du schéma (elle y est) ; schéma « MySQL/MariaDB » (Arch : MySQL confirmé) ; schéma « batch » et §8 ouvert pour le recalcul de la DLC (Arch §6.2 : synchrone) ; schéma cite `integration.md` (réel : `docs/ressources/auth-service-integration.md`) | — | | |
| P14 | Révocation par appareil depuis l'écran Compte (schéma §1.2 pt 4) : absente du CdC §3.9 et d'Arch §2.2, reprise dans le plan (étapes 2, 8) — garder ou retirer ? | 2, 8 | Gardée : liste des appareils et révocation d'un appareil depuis l'écran Compte (étapes 2, 8) | 2026-10-05 |
| P15 | Emplacement d'une bouteille sortie non défini (`emplacement_type` NOT NULL ; `etagere_id` conservé → RESTRICT bloque la suppression, bascule appliquée aux sorties, comptages à filtrer sur `statut`) | 1, 3a, 3c | Hors rangement : à la sortie, `emplacement_type = 'hors_rangement'`, `etagere_id`/`carton_id` à NULL ; l'origine reste dans le mouvement (schéma v1.1 §5) | 2026-10-02 |
| P16 | Isolation : `etageres` sans `user_id` (filtre par jointure `armoires`) ; aucune FK n'empêche de référencer région/cépage/étagère/carton d'un autre utilisateur → vérification d'appartenance applicative | 1, 3 | Contrôle applicatif : `etageres` filtrée par jointure `armoires.user_id`, appartenance de chaque référence vérifiée avant écriture ; schéma inchangé (v1.1 §2) | 2026-10-02 |
| P17 | Recalcul de la DLC aussi à l'édition de millésime/date d'entrée/type/région et à la création/suppression d'une catégorie ; place des bouteilles sans DLC dans le tri « à boire en priorité » | 3b, 3c | | |
| P18 | `date_mouvement` `DATETIME` à la seconde + `<` strict → second mouvement de la même seconde ignoré ; fuseau non précisé → `DATETIME(3)` et UTC ? | 1, 3c | `DATETIME(3)` en UTC pour `date_mouvement` et `date_dernier_mouvement_applique` ; connexion en `time_zone = '+00:00'` (schéma v1.1) | 2026-10-02 |
| P19 | Horloge logique (Arch §4.5) : un déplacement horodaté après une sortie la « ressuscite » (`en_cave`), contraire au CdC §2.4 (sortie irréversible) | 3c | | |
| P20 | Suppression d'un emplacement non vide : la bascule vers hors rangement crée-t-elle un mouvement de déplacement ? | 3a | | |
| P21 | Tailles `auth_sub VARCHAR(64)` et `auth_refresh_token VARCHAR(255)` non vérifiables dans la doc auth-service (vérifier le code d'auth-service) | 1 | `auth_sub VARCHAR(36)` (taille côté auth-service, donnée par l'utilisateur) ; `auth_refresh_token VARCHAR(255)` inchangé, format non confirmé | 2026-10-02 |
| P22 | Étape 1 : index implicites créés par MySQL pour les FK non en tête d'index (`etagere_id`, `carton_id`, `region_id`, `cepage_id`) ; aucun `CHARSET`/`COLLATE` déclaré (collation par défaut → « Rhône » = « Rhone » dans `regions`) | 1 | `DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci` sur chaque table ; index des FK laissés implicites (schéma v1.1) | 2026-10-02 |
| P23 | Design system : `.ivt-seg__opt` a `min-height: 40px` (components.css) alors que le guide exige 44 px pour toute cible tactile — corriger le CSS du DS ? | 4 | Corrigé : `min-height: var(--tap-target)` dans le CSS du DS (app et paquet source) | 2026-10-01 |
| P24 | Design system : grille d'alvéoles fixe à 6 colonnes → alvéoles de 30 px sur un écran de 320 px (< 44 px) — colonnes adaptatives, ou exception admise ? | 4, 6 | Option A : une ligne = une étagère ; l'étagère entière est le bouton, les alvéoles un dessin réduit au besoin ; composant Armoire (CSS du DS adapté) | 2026-10-01 |
| P25 | Écart : la page de démonstration `docs/invintory-design-system.html` montre encore l'ancienne grille d'alvéoles (6 colonnes, alvéoles-boutons) ; seule la hauteur des options segmentées y est corrigée | — | | |
| P26 | Écart : la taille des alvéoles varie d'une étagère à l'autre (grande à 6 places, petite à 20) ; caler la taille sur l'étagère la plus longue de l'armoire ? | 6 | | |
| P27 | Choix de l'étape 4 à valider : Sheet en `<dialog>` natif avec mise en page inline (bas d'écran, bordure nulle, `color: var(--ink)`) ; adresses par défaut de BottomNav (`/`, `/repas`, `/ajouter`, `/manques`, `/reglages`) en attendant le routage de l'étape 5 ; « Domaine non renseigné » pour une bouteille sans domaine | 5, 6 | | |
| P28 | `fzed51/migration` v3.1.0 : `Migration::run()` ignore le `port` de `MigrationConfig` (`PDOFactory::mysql()` appelé sans port, donc 3306) et se connecte en `utf8` ; la base de test (port 3307 vu de l'hôte) est injoignable par cette voie. L'API utilise donc `MigrationCore` (setters publics) avec sa propre connexion PDO, sans `config_extern` — écart au plan (§ étape 1) et à Arch §6.7, à valider ; correctif possible dans la librairie | 1 | Garder `MigrationCore` avec la connexion de l'application, même après correction de la librairie : réutilise la connexion (port, charset, UTC) et ne dépend pas d'une nouvelle version ; `Migration::run()` ne servirait qu'à partager la config avec la CLI `migrate run`. Librairie corrigée en v3.1.1 (port et utf8mb4), adoptée le 2026-10-05 | 2026-10-02 |
| P29 | Choix de l'étape 2 à valider : noms des routes (`/api/auth/*`, `/api/compte`), page de retour de la PWA `/retour?type=…&status=…` ; cookie de réinitialisation `ivt_reinit` (15 min, `SameSite=Strict`) ; rejeu du ticket → seule la session concernée est supprimée ; fenêtre de 10 s pour les requêtes concurrentes ; journal en fichier unique en attendant P8 | 3.0, 5 | | |

Décisions déjà actées :
- auth-service simulé en développement, test réel en recette (écart assumé à Arch §6.6).
- Composants : tests Testing Library + `/catalogue` en dev uniquement.
- ShelfGrid : occupation par compte, sans position d'alvéole (le schéma n'en a pas) ; une
  ligne = une étagère, l'étagère entière est la cible, les alvéoles sont un dessin (P24).
- Sheet : `<dialog>` natif modal (focus, Échap, inertie du fond) ; seule mise en page en
  style inline (position en bas, bordure nulle, couleur `var(--ink)`), aucune couleur en dur.
- Mot de passe : via le flux de réinitialisation d'auth-service (seul flux disponible).
- Tests d'abord et en maximum (2026-09-30) : tests écrits et vus en échec avant toute
  implémentation ou correctif ; scénarios de fin automatisés en Playwright.

## Journal

| Date | Étape | Événement |
|---|---|---|
| 2026-09-30 | Socle | Livré, fusionné dans `main` (edc3aae), poussé |
| 2026-09-30 | 0 | `docs/` et `CLAUDE.md` commités et poussés (18720e5) ; `PROMPT.md` supprimé |
| 2026-09-30 | — | Plan v2 revérifié contre la documentation, enregistré dans `docs/` |
| 2026-09-30 | — | Règle « tests d'abord, un maximum » ajoutée ; nouvelle étape 0b (outillage de tests) |
| 2026-09-30 | — | Règle « README et CHANGELOG à jour à chaque étape » ; README et CHANGELOG remis à jour |
| 2026-09-30 | 0 | Schéma restauré, `CLAUDE.md` corrigé ; PR #1 ouverte sur `feat/etape-0-docs` ; `feat/socle` supprimée — étape terminée |
| 2026-09-30 | — | Schéma revérifié contre CdC et Arch (mêmes versions qu'à sa rédaction) : conforme dans ses tables ; C3 et P14–P22 ajoutés, étape 1 bloquée par P15, P16, P18, P21, P22 |
| 2026-10-01 | — | Règle : une PR par étape (plan, cadre commun ; `CLAUDE.md`) |
| 2026-10-01 | 0b | Outillage de tests livré sur `feat/etape-0b-tests` : 3 suites PHPUnit + base de test MySQL, couvertures PHP et front, fake-indexeddb, Playwright ; preuve d'échec dans chaque suite ; qualité au vert |
| 2026-10-01 | 4 | Composants du design system livrés sur `feat/etape-4-composants` avec `/catalogue` (dev) ; écarts P23, P24 du CSS du DS relevés, critère 44 px ouvert |
| 2026-10-01 | 4 | P23 corrigé (options segmentées à 44 px, CSS du DS) ; P24 à challenger : une ligne d'alvéoles = une étagère réelle |
| 2026-10-01 | 4 | P24 tranché (option A) : ShelfGrid sur une ligne, étagère entière cliquable, composant Armoire ; critère 44 px prouvé — étape terminée |
| 2026-10-01 | 4 | Écarts restants consignés (P25 démo HTML, P26 taille des alvéoles, P27 choix à valider) ; PR #3 fusionnée |
| 2026-10-02 | 1 | P15, P16, P18, P21, P22 tranchés et reportés dans le schéma (v1.1) ; branche `feat/etape-1-schema`, PR ouverte ; P28 relevé (port ignoré par `fzed51/migration`) |
| 2026-10-02 | 1 | Migrations, route `/internal/migrate` et tests livrés (vus en échec puis au vert ; comparaison au DDL prouvée sur une FK altérée) ; scénario Docker joué (401, 11 fichiers, relance vide) ; reste P28 à valider |
| 2026-10-02 | 1 | P28 tranché : `MigrationCore` + connexion de l'application conservés, même après correction de la librairie |
| 2026-10-05 | 1 | `fzed51/migration` mis à jour en v3.1.1 (correctif de P28 côté librairie) ; 85 tests PHP au vert, migration Docker inchangée |
| 2026-10-05 | 1 | Tous les critères prouvés ; PR #4 fusionnée dans `main` — étape terminée |
| 2026-10-05 | 2 | P2, P3, P14 tranchés ; schéma v1.2 (`previous_refresh_session_hash`) ; branche `feat/etape-2-auth` |
| 2026-10-05 | 2 | Authentification livrée contre la doublure : 155 tests PHP, 8 e2e contre Docker ; tous les critères prouvés ; P29 (choix à valider) relevé |
