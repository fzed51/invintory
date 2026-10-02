# Plan — Implémentation complète d'Invintory (grosses étapes cadrées) — v2 revérifiée

> Avancement, décisions et journal : voir `docs/suivi-implementation.md`.

## Contexte

Socle livré (`main` 18720e5, poussé) : API Slim `/api/health`, PWA vide (bandeau de mise à
jour, thème auto), doublure Docker web/php-fpm/mysql, `docs/` et `CLAUDE.md` versionnés.
Ce plan couvre **tout le reste**, confronté ligne à ligne à : cahier des charges (CdC),
architecture (Arch), schéma MySQL (`git show 91a8e0b:docs/schema-mysql-cave-a-vin.md`),
intégration auth-service (Auth), note d'hébergement (Héb), relevé PHP OVH (Relevé), design
system (DS).

Décisions déjà prises avec l'utilisateur :
- auth-service : identifiants non reçus → développement contre un **auth-service simulé** ;
  test réel = critère de recette (écart assumé à Arch §6.6, qui prévoyait un client de dev).
- Composants de base : étape dédiée, tests Testing Library + **`/catalogue` dev uniquement**.

## Cadre commun (définition de « terminé » pour chaque étape)

- **Une PR par étape** : branche `feat/<étape>` depuis `main`, poussée, PR ouverte vers
  `main` ; fusion (fast-forward) seulement après accord de l'utilisateur, puis branche
  supprimée. Les sous-étapes (3a–3d) sont des commits distincts dans la PR de l'étape.
- Terminé = **tous** les points suivants prouvés : `composer lint && composer stan && composer test`
  (dans `api/`) ; `npm run lint && npm run stan && npm run test` ; `npm run build` ; scénario
  de l'étape joué sous Docker (http://localhost:8080) ; **`README.md` et `CHANGELOG.md` mis à
  jour** (README : installation, commandes, état ; CHANGELOG : section `[Unreleased]`, format
  Keep a Changelog) ; `docs/suivi-implementation.md` mis à jour ; résumé ≤ 10 lignes (fait /
  écarts / points à valider). Un critère non prouvé = étape ouverte, on ne passe pas à la suivante.
- Règles `CLAUDE.md` : `user_id` dans toute requête (Repository de base) ; Contrôleur → Action
  → Repository ; enveloppe `{"error":{"code","message"}}` ; migrations 1 instruction/fichier,
  additives ; `client_ref` + `schemaVersion` par mutation ; pas de CRON/processus long.
- Point ouvert qui bloque une étape → question avant de commencer l'étape (liste en fin).
- **Tests d'abord** (voir ci-dessous) : aucune implémentation ni correctif sans test écrit
  avant, vu en échec, puis au vert.

## Stratégie de tests — « tests d'abord, un maximum »

Règle (demande de l'utilisateur) : créer un maximum de tests, et **les écrire avant
l'implémentation ou le correctif** qu'ils valident.

- **Cycle par comportement** : 1) écrire le(s) test(s) décrivant le comportement attendu
  (critères de fin de l'étape, règles du CdC, cas limites, cas d'erreur) ; 2) les lancer et
  **constater l'échec pour la bonne raison** (pas une erreur de syntaxe ou d'import) ;
  3) implémenter le minimum pour passer au vert ; 4) remanier si utile, tests toujours verts.
- **Correctif** : d'abord un test qui **reproduit le défaut** (rouge), puis le correctif
  (vert). Le test reste dans la suite (non-régression).
- **Traçabilité** : les tests de l'étape sont commités avant ou avec l'implémentation, jamais
  après ; le résumé de fin d'étape indique le nombre de tests ajoutés et la couverture.
- **Ce qu'on teste systématiquement** : cas nominal, chaque règle métier, chaque code
  d'erreur, cas limites (capacité pleine, 0, max, NULL, doublon, rejeu, concurrence), ce que
  les garde-fous **refusent** autant que ce qu'ils laissent passer, isolation entre deux
  utilisateurs sur chaque route.
- **Couches de tests** :

| Couche | Outil | Cible |
|---|---|---|
| Unitaire PHP | PHPUnit | Actions (PHP pur), générateur de référence, calcul de DLC, résolution de catégorie, vérificateur JWT |
| Intégration PHP | PHPUnit + MySQL Docker (base de test dédiée, remise à zéro par test) | Repositories, migrations, transactions, verrous, `/sync` |
| HTTP PHP | PHPUnit via `Application::creer()->handle()` (modèle de `api/tests/ApiTest.php`) | routes, middleware d'auth, enveloppe d'erreur, isolation |
| Unitaire / composant front | Vitest + Testing Library (jsdom) | composants, hooks, écrans, client API |
| Offline front | Vitest + `fake-indexeddb` | Dexie, file de mutations, migrations `schemaVersion`, moteur de sync |
| Bout en bout | Playwright contre la doublure Docker (`context.setOffline`) | scénarios de fin d'étape, en ligne et hors ligne |

- Tout « scénario Chrome » des critères de fin ci-dessous est **automatisé en test
  Playwright**, puis contrôlé visuellement dans Chrome (thèmes clair et sombre).
- **Couverture mesurée** à chaque étape (PHPUnit via Xdebug, présent en local ;
  `@vitest/coverage-v8` côté front) et reportée dans le suivi. Pas de seuil chiffré imposé
  tant que l'utilisateur n'en a pas fixé un ; une baisse de couverture doit être justifiée.

---

## Étape 0 — Mise à niveau documentaire (petite)

- **Déjà fait** : `docs/` et `CLAUDE.md` commités et poussés ; `PROMPT.md` supprimé.
- **Reste** : restaurer `docs/schema-mysql-cave-a-vin.md` depuis 91a8e0b ; corriger
  `CLAUDE.md` (`DOCS/` → `docs/`, PHP 8.2+ → 8.5, retirer « schéma absent ») ; supprimer la
  branche locale `feat/socle` si l'utilisateur confirme.
- **Fin** : fichier schéma présent et identique à 91a8e0b (`git diff 91a8e0b -- docs/schema…`
  vide) ; `CLAUDE.md` sans référence erronée ; `git status` propre.

## Étape 0b — Outillage de tests (avant toute fonctionnalité)

- **Périmètre** :
  - PHP : suites PHPUnit séparées `unit` / `integration` / `http` ; base MySQL de test
    dédiée dans la doublure Docker (créée par les migrations, vidée entre les tests) ;
    script `composer test:coverage` (Xdebug en local ; dans l'image Docker, pcov ou Xdebug
    à ajouter — compatibilité PHP 8.5 à vérifier à l'installation).
  - Front : `@vitest/coverage-v8` **à la version exacte de `vitest`** (peer strict : 5.0.x),
    `fake-indexeddb`, script `npm run test:coverage`.
  - E2E : `@playwright/test` (1.63 au 30/09), config ciblant http://localhost:8080,
    script `npm run e2e` ; un premier test e2e réécrit la vérification manuelle du socle
    (page chargée, `/api/health` affiché, 404 enveloppe, `HEAD /api/health`).
- **Fin** : les trois suites PHP, la couverture PHP et front, et `npm run e2e` tournent au
  vert ; un test volontairement faux échoue bien dans chaque suite (preuve que la suite
  exécute réellement), puis est retiré ; README mis à jour (commandes de test).
- **Point ouvert** : MSW (simulation d'API côté front) — utile pour les tests d'écran ;
  version 3.0.1, pairs optionnels (TypeScript ≥ 5.9 : 5.9.3 installé) : à ajouter à
  l'étape 5 si besoin.

## Étape 1 — Schéma et migrations

- **Périmètre** : `fzed51/migration` v3, fichiers `api/migrations/mysql/YYYYMMDD-NN-*.sql`
  (1 instruction chacun) reproduisant **exactement** le schéma v1.0 (11 tables, ENUM, colonne
  générée `anciennete_annee`, `date_dernier_mouvement_applique` déjà incluse, index, FK dont
  RESTRICT sur étagère/carton) ; route `POST /api/internal/migrate` protégée par
  `X-Deploy-Token` (hash_equals), appelant `MigrationCore::run()` sur la connexion PDO de
  l'application (pas d'`exec`, pas de `config_extern` — P28). Pas de `CHECK` (version MySQL 8.0.x exacte non relevée).
- **Hors périmètre** : tout code métier.
- **Fin** : sous Docker, base vide → migrate → 11 tables + `migration_story` ; relance =
  aucune exécution ; sans jeton / mauvais jeton → 401 enveloppe ; test PHPUnit
  (intégration MySQL Docker) comparant `information_schema` au schéma attendu.

## Étape 2 — Authentification (backend, auth-service simulé)

- **Dépendances** : `guzzlehttp/guzzle`, `firebase/php-jwt`, cache PSR-16 **fichier hors
  docroot** (pas d'APCu — Relevé). Env : `AUTH_SERVICE_URL`, `AUTH_CLIENT_ID`,
  `AUTH_CLIENT_SECRET`.
- **Doublure** : service HTTP simulé (conteneur Docker ou routes PHP de test) implémentant le
  contrat Auth §2–4 : `POST /users`, `/users/confirm/resend`, `/sessions`,
  `/sessions/refresh` (usage unique + révocation de famille au rejeu), `GET /users/me`,
  `GET/DELETE /sessions`, `/users/password/forgot` (toujours 202), `/users/password/reset`,
  `POST /users/me/email`, JWKS RS256 avec `kid`.
- **Module `CaveAVin\Auth`** : `AuthServiceClient`, `AccessTokenVerifier` (signature, exp,
  **aud ET iss**, leeway 60 s, re-téléchargement JWKS sur `kid` inconnu), `TokenProvider`
  avec **verrou** (`SELECT … FOR UPDATE` sur `user_sessions`).
- **Session** (Arch §2.2, schéma §1.2) : `user_sessions` stocke le refresh_token + SHA-256
  de l'identifiant opaque ; la PWA ne reçoit que access_token + identifiant opaque ;
  `users` créé/mis à jour à la connexion (`auth_sub`, email via `GET /users/me`).
- **Routes cave-à-vin** (à figer dans le contrat d'API, étape 3) : connexion, rafraîchissement,
  déconnexion de l'appareil, inscription, renvoi du lien, mot de passe oublié, nouveau mot de
  passe (reset_token), changement d'email, profil, liste des appareils + révocation d'un
  appareil (schéma §1.2 point 4).
- **Middleware** PSR-15 : Bearer → vérif → `users.id` → contexte de requête. Exceptions
  publiques : `GET/HEAD /health`, `/auth/callback`, routes de connexion/inscription/oubli,
  `/internal/migrate` (jeton propre).
- **`GET /api/auth/callback`** (= `redirect_uri`) : tous les couples `type`/`status`
  (`user_registration`, `password_reset`, `email_change` × `confirmed`, `already_confirmed`
  traité comme un succès, `expired`, `email_taken`) ; `reset_token` consommé côté serveur puis
  retiré de l'URL (redirection 302), `Referrer-Policy: no-referrer`, aucune ressource tierce.
- **Erreurs** relayées : VALIDATION_FAILED, INVALID_CREDENTIALS, EMAIL_ALREADY_USED,
  NO_PENDING_REGISTRATION, ACCESS_REVOKED (« accès suspendu »), REFRESH_TOKEN_INVALID,
  INVALID_ACCESS_TOKEN, RESET_TOKEN_INVALID, SESSION_NOT_FOUND, RATE_LIMITED (+ `Retry-After`),
  AUTH_SERVICE_UNAVAILABLE ; `UNAUTHORIZED` journalisé comme défaut de configuration.
- **Fin** : tests PHPUnit : JWT valide / expiré / mauvais `aud` / mauvais `iss` / signature
  falsifiée / `kid` inconnu ; refresh nominal ; **deux refresh concurrents → un seul appel
  au service** ; rejeu → toutes sessions révoquées ; chaque couple du callback ; **carve-out
  testé sur ce qu'il refuse** (toute autre route, y compris en `HEAD`, → 401) et sur ce qu'il
  laisse passer (`HEAD /health` → 200, leçon Héb) ; sous Docker, route protégée appelée
  avec `Authorization` via `.htaccess` → 200.

## Étape 3 — Contrat d'API puis API métier

- **3.0 Contrat** : rédiger `docs/contrat-api.md` (Arch §8 : non spécifié) — routes, formats,
  codes d'erreur, **format exact du lot `POST /sync`** et de sa réponse, upload photo.
  **Relu et validé par l'utilisateur avant tout code.**
- **3a Emplacements** : CRUD armoires (+ étagères : nom optionnel, capacité modifiable,
  position), cartons ; suppression d'un emplacement non vide → bouteilles basculées en
  `hors_rangement` (type **et** FK) **dans la même transaction, avant le DELETE** ;
  compteurs d'occupation ; **suggestion d'emplacement** (premier emplacement non complet,
  « autre » = suivant, choix manuel refusé si complet — CdC §3.2).
- **3b Bouteilles** : lecture/édition (note, date d'entrée année+mois stockée au 1er, photo,
  souvenir, domaine, millésime…), régions/cépages créés à la volée + autocomplétion,
  génération de `reference` (24×34^(L-1), verrou sur `reference_sequences`), recherche par
  référence, `date_limite_consommation` calculée à la création.
- **3c Mouvements et catégories** : entrée (unitaire et **en masse** : N bouteilles,
  `lot_ajout_id`, note copiée), déplacement, sortie irréversible + motif ; mise à jour
  conditionnelle par `date_dernier_mouvement_applique` (Arch §4.5) ; capacité dépassée →
  hors rangement ; CRUD catégories (unicité générique vérifiée en applicatif) ; recalcul
  **synchrone** des DLC quand `duree_garde_annees` change ; résolution spécifique > générique ;
  recherche repas (type + région + cépage, tris « à boire en priorité » — 20 premières —
  et « par âge », drapeaux souvenir/urgent) ; manques (quantité manquante + suggestions tirées
  de l'historique, du plus récent au plus ancien).
- **3d Sync, photos, export** : `POST /sync` (transaction, idempotence `(user_id,
  client_ref)`, mutation dont la bouteille n'existe pas encore → rejet propre, réponse
  `client_ref` → id/référence) ; upload photo par `client_ref` rejouable (orientation EXIF,
  recompression GD, `{user_id}/{reference}.jpg` + `_thumb.jpg`, **stockage hors docroot,
  servi par une route authentifiée** pour préserver l'isolation ; duplication par bouteille
  en ajout en masse) ; `GET /api/export` (ZIP `data.json` clés `reference` + `photos/`).
- **Fin (3 entière)** : tests PHPUnit par Action ; **test d'isolation** : l'utilisateur B
  reçoit 404 sur chaque ressource de A, pour chaque route ; même lot `/sync` envoyé deux fois
  → aucun doublon ; conflit deux appareils → état final = mouvement le plus récent, les deux
  mouvements en historique ; suppression d'étagère non vide ; export ouvert et vérifié.
  Chaque sous-étape 3a–3d est commitée séparément ; l'étape 3 n'est finie qu'avec 3d.

## Étape 4 — Composants de base du design system (parallélisable avec 1–3)

- **Périmètre** : `app/components/` enveloppant les classes `ivt-*` existantes, sans CSS
  nouveau ni couleur en dur : Button (primary/secondary/danger/quiet, block), Badge (6 types
  avec pastille, souvenir, urgent) + Pastille, BottleCard (« non millésimé », `ivt-ref`,
  sélection), ShelfGrid (une ligne = une étagère ; alvéoles libre / occupée `data-wine` /
  proposée en dessin ; l'étagère entière est la cible, sélectionnée, pleine → désactivée)
  et Armoire (étagères empilées, légende), Field (libellé visible, `--reference`, erreur
  `aria-describedby`), SegmentedControl (`radiogroup`), BottomNav (5 entrées, Ajouter avec
  `aria-label`, pastille Manques, `aria-current`), Banner (existant, déplacé), Sheet
  (`ivt-sheet`), jeu d'icônes SVG inline (24/16 px, `currentColor`). Page `/catalogue`
  chargée seulement si `import.meta.env.DEV` (import dynamique).
- **Fin** : un fichier de test par composant (rôles ARIA, états, clavier) ; après
  `npm run build`, aucune chaîne du catalogue dans `dist/` (grep) ; `/catalogue` contrôlé
  dans Chrome en clair **et** sombre ; grep : aucune couleur hex ni `font-family` hors
  `app/design/` ; cibles ≥ 44 px ; textes conformes (français, casse de phrase, infinitif,
  sans emoji ni exclamation).

## Étape 5 — Fondations front : session, offline, sync

- **Périmètre** : routage + coque (BottomNav) ; écrans connexion, inscription (+ renvoi du
  lien), mot de passe oublié (message anti-énumération), nouveau mot de passe, retours du
  callback ; client API (access_token en mémoire, identifiant opaque persistant, refresh
  transparent **un seul à la fois côté client aussi**) ; Dexie : cache de lecture
  (refetch complet, pas de migration), file de mutations (`client_ref`, `schemaVersion`,
  chaîne v1→v2…), photos en `Blob` + `createObjectURL` ; moteur de sync (déclenché au retour
  réseau, créations avant mouvements, écriture de la correspondance `client_ref` → id,
  upload photo différé) ; bandeau hors ligne / en attente ; thème manuel prioritaire
  (`localStorage` « theme », DS §Intégration) ; icônes PWA si fournies.
- **Fin** : tests Vitest (chaîne de migration, idempotence du rejeu, refresh unique en
  concurrence, reprise après coupure) ; scénario Chrome : connexion (simulé) → réseau coupé →
  rechargement OK (service worker) → mutation en file → réseau rétabli → envoyée une seule
  fois, visible côté serveur.

## Étape 6 — Cave, emplacements, fiche bouteille

- **Périmètre** : vue cave globale hiérarchique (Armoire > Étagère > bouteilles, + Cartons,
  + Hors rangement) ; vue visuelle **par armoire uniquement** (ShelfGrid) ; CRUD armoires /
  étagères / cartons ; vue « Hors rangement » avec actions directes Déplacer / Sortir ;
  recherche par référence ; fiche bouteille (tous attributs, badges, historique des
  mouvements, édition, photo) ; Déplacer (feuille de choix : proposition, « Autre
  emplacement », « Choisir manuellement », refus « Étagère complète : 12 alvéoles sur 12… ») ;
  Sortir (motif obligatoire, confirmation en feuille basse, bouton danger).
- **Fin** : scénarios Chrome joués **en ligne puis hors ligne** : créer une armoire à
  2 étagères, déplacer vers hors rangement puis retour, sortir avec motif, supprimer une
  étagère non vide → bouteilles en hors rangement, retrouver une bouteille par sa référence ;
  tests Vitest des écrans clés.

## Étape 7 — Ajout de bouteilles

- **Périmètre** : depuis « + » global (suggestion) ou depuis un emplacement (pré-rempli) ;
  unitaire et en masse (N, blocage si capacité insuffisante) ; autocomplétion région/cépage ;
  millésime optionnel ; date d'entrée année+mois (défaut = mois courant) ; origine ; note ;
  souvenir ; photo (Canvas ~1600 px, **JPEG**, miniature) ; brouillon persisté dans
  IndexedDB **si confirmé** ; affichage des références attribuées (voir point ouvert
  « référence hors ligne »).
- **Fin** : scénario Chrome : ajout de 6 bouteilles en masse hors ligne avec photo → retour
  réseau → 6 références uniques, 6 fichiers photo distincts + miniatures ; blocage de
  capacité vérifié ; tests Vitest (formulaire, compression avec canvas simulé).

## Étape 8 — Repas, manques, catégories, réglages, export

- **Périmètre** : Repas (filtres type + région + cépage, SegmentedControl des deux tris,
  badges souvenir et « À boire d'urgence ») ; Manques (pastille dans la navigation, écran
  titre-1, quantité manquante, suggestions historiques) ; CRUD catégories (seuil, durée de
  garde) ; Réglages : thème, compte (profil, changement d'email, mot de passe via le flux de
  réinitialisation, appareils connectés + révocation, déconnexion), export (réseau requis,
  message sinon).
- **Fin** : scénarios Chrome : passer une catégorie sous son seuil → pastille + écran ;
  changer une durée de garde → dates limites et tri mis à jour ; export téléchargé et contenu
  vérifié ; tests Vitest.

## Étape 9 — Déploiement continu et recette finale

- **Périmètre** : GitHub Actions sur chaque push `main` : lint/stan/test sur le commit
  expédié, `composer install --no-dev --optimize-autoloader` dans `api/`, `npm run build`,
  `.env` généré depuis les secrets (jamais journalisé), upload de `api/` et `dist/` **frères**
  (exclusions : tests, sources front, fichiers de dev), `POST /api/internal/migrate`, smoke
  test `GET` **et** `HEAD /api/health` ; sous-domaine Multisite → `dist/` ; dossiers logs,
  cache JWKS et photos hors docroot créés.
- **Recette** : parcours Auth §5 avec les **vrais identifiants** (inscription, email en boîte
  de réception, callback, connexion + `kid`, `/users/me`, refresh puis rejeu → 401) ;
  `Authorization` vérifié en production ; parcours complet sur les deux comptes ; contrôle
  d'isolation ; bandeau de mise à jour après un second déploiement ; matrice ci-dessous
  cochée avec une preuve par ligne.
- **Fin** : un commit déployé sans action manuelle ; toutes les lignes de la matrice
  prouvées ; écarts restants listés. Sans identifiants auth-service, l'étape reste ouverte.

---

## Matrice de couverture

| Exigence (source) | Étapes |
|---|---|
| Armoires/étagères/cartons, capacité bloquante (CdC 2.1, 3.1) | 3a, 6 |
| Vue globale hiérarchique + vue visuelle par armoire (CdC 3.1) | 6 |
| Suppression non vide → hors rangement (CdC 3.1, schéma §5) | 3a, 6 |
| Suggestion / autre / manuel (CdC 3.2) | 3a, 6, 7 |
| Attributs bouteille, date d'entrée, souvenir (CdC 2.2) | 3b, 6, 7 |
| Référence courte + recherche par code (CdC 2.3) | 3b, 6 |
| Entrée unitaire / en masse, photo dupliquée (CdC 3.3, Arch 5.3) | 3c, 7 |
| Sortie irréversible + motif (CdC 3.4) | 3c, 6 |
| Déplacement, vue Hors rangement (CdC 3.5) | 3c, 6 |
| Repas : filtres, tris, badges (CdC 3.6) | 3c, 8 |
| Catégories, résolution, DLC (CdC 2.5, 3.9) | 3c, 8 |
| Alerte de manque (CdC 3.7) | 3c, 8 |
| Compte : profil, mot de passe, déconnexion (CdC 3.9, Auth 2) | 2, 5, 8 |
| Export ZIP (CdC 3.9, Arch 7) | 3d, 8 |
| 100 % hors ligne + sync + photos différées (CdC 4, Arch 4–5) | 3d, 5, 6, 7 |
| Conflits multi-appareils (Arch 4.5) | 3c, 3d |
| Isolation stricte (CdC 4) | 2, 3, 9 |
| Auth : aud+iss, verrou, callback, anti-énumération (Arch 2, Auth) | 2, 5, 9 |
| PWA prompt + update horaire (Arch 4.4) | socle, 9 |
| Design system, composants, thèmes (DS) | 4, 5–8 |
| CD, migrations, correctif Authorization (Arch 6.6–6.7, Héb) | 1, 2, 9 |

---

## Contradictions entre documents (à trancher, je ne choisis pas seul)

1. **Transport de déploiement** : Arch §6.6 et Héb disent « FTP en clair, FTPS refusé, pas
   de SFTP » ; le Relevé du 26/09 (plus récent) dit « FTP en clair refusé, SFTP
   fonctionne ». Bloque l'étape 9.
2. **Format photo stocké** : Arch §5.2 décide « JPEG conservé » ; le Relevé recommande
   « retenir WebP ». Le plan suit Arch (source des décisions) sauf avis contraire.
3. `CLAUDE.md` : PHP 8.2+ et `DOCS/` (corrigés à l'étape 0) ; Relevé : PHP 8.3.31 (périmé,
   réglage actuel 8.5).

## Points ouverts (étape bloquée entre parenthèses)

- **Référence hors ligne** (3b, 7) : la référence est générée par le serveur (séquence
  verrouillée), mais le CdC veut la recopier sur l'étiquette dès la création ; hors ligne,
  elle n'existe qu'après la sync. Afficher « en attente de synchronisation » ? Autre choix ?
- **Nom de domaine et `redirect_uri`** (2, 9) : sous-domaine de l'app (ex.
  `cave.fzed51.com`) → `redirect_uri` = `https://<domaine>/api/auth/callback`, à fixer pour
  la demande d'identifiants.
- **Durée de vie de l'identifiant opaque** (2, 5) : 30 jours glissants proposé (Arch §4.3).
- **Brouillon de saisie persisté en continu** (7) : à confirmer (Arch §4.4).
- **Capacité réduite sous l'occupation actuelle** (3a) : refuser, ou basculer l'excédent en
  hors rangement ? Non spécifié.
- **Comptage d'une catégorie générique** (3c) : un seuil « Rouge » compte-t-il aussi les
  rouges couverts par une catégorie spécifique « Rouge + Bordeaux » ? Non spécifié.
- **Emplacements et catégories hors ligne** (3d, 5) : le schéma ne donne `client_ref` qu'aux
  bouteilles et mouvements ; CdC §4 n'exige hors ligne que consultation, ajout, sortie,
  déplacement → CRUD emplacements/catégories en ligne uniquement ? À confirmer.
- **Alvéoles** : le schéma compte l'occupation par étagère, sans position d'alvéole ; la
  ShelfGrid affichera donc N alvéoles occupées sur la capacité, sans position réelle.
- **Changement de mot de passe** : auth-service n'offre que le flux de réinitialisation
  (révoque toutes les sessions, toutes applications) ; c'est ce que le plan utilise.
- **Rotation des journaux** (2) : pas de logrotate (Héb) ; journal simple (Arch §6.5) ou
  fichier par jour comme auth-service ?
- Hébergement : même compte OVH qu'auth-service ? version MySQL 8.0.x exacte (CHECK) ?
  sauvegarde MySQL automatique ? icônes PWA à fournir (sinon non installable).
- Cosmétique : espace autour des boutons du bandeau de mise à jour (`ivt-row`).
