# Architecture Technique — Cave à Vin

**Version 1.0** — consolide les décisions prises en discussion technique, en complément de
`cahier-des-charges-fonctionnel-cave-a-vin.md` (périmètre fonctionnel) et
`auth-service-integration.md` (référence du service d'authentification).

---

## 1. Vue d'ensemble

| Composant | Choix |
|---|---|
| Frontend | PWA — React + TypeScript + Vite (`vite-plugin-pwa` pour service worker/manifest) |
| Backend | API REST PHP + MySQL, hébergement mutualisé OVH |
| Stockage hors-ligne | IndexedDB (Dexie.js) + file d'attente de synchronisation |
| Photos | Fichier sur disque serveur, chemin référencé en base (pas de base64 en base) |
| Authentification | Service tiers `fzed51/auth-service`, intégration B2B server-to-server |
| Comptes | Isolation stricte, un compte = une cave, aucun partage — pas de gestion de conflits multi-utilisateurs |

---

## 2. Authentification

### 2.1 Modèle

`auth-service` authentifie les utilisateurs finaux (email + mot de passe) pour le compte de
l'application cave à vin. L'intégration est server-to-server : c'est le backend PHP qui
parle à `auth-service`, jamais la PWA. Chaque route d'`auth-service` exige
`X-Client-Id`/`X-Client-Secret`, qu'un navigateur ne peut pas porter sans le compromettre —
c'est cette contrainte de transport, et elle seule, qui impose le passage par le backend.

**Couplage nul avec le code d'`auth-service`.** cave-a-vin consomme `auth-service`
uniquement comme un service HTTP tiers (API REST), jamais comme dépendance Composer :
pas de `vendor/` partagé, pas de classes réutilisées. Les deux projets peuvent donc
diverger librement sur leurs propres choix de librairies (versions de `fzed51/migration`
notamment, §6.7) sans aucune conséquence l'un sur l'autre — la seule surface de contact
est le contrat HTTP décrit ci-dessous.

**Prérequis de mise en service** :
- `client_id`/`client_secret`/`redirect_uri` transmis à la main par l'exploitant du
  service (pas de registre en self-service) ;
- le `redirect_uri` doit être un endpoint développé côté cave à vin **avant** la demande
  d'enregistrement — son URL est fixée au moment de l'enregistrement.

### 2.2 Session PWA ↔ backend

**Principe retenu** : l'access_token et le refresh_token d'`auth-service` ne sont pas
traités de la même façon, selon leur niveau de risque — pas parce qu'`auth-service` "ne
gère pas de session" (il en gère une, celle de l'utilisateur), mais pour deux raisons
propres à chaque token :

- **`access_token`** transmis tel quel à la PWA. Auto-porteur, vérifié localement par le
  backend (JWKS, §2.4 ci-dessous) — aucun lookup en base sur les appels courants. Valide
  15 minutes : une fuite a un impact limité.
- **`refresh_token`** reste exclusivement côté serveur, dans une table `user_sessions`
  (une ligne par connexion = par appareil). Deux raisons : sa rotation doit être
  sérialisée pour éviter la révocation en cascade en cas de rejeu (§2.4
  d'`integration.md`) — risque réel ici, la file de synchro offline pouvant se réveiller
  en parallèle d'un onglet resté ouvert — et un credential valide 30 jours a une surface
  d'exposition bien plus grande dans un stockage client persistant par nature
  (IndexedDB, offline) qu'en base serveur.

**Flux résultant :**

| Étape | La PWA envoie | Le backend fait |
|---|---|---|
| Connexion | email + mot de passe | `POST /sessions` sur `auth-service`, crée la ligne `user_sessions`, renvoie l'`access_token` + un identifiant opaque |
| Appel normal | `Authorization: Bearer <access_token>` | vérifie le JWT localement (JWKS), sert la requête |
| Rafraîchissement | l'identifiant opaque | retrouve la ligne, verrouille, appelle `POST /sessions/refresh`, met à jour la ligne, renvoie un nouvel `access_token` |
| Déconnexion d'un appareil | — | supprime la ligne `user_sessions` correspondante ; l'access_token déjà émis reste valide jusqu'à 15 min max (limite du service) |

### 2.3 Points de vigilance retenus pour l'implémentation

- **Vérifier `aud` ET `iss`**, pas seulement la signature — sinon un token valide émis
  pour une autre application cliente du même service (multi-tenant) serait accepté.
- **Sérialiser la rotation du refresh_token** (verrou par utilisateur, type
  `TokenProvider` d'`integration.md` §3.4) — non négociable, pas une optimisation.
- **Ne jamais utiliser l'access_token comme clé de déduplication ou de session en base** :
  deux tokens émis la même seconde pour le même utilisateur sont strictement identiques
  (RS256 déterministe, pas de `jti`).
- **`already_confirmed` est un cas normal**, pas une erreur, à traiter avec le même ton
  que `confirmed` dans la page de retour.
- **`ACCESS_REVOKED` est déclenché manuellement par l'exploitant du service** — rien à
  construire côté cave à vin pour ça (pas d'écran d'admin prévu pour ce mécanisme).

---

## 3. Schéma de données

Le détail complet (DDL, contraintes, index) est dans `schema-mysql-cave-a-vin.md` — ce
document en reste la source de vérité. Vue d'ensemble des tables :

| Table | Rôle |
|---|---|
| `users` | Lien entre `auth_sub` (identité `auth-service`) et le compte cave à vin |
| `user_sessions` | Une ligne par appareil connecté ; stocke uniquement le refresh_token (§2.2) |
| `armoires`, `etageres`, `cartons` | Emplacements ; "hors rangement" n'a pas de table (représenté par des FK nulles) |
| `regions`, `cepages` | Référentiels évolutifs, par utilisateur |
| `categories` | Type + région optionnelle, seuils et durée de garde ; résolution générique/spécifique en lecture |
| `bouteilles` | Entité centrale ; `client_ref` pour la dédup offline (§4.2), `date_limite_consommation` dénormalisée pour le tri "à boire en priorité" |
| `mouvements` | Historique entrée/sortie/déplacement ; `client_ref` idem |
| `reference_sequences` | Compteur par utilisateur pour la génération séquentielle des références bouteille |

Points de conception notables :
- `bouteilles.etagere_id`/`carton_id` en `ON DELETE RESTRICT` — la bascule vers "hors
  rangement" lors de la suppression d'un emplacement non vide (§3.1 du cahier des
  charges) est gérée par l'application, pas par une cascade SQL, pour garder
  `emplacement_type` cohérent avec les deux colonnes.
- Piège MySQL identifié : un index `UNIQUE` sur `(user_id, type, region_id)` dans
  `categories` ne bloque pas les doublons quand `region_id IS NULL` (NULL ≠ NULL) —
  l'unicité de la catégorie générique doit être vérifiée côté application.
- Compatibilité des `CHECK` constraints avec la version MySQL réelle de l'offre OVH
  mutualisée (moteur confirmé — MySQL, pas MariaDB — reste la version exacte à
  vérifier avant la mise en production) ; à défaut, enforcement applicatif uniquement.

---

## 4. Offline-first et synchronisation

### 4.1 Principe

Consultation, ajout, sortie et déplacement doivent fonctionner sans réseau (exigence du
cahier des charges §4). Les mutations créées hors-ligne sont stockées dans IndexedDB et
rejouées via une file de synchronisation au retour réseau.

### 4.2 Idempotence

`bouteilles.client_ref` et `mouvements.client_ref` (UUID généré côté client à la
création, contrainte `UNIQUE (user_id, client_ref)`) permettent à la file de synchro de
rejouer un envoi (retry réseau) sans dupliquer la donnée — nécessaire dès qu'on accepte
que la même requête de synchro puisse partir plusieurs fois.

**Versionnage des mutations en file.** Une mutation peut rester en file au-delà d'un
déploiement (PWA + API redéployées ensemble à chaque push, §6.6) : le code qui la
traite au retour réseau peut ne plus être celui qui l'a écrite. Le versionnage natif de
Dexie (`db.version(N).upgrade()`) migre en bloc, une fois, à l'ouverture de la base — ce
qui ne couvre pas le cas de deux onglets ouverts, où l'un encore sur l'ancienne version
de l'app écrit une nouvelle mutation *après* que la migration a déjà tourné dans
l'autre. **Décision** : chaque mutation en file porte un `schemaVersion` propre ; le
code de traitement applique une chaîne de fonctions de migration (v1→v2→v3...) avant
l'envoi, plutôt que de supposer la forme à jour. Limité à la file de synchro — le cache
de lecture hors ligne, lui, est plus simple à invalider et refetch entièrement qu'à
migrer enregistrement par enregistrement, puisqu'il est reconstructible depuis le
serveur.

### 4.3 Interaction avec l'authentification

Point encore ouvert : la durée de vie de l'identifiant opaque de session côté PWA
(§2.2) doit être choisie en cohérence avec des coupures réseau potentiellement longues —
sans quoi la file de synchro pourrait se retrouver bloquée par une session expirée au
retour en ligne. Probablement à aligner sur les 30 jours glissants du refresh_token
plutôt que sur les 15 minutes de l'access_token.

### 4.4 Mise à jour de la PWA

Un déploiement a lieu à chaque push sur `main` (§6.6) — un utilisateur avec la PWA déjà
ouverte peut donc se retrouver avec un service worker qui sert une version JS périmée.
**Décision** : `vite-plugin-pwa` en mode `prompt` plutôt qu'auto-update silencieux — un
bandeau "nouvelle version disponible" laisse l'utilisateur choisir le moment du
rechargement, plutôt que de risquer d'interrompre une saisie en cours (ajout de
bouteille, photo en cours de capture) par un rechargement imposé.

Deux points à corriger dans cette décision, identifiés en la challengeant :
- **Vérification périodique explicite requise** : un navigateur ne revérifie une mise à
  jour du service worker qu'à la navigation/au rechargement de page, pas en continu sur
  un onglet resté ouvert — fréquent pour une PWA installée. Sans un
  `setInterval(() => registration.update(), ...)` (toutes les heures par exemple), le
  bandeau peut ne jamais se déclencher sur une session longue, rendant la décision
  inopérante en pratique.
- **La justification dépend de la persistance en continu du brouillon de saisie** :
  l'argument "on évite de perdre une saisie en cours" ne tient que si le formulaire
  d'ajout écrit son état dans IndexedDB au fil de l'eau, pas seulement à la validation.
  À confirmer explicitement plutôt qu'à supposer implicitement.

### 4.5 Conflits multi-appareils (même compte)

L'isolation stricte (§1 de ce document) élimine les conflits *entre comptes*, mais pas
*entre appareils d'un même compte* : `user_sessions` anticipe déjà explicitement
plusieurs appareils connectés simultanément (§2.2). Deux scénarios concrets — la même
bouteille déplacée puis sortie depuis deux appareils différents hors ligne, ou deux
bouteilles placées dans le même emplacement depuis deux appareils qui le croient libre
— se résolvent par **un seul mécanisme**, pas deux règles séparées.

**Décision** : chaque `mouvement` porte déjà un `date_mouvement` fourni par le client
(l'horodatage réel de l'action, pas celui de la synchro). L'état courant d'une
bouteille (`bouteilles.emplacement_type`/`etagere_id`/`carton_id`/`statut`) n'est mis à
jour que si le mouvement traité est plus récent que le dernier déjà appliqué — une
écriture conditionnelle par horloge logique, pas un tri préalable du lot (qui ne
protégerait pas contre deux requêtes `/sync` réellement concurrentes venant de deux
appareils) :

```sql
UPDATE bouteilles
SET emplacement_type = :t, etagere_id = :e, carton_id = :c, statut = :s,
    date_dernier_mouvement_applique = :dm
WHERE id = :bid
  AND (date_dernier_mouvement_applique IS NULL OR date_dernier_mouvement_applique < :dm)
```

Ça ne demande **aucun verrou** — contrairement à la rotation du refresh_token (§2.3),
qui en a besoin parce qu'on ne contrôle pas la sémantique atomique d'`auth-service` ;
ici le schéma nous appartient, la comparaison tient dans l'instruction SQL elle-même.
Le mouvement est de toute façon inséré dans la table historique append-only (§3),
quel que soit le résultat de cette mise à jour — rien n'est jamais perdu, seul l'état
courant dérivé peut différer de l'ordre d'arrivée réseau.

**Dépassement de capacité** : une mutation de placement qui violerait la capacité
bloquante (§2.1 du cahier des charges) est redirigée vers "hors rangement" plutôt que
rejetée — la bouteille y apparaît naturellement au prochain passage de l'utilisateur
(écran déjà prévu, §3.1), sans mécanisme de notification dédié à construire.

**Résidu accepté, non technique** : une dérive d'horloge entre deux appareils
personnels pourrait, rarement, inverser l'ordre logique. Assumé plutôt que traité —
synchroniser les horloges ajouterait une complexité disproportionnée pour ce risque, à
cette échelle d'usage.

**Conséquence sur le schéma** : nécessite l'ajout de la colonne
`bouteilles.date_dernier_mouvement_applique` (`DATETIME NULL`), absente de
`schema-mysql-cave-a-vin.md` — à faire.

---

## 5. Gestion des photos

### 5.1 Capture côté PWA

- Compression/redimensionnement client (Canvas API, ~1600 px de côté max) avant mise en
  attente offline, pour ne pas saturer le quota de stockage IndexedDB avec des photos
  brutes de smartphone (5-10 Mo).
- **Format JPEG imposé à la capture** — pas pour sa compression (WebP compresse mieux à
  qualité égale, 25-35 %), mais parce que Safari/iOS ne supporte toujours pas
  l'encodage WebP via `canvas.toBlob()` (vérifié : Safari 26.3 à 26.5, non supporté),
  alors que le décodage/affichage WebP fonctionne partout. C'est une contrainte de
  compatibilité de capture, pas un choix de compression.
- Stockée en `Blob` dans IndexedDB, affichée immédiatement via
  `URL.createObjectURL()` ; entrée ajoutée à la file de synchro, associée au
  `client_ref` de la bouteille (pas à son id serveur, qui n'existe pas encore hors
  ligne).
- Upload rejouable sans risque en cas de retry (contrairement à la création de
  bouteille, un upload de photo rejoué écrase simplement le même fichier).

### 5.2 Traitement côté serveur

- Correction de l'orientation EXIF, recompression (GD ou Imagick, standard sur
  mutualisé OVH).
- Chemin : `{user_id}/{reference}.jpg` — la référence bouteille plutôt que l'id
  numérique, pour rester lisible directement sur le disque.
- Miniature générée à l'upload par convention de nom (`{reference}_thumb.jpg`), pas de
  colonne dédiée en base.
- **JPEG conservé aussi au stockage**, pas de ré-encodage WebP côté serveur : AVIF est
  confirmé non supporté par la version d'ImageMagick des hébergements mutualisés OVH
  (source : forum communautaire OVH, 2026, sans date de correction annoncée) ; le
  support WebP de GD dépend de la compilation PHP spécifique de l'offre et reste à
  vérifier (`gd_info()`) — et le gain (25-35 %) ne pèse pas lourd en absolu pour une
  cave à deux utilisateurs. Décision : ne pas complexifier le pipeline pour ça
  maintenant, revisiter seulement si le quota disque devient un problème réel.

### 5.3 Ajout en masse

La photo du formulaire commun (§3.3 du cahier des charges) doit être **dupliquée en
fichier distinct par bouteille** dès la création du lot — contrairement à la note
(texte, copiée telle quelle), sans quoi éditer la photo d'une bouteille du lot
écraserait celle des autres.

---

## 6. Architecture serveur (backend PHP)

Vu l'échelle du projet (2 utilisateurs, hébergement mutualisé), pas de sur-architecture :
une découpe simple suffit, et plusieurs contraintes du mutualisé OVH ferment d'elles-mêmes
certaines options.

### 6.1 Structure du projet

Reprend l'organisation du template `fzed51/template-php-react`. Fabien l'a déjà fait
fonctionner concrètement, mais avec des ajustements qui n'ont pas été répercutés dans
le dépôt — le README seul ne suffit donc pas à reproduire l'état qui a fonctionné.
**À faire à l'implémentation** : identifier et refaire ces ajustements plutôt que de
supposer que le dépôt tel quel suffit.

```
├── app/                    # Code source de la PWA (React + TS + Vite)
│   ├── components/
│   ├── pages/
│   └── ...
├── api/                    # Code source du backend PHP
│   ├── bootstrap.php       # Point d'entrée réel de l'API
│   ├── router.php          # Définition des routes
│   └── CaveAVin/           # Code métier, organisé par domaine
└── public/                 # "publicDir" Vite — servi tel quel en dev (`php -S ... -t public`)
    └── api/
        └── index.php       # Front controller : require du bootstrap de api/
```

`public/` n'est **pas** lui-même le docroot de production — c'est `dist/`, généré par
`vite build`, qui l'est. Vite construit la PWA (bundles JS/CSS hachés, `index.html`)
**et** recopie le contenu de `public/` tel quel dans `dist/`, en conservant la même
profondeur : `public/api/index.php` devient `dist/api/index.php`, exactement au même
niveau relatif. Comme `api/bootstrap.php` reste un frère de `dist/` (comme il l'était de
`public/` dans le dépôt source), le `require` relatif de `index.php` continue de
pointer au bon endroit sans aucune adaptation — **à condition que le déploiement
conserve `api/` et `dist/` comme deux dossiers frères**, exactement comme `api/` et
`public/` le sont dans le dépôt. C'est une contrainte pour le pipeline de CD (§6.6), pas
juste un détail de build.

- `public/api/index.php` (donc `dist/api/index.php` une fois buildé) est le seul point
  de contact entre les deux projets.
- La PWA appelle `/api/*` pour atteindre le backend — même origine, cohérent avec
  l'absence de configuration CORS déjà retenue pour ce projet.
- Une règle `.htaccess` dans `dist/` route `/api/*` vers `dist/api/index.php` (front
  controller), et tout le reste vers `index.html` (routage côté client de la PWA).
  C'est aussi l'endroit où poser le correctif `Authorization` du §6.6 — sur la route
  `/api/*` exclusivement, le reste de la PWA n'ayant pas besoin de cet en-tête.

**Un écart, tranché** : le template utilise SQLite. Cave à vin reste sur **MySQL** (§1
de ce document), **fourni par OVH** — confirmé — tout le schéma déjà écrit dans
`schema-mysql-cave-a-vin.md` en dépend (`ENUM`, colonnes générées, etc., sans
équivalent direct en SQLite). On ne reprend du template que la structure de dossiers,
pas le moteur de base.

**Framework, tranché** : Slim Framework (routage) **et** PHP-DI (injection de
dépendances), comme le template, avec le bridge officiel `php-di/slim-bridge` — il
remplace la création d'app Slim par défaut par une version où le conteneur PHP-DI
résout directement les contrôleurs (autowiring par constructeur), plutôt que de câbler
manuellement chaque route. Le middleware d'authentification (§6.3) et le contrat
d'erreur uniforme (§6.8) s'écrivent comme middlewares PSR-15 standard, enregistrés via
`$app->add(...)`.

### 6.2 Organisation en couches

- **Contrôleurs** — un par ressource (bouteilles, mouvements, emplacements, catégories,
  auth). Le cerveau qui orchestre : reçoit la requête HTTP, valide les données
  d'entrée, invoque la ou les Actions correspondantes, met en forme la réponse (y
  compris le contrat d'erreur uniforme, §6.8). Aucune logique métier propre — seul
  endroit du backend qui touche à Request/Response PSR-7.
- **Actions** — une classe par cas d'usage (`CreerBouteilleAction`,
  `DeplacerBouteilleAction`, `RecalculerDateLimiteAction`...), en PHP pur, sans
  dépendance à la couche HTTP — testable sans mock de requête/réponse. C'est là que vit
  la logique métier : résolution générique/spécifique des catégories (§2.5), génération
  de la référence (§2.3), bascule vers "hors rangement" (§3.1), écriture conditionnelle
  par horloge logique (§4.5). Le recalcul de `date_limite_consommation` reste
  synchrone, exécuté par l'Action qui modifie `duree_garde_annees`.
- **Repositories** — accès aux données, une classe par table ou groupe de tables
  proches (ex. un seul repository pour armoires/étagères/cartons).

**Classes de base : selon l'élément, pas une règle uniforme.** Une base ne se justifie
que par du code réellement partagé, pas comme convention systématique :
- **Repository** — oui, sans hésiter : connexion PDO commune et surtout une méthode de
  scoping `WHERE user_id = ?` partagée par toutes les tables, vu la centralité de
  l'isolation stricte (§1).
- **Contrôleur** — oui aussi : mise en forme de réponse (succès et enveloppe d'erreur
  uniforme, §6.8) partagée par tous.
- **Middleware** — non : Slim (§6.1) consomme nativement du PSR-15
  (`Psr\Http\Server\MiddlewareInterface`) ; une classe de base maison par-dessus irait
  contre l'intérêt d'avoir choisi un framework qui respecte les standards PHP.
- **Action** — pas tranché par anticipation : un simple contrat (interface `execute()`)
  suffit tant qu'aucun code partagé concret n'émerge entre actions. Une classe de base
  se justifiera si une logique commune apparaît en cours de développement (ex. vérifier
  l'appartenance d'une entité à l'utilisateur courant avant chaque action) — pas avant.

Le module d'intégration `auth-service` (`AuthServiceClient`, `AccessTokenVerifier`,
`TokenProvider` — `integration.md` §3) s'intègre à part (`App\Auth`), appelé depuis un
middleware placé devant les contrôleurs.

### 6.3 Middleware d'authentification

Exécuté avant chaque contrôleur, sauf la route publique de retour de confirmation
(`/auth/callback`, `integration.md` §3.5) :
1. extrait le `Bearer` de l'en-tête `Authorization` ;
2. vérifie le JWT localement (`AccessTokenVerifier`) ;
3. résout `sub` → `users.id` local (crée la ligne `users` au besoin, au premier login) ;
4. injecte l'utilisateur courant dans le contexte de requête, pour que chaque
   contrôleur/repository applique l'isolation stricte (`WHERE user_id = ?`) sans avoir à
   y repenser à chaque fois.

### 6.4 Endpoint de synchronisation offline

Le point le plus spécifique à ce projet côté serveur. Conception retenue :

- **Un seul endpoint** (`POST /sync`) acceptant un lot de mutations plutôt qu'un appel
  par mutation — moins de requêtes au retour réseau, et traitement du lot dans une
  transaction.
- **Rejeu idempotent** via `client_ref` (§4.2) : chaque mutation du lot est insérée avec
  vérification préalable sur `(user_id, client_ref)`, pour qu'un lot renvoyé après une
  coupure réseau réponde à l'identique sans dupliquer.
- **Ordre de traitement** : la PWA envoie les créations de bouteilles avant les
  mouvements qui les concernent (elle connaît l'ordre chronologique réel) ; le serveur
  se contente de rejeter proprement une mutation dont la bouteille référencée
  (`client_ref`) n'existe pas encore, plutôt que de tenter de réordonner lui-même.
- **Réponse** : la correspondance `client_ref` → id serveur pour chaque entité créée,
  que la PWA écrit ensuite dans IndexedDB pour remplacer ses références temporaires.

### 6.5 Contraintes du mutualisé OVH

- **Pas de processus long ni de tâche de fond persistante** : chaque requête PHP est
  stateless (PHP-FPM classique). D'où la décision en §6.2 de recalculer
  `date_limite_consommation` en synchrone plutôt que via un worker.
- **Pas de WebSocket ni de connexion persistante** — cohérent avec un modèle où la
  synchro est toujours à l'initiative de la PWA, jamais poussée par le serveur.
- **Journalisation** : pas de supervision dédiée disponible sur du mutualisé — un
  fichier de log applicatif suffit pour tracer les `UNAUTHORIZED` et autres anomalies de
  configuration (§2.3) ; une alerte email envoyée depuis le script de log est une option
  simple à ce niveau d'usage.
- **Secrets** (`AUTH_CLIENT_SECRET`, identifiants MySQL) via `.env` hors du webroot ou
  variables d'environnement de l'espace client OVH — jamais versionnés.

### 6.6 Déploiement continu (CD)

Réutilise le pipeline déjà validé pour `auth-service` sur le même type d'hébergement
(`note-hebergement-mutualise-et-doublure-docker.md`), avec les adaptations propres à ce
projet. **Hypothèse** : même compte OVH mutualisé (offre PERSO, Multisite) — à confirmer
si ce n'est pas le cas, certaines contraintes (quota CRON partagé, etc.) en dépendent.

**Repris tel quel :**
- Déclenchement sur chaque push `main`, pas d'acte de déploiement séparé.
- Vérification (`lint`/`stan`/`test`) rejouée en CI sur le commit exact expédié.
- Secrets (`.env`, config applications) écrits depuis les GitHub Actions Secrets,
  jamais journalisés ni versionnés.
- Upload **FTP en clair** vers la racine du projet (FTPS refusé par le cluster —
  contrainte de plateforme).
- Migrations via un endpoint protégé (`X-Deploy-Token`) plutôt qu'un accès MySQL
  externe — la base n'est pas joignable depuis l'extérieur sur ce type d'offre.
  Instancie `fzed51/migration` directement en PHP (§6.7), pas de CLI shell.
- **« Associer Git » écarté**, pour une raison encore plus forte que pour `auth-service` :
  ce mécanisme ne fait qu'un `git clone` brut, sans `composer install` — et sans build
  frontend, ce qui élimine complètement l'option ici (voir ci-dessous).
- Smoke test sur `GET /health` après déploiement.

**Spécifique à cave à vin :**
- **Deux artefacts à construire en CI**, pas un seul : `vendor/` PHP (dans `api/`,
  `--no-dev --optimize-autoloader`, comme `auth-service`) **et** `dist/`, le résultat
  de `npm run build` (qui inclut déjà `public/api/index.php` recopié dedans, §6.1) —
  les deux uploadés dans le même déploiement.
- **`api/` et `dist/` doivent être déployés comme deux dossiers frères**, exactement
  leur relation dans le dépôt source (§6.1) — sinon le `require` relatif de
  `dist/api/index.php` vers `api/bootstrap.php` ne pointe plus au bon endroit. Le
  sous-domaine Multisite OVH doit pointer sur ce `dist/` déployé (sur le modèle de
  `auth.fzed51.com` → `./auth-service/public`, ici `./cave-a-vin/dist`).
- **PWA et API sur la même origine** (même sous-domaine, même docroot) : `dist/`
  contient à la fois les fichiers statiques de la PWA et le point d'entrée de l'API,
  ce qui évite toute configuration CORS entre la PWA et son propre backend.
- **Aucune tâche CRON nécessaire** (le recalcul de `date_limite_consommation` est
  synchrone, §6.2) — pas de dépendance au quota CRON de l'offre, ni de risque de
  collision avec la tâche planifiée existante d'`auth-service` si le compte est
  partagé.

**Leçon de production à intégrer dès le premier déploiement, pas en correctif après
coup.** L'incident du 11/09/2026 sur `auth-service` — l'en-tête `Authorization`
disparaît en CGI/FastCGI (le SAPI réel du mutualisé), invisible en local où la pile
Docker tourne en `mod_php` — concerne directement le middleware du §6.3 : il lit
exactement cet en-tête pour authentifier les appels de la PWA. Sans la même règle
`.htaccess` (`RewriteCond %{HTTP:Authorization}` + réinjection en
`HTTP_AUTHORIZATION`) et le repli `REDIRECT_HTTP_AUTHORIZATION` dans le front
controller, cave à vin reproduirait l'incident à l'identique dès la mise en production,
malgré des tests locaux et une suite e2e qui passeraient sans rien détecter — exactement
la même illusion de couverture qui a piégé `auth-service`.

**Doublure Docker locale** : contrairement à `auth-service`, pas besoin de simuler
`auth-service` lui-même dans la pile locale — il est déjà en production et joignable ;
un `client_id`/`client_secret` dédié au développement suffit. Web + DB restent à
répliquer à l'identique (même version PHP, même moteur MySQL) pour garder la même
valeur de preuve que la doublure d'`auth-service`.

### 6.7 Migrations de schéma

**Décision, tranchée** : `fzed51/migration` (Packagist, `composer require fzed51/migration`)
— l'outil de migration maison de Fabien, pas une convention informelle. Ce n'était pas
un choix par défaut faute d'alternative : c'est un vrai package publié et maintenu (CI
sur PHP 8.2→8.5, CHANGELOG, audit de sécurité).

**Version : v3 (actuelle), pas v2 malgré `auth-service`.** `auth-service` utilise ce
même outil, mais en v2 — ce n'est pas un problème de cohérence à résoudre : chaque
projet a son propre `vendor/` indépendant, rien n'oblige les deux applications à
partager une version. Vérification faite sur le code des deux tags :
- L'API PHP appelée reste identique entre v2 et v3 (`Migration::run()` →
  `setup()` + `migrate()`), donc aucun coût de portage ni de double convention à
  retenir en passant à v3 pour cave-a-vin.
- Ce qui change réellement entre les deux versions ne touche que la CLI (v3 :
  sous-commandes `symfony/console` ; v2 : `fzed51/console-options`) et un point de
  fond : **v2 n'a aucune vérification d'intégrité des fichiers déjà appliqués** — sa
  version de `controlMigrationFilePassed()` se contente de vérifier que le nom du
  fichier est présent dans `migration_story`, sans recalculer de somme de contrôle.
  Le SHA1 comparé à la relecture (§ ci-dessous) est un ajout de sécurité de la v3
  (corrige SEC-03 de l'audit de sécurité du projet), absent de la version qu'utilise
  `auth-service`.
- v3 exige PHP 8.2+ (contre 8.1+ pour v2), ce qui n'est pas une contrainte pour un
  projet qui démarre aujourd'hui.

Retenir v3 pour cave-a-vin, donc, pour la vérification d'intégrité et parce que c'est
la version activement maintenue — sans chercher à aligner artificiellement les deux
projets sur une version commune de l'outil.

**Compatible avec l'absence de SSH sur le mutualisé.** Contrairement à un outil piloté
uniquement par CLI (Phinx et consorts), `fzed51/migration` s'invoque aussi bien en PHP
pur : `Migration::run()` est une méthode publique ordinaire, qui prend une
`MigrationConfig` et exécute `setup()` (création de la table d'historique) puis
`migrate()` (exécution des fichiers en attente). L'endpoint protégé `/internal/migrate`
(§6.6) instancie directement cette classe plutôt que de lancer un processus `migrate`
en `exec()` — plus simple, et robuste à un `exec()` potentiellement désactivé.

**L'outil gère lui-même son historique**, pas de table `schema_migrations` à
maintenir à la main : il crée `migration_story` (`file`, `checksum`, `content`,
`passed`) à la première exécution si elle n'existe pas, et vérifie le SHA1 de chaque
fichier déjà appliqué avant de le considérer comme passé — modifier un fichier après
coup échoue explicitement (« Intégrité compromise »), une garantie que ma première
proposition (table maison sans somme de contrôle) n'offrait pas.

**Format des fichiers** : `<migration_directory>/mysql/YYYYMMDD-NN-description.sql`
(`migrate new` en génère le squelette), plusieurs requêtes par fichier séparées par une
ligne `---`. **Contrainte que je maintiens malgré tout : une seule instruction par
fichier**, en discipline personnelle au-dessus de ce que l'outil permet. Deux raisons,
qui se renforcent :
- L'outil **n'ouvre aucune transaction** — documenté explicitement dans son propre
  README : « si une requête échoue, les requêtes déjà exécutées du même fichier
  restent appliquées, et le fichier n'est pas enregistré. » Un fichier à deux
  instructions dont la seconde échoue laisse donc la première appliquée mais le
  fichier non marqué — un retry rejoue tout depuis le début, y compris une instruction
  DDL déjà passée (échec du type « la table existe déjà »), nécessitant une
  intervention manuelle pour nettoyer avant de relancer.
- Une seule instruction par fichier élimine ce risque par construction : un échec ne
  laisse jamais un fichier dans un état partiel à démêler à la main.

**Contrainte structurante inchangée : migrations strictement additives.** Le
déploiement FTP n'est pas atomique (§6.6) — le nouveau code peut être en place avant
que `/internal/migrate` ait fini de tourner. En restant sur des ajouts uniquement
(nouvelle table, nouvelle colonne nullable ou avec valeur par défaut), l'ordre entre
upload et migration n'a plus d'importance.

**Intégration avec les secrets (§6.5)** : plutôt que dupliquer les identifiants MySQL
dans un `migration-config.json` séparé, `config_extern` permet de pointer vers un
fichier `.php` qui retourne un tableau (le `.env` déjà chargé par l'application) — un
seul jeu de credentials à maintenir, pas deux.

### 6.8 Contrat d'erreur de l'API

**Décision** : même enveloppe que `auth-service` — `{"error": {"code": "...", "message":
"..."}}`, code stable et machine-readable pour le frontend, message informatif pour
l'humain. Cohérence avec le contrat déjà consommé côté PWA pour les erreurs remontées
depuis `auth-service`, pas de deuxième format d'erreur à gérer.

---

## 7. Export et sauvegarde des données

Fonctionnalité demandée au §3.9 du cahier des charges ("export/sauvegarde manuelle de la
cave"), jamais traduite techniquement jusqu'ici.

**Décision** : un endpoint `GET /api/export` renvoyant une **archive ZIP** (pas un JSON
seul) — `data.json` avec toutes les entités appartenant à l'utilisateur
(armoires/étagères/cartons, régions/cépages, catégories, bouteilles, mouvements) plus
un dossier `photos/` reprenant les fichiers déjà organisés par utilisateur (§5.2).
Déclenché depuis un bouton dans l'écran Compte, téléchargé par le navigateur.
**Revirement par rapport à une première version de cette section** qui excluait les
photos pour une raison de complexité jamais vraiment vérifiée : les fichiers sont déjà
regroupés par utilisateur, les inclure dans l'archive ne demande pas grand-chose de
plus, et une sauvegarde qui perd les photos à la restauration n'en est pas vraiment
une. À vérifier : disponibilité de l'extension `ZipArchive` sur le mutualisé OVH (même
type de vérification que `gd_info()` pour les photos, §5.2).

**Clés portables, pour qu'une restauration future reste possible** : `data.json`
référence les bouteilles par leur `reference` (le code métier stable), jamais par leur
`id` interne — un réimport dans une base vide générerait de nouveaux id
auto-incrémentés, qui casseraient tout lien construit sur l'ancien.

**Périmètre assumé, pas un backup en un clic** : pas d'endpoint d'import ni d'écran de
restauration en libre-service pour l'instant — disproportionné à l'échelle du projet.
En cas de besoin réel, la restauration se ferait via une intervention ponctuelle
directement sur les données exportées, pas par un flux applicatif. À reconsidérer si le
besoin s'en fait sentir.

**Nécessite le réseau** : contrairement aux quatre opérations offline exigées (§4 du
cahier des charges), l'export n'a pas besoin de fonctionner hors ligne — choix
délibéré, pas un oubli.

**Le mot "manuelle" n'est pas qu'un choix produit** : il découle directement de la
décision de ne dépendre d'aucune tâche CRON (§6.5, §6.7) — un export automatique
périodique réintroduirait exactement la dépendance au quota partagé avec
`auth-service` qu'on a écartée ailleurs. Cette fonctionnalité reste, en l'état, la
**seule sauvegarde de la cave** tant que le point suivant n'est pas vérifié — et rien
ne garantit non plus que l'utilisateur stocke le fichier téléchargé ailleurs que sur
l'appareil qui a servi à le générer ; hors de portée de l'architecture elle-même.

---

## 8. Points encore ouverts

- **Vérifier la disponibilité de l'extension `ZipArchive`** sur le mutualisé OVH,
  nécessaire à l'export/sauvegarde (§7).
- **Vérifier si l'offre OVH mutualisée inclut une sauvegarde automatique de la base
  MySQL** — sinon l'export manuel (§7) reste la seule protection réelle des données.
- **Refaire les ajustements nécessaires à `template-php-react`** au moment de
  l'implémentation — déjà fait fonctionner une fois par Fabien, mais sans que les
  correctifs aient été répercutés dans le dépôt. (§6.1)
- Confirmation : même compte OVH mutualisé qu'`auth-service`, ou hébergement distinct ?
- Durée de vie de l'identifiant opaque de session côté PWA (§4.3).
- Compatibilité des `CHECK` constraints avec la version MySQL réelle fournie par OVH
  (moteur confirmé — reste la version exacte à vérifier, 8.0.16+ requis).
- Support WebP de GD sur l'hébergement réel (`gd_info()`), si le ré-encodage
  server-side est reconsidéré un jour.
- **Endpoints API REST** — le contrat détaillé (routes, formats de requête/réponse, y
  compris le format exact du lot `POST /sync`) n'a pas encore été spécifié.
