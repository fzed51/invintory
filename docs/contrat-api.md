# Contrat d'API — Invintory

**Version 1.0 — validée le 2026-10-07** (plan, étape 3.0) : référence des routes de l'étape 3
et de la PWA. Comble le point ouvert d'Arch §8 (« Endpoints API REST »).

Sources : cahier des charges (CdC), architecture technique (Arch), schéma MySQL v1.2,
intégration auth-service, décisions du suivi (P1, P5, P6, P7, P17, P19, P20, P29). Les
choix propres à ce contrat sont listés en fin de document (§13), validés avec lui (P30).

---

## 1. Conventions

### 1.1 Généralités

- Base : `/api`, même origine que la PWA (pas de CORS). JSON UTF-8 partout, sauf photos
  (`image/jpeg`) et export (`application/zip`).
- **Chemins et champs JSON en anglais** (P29). Le code, les tables et les colonnes
  restent en français : la traduction se fait dans les contrôleurs (table §1.4).
- **Valeurs énumérées identiques au schéma** (`rouge`, `hors_rangement`, `consommee`…) :
  ce sont aussi les identifiants du design system (`wine-types.ts`), importé tel quel.
- Authentification : `Authorization: Bearer <access_token>` sur toute route, sauf les
  routes marquées *public* (§3). Jeton absent ou invalide → 401 `INVALID_ACCESS_TOKEN`
  avec `WWW-Authenticate: Bearer`. `HEAD` est accepté partout où `GET` l'est.
- **Isolation** : une ressource d'un autre compte est indiscernable d'une ressource
  inexistante → 404 `NOT_FOUND`, jamais 403.
- Identifiants : entiers (`id`). Identifiants client : UUID v4 en minuscules
  (`client_ref`).
- Pas de pagination : deux utilisateurs, quelques centaines de bouteilles chacun.
- Réponses de lecture : `Cache-Control: no-store` (le cache hors ligne est celui de la
  PWA, dans IndexedDB).

### 1.2 Formats de date

| Donnée | Format | Exemple |
|---|---|---|
| Date-heure (mouvement, création…) | ISO 8601 UTC, millisecondes | `2026-10-07T18:42:05.123Z` |
| Date d'entrée (année + mois) | `YYYY-MM` | `2026-10` |
| Date limite de consommation | `YYYY-MM-DD` | `2034-12-31` |
| Millésime | entier | `2018` |

### 1.3 Enveloppe d'erreur (Arch §6.8)

```json
{"error": {"code": "CAPACITY_EXCEEDED", "message": "Étagère complète : 12 alvéoles sur 12."}}
```

`code` est stable (anglais, majuscules) ; `message` est en français, destiné à l'humain,
susceptible de changer. Codes communs :

| Statut | Code | Cas |
|---|---|---|
| 400 | `VALIDATION_FAILED` | corps ou paramètre invalide ; `message` nomme le champ |
| 401 | `INVALID_ACCESS_TOKEN` | Bearer absent, expiré, mauvais `aud`/`iss` |
| 404 | `NOT_FOUND` | ressource inexistante ou d'un autre compte ; route inconnue |
| 405 | `METHOD_NOT_ALLOWED` | méthode non prévue (en-tête `Allow`) |
| 409 | voir chaque route | conflit avec l'état courant |
| 413 | `PAYLOAD_TOO_LARGE` | lot ou photo trop gros |
| 500 | `INTERNAL_ERROR` | erreur interne (journalisée) |
| 503 | `AUTH_SERVICE_UNAVAILABLE` | auth-service injoignable (`Retry-After` si connu) |

### 1.4 Correspondance des noms (JSON ↔ schéma)

| JSON | Colonne | | JSON | Colonne |
|---|---|---|---|---|
| `cabinets` | `armoires` | | `vintage` | `millesime` |
| `shelves` | `etageres` | | `entry_date` | `date_entree` |
| `boxes` | `cartons` | | `origin` | `origine` |
| `name` | `nom` | | `souvenir` | `tag_souvenir` |
| `label` (carton) | `identifiant` | | `domain` | `domaine` |
| `capacity` | `capacite_alveoles` / `capacite` | | `drink_by` | `date_limite_consommation` |
| `grapes` | `cepages` | | `age_year` | `anciennete_annee` |
| `batch_id` | `lot_ajout_id` | | `status` | `statut` |
| `threshold` | `seuil_min` | | `ageing_years` | `duree_garde_annees` |
| `movements` | `mouvements` | | `exit_reason` | `motif_sortie` |
| `occurred_at` | `date_mouvement` | | `location` | `emplacement_*` |

### 1.5 Emplacement (objet `location`)

```json
{"type": "etagere", "id": 12, "cabinet_id": 3, "label": "Cave du bas · Étagère 2"}
{"type": "carton", "id": 4, "label": "Carton Bordeaux"}
{"type": "hors_rangement"}
```

En entrée, seuls `type` et `id` comptent (`id` absent pour `hors_rangement`). `label`
est calculé (armoire · nom de l'étagère, ou « Étagère N » d'après sa position).

---

## 2. Hors ligne : ce qui passe par la file (P7)

| Opération | Hors ligne | Route |
|---|---|---|
| Consulter (cave, bouteilles, catégories, manques) | oui, depuis le cache de la PWA | lectures §5–§9 |
| Ajouter (unitaire, en masse) | **oui** | `POST /api/sync` (§10) |
| Déplacer | **oui** | `POST /api/sync` |
| Sortir | **oui** | `POST /api/sync` |
| Photo | **oui**, envoi différé | `PUT /api/photos/{client_ref}` (§11) |
| Emplacements, catégories, édition de fiche, compte, export | non (réseau requis) | routes REST |

Les trois écritures hors ligne passent **toujours** par `/sync`, même en ligne : un seul
chemin de code côté PWA et côté serveur.

---

## 3. Santé, déploiement, authentification (étape 2, déjà livré)

| Route | Accès | Corps | Réponse |
|---|---|---|---|
| `GET /api/health` | public | — | 200 `{"status": "ok"}` |
| `POST /api/internal/migrate` | `X-Deploy-Token` | — | 200 `{"executed": ["mysql/….sql"]}` ; 401 `INVALID_DEPLOY_TOKEN` |
| `POST /api/auth/login` | public | `{"email", "password", "device"?}` | 200 `{"access_token", "expires_in"}` + cookie `ivt_session` |
| `POST /api/auth/refresh` | cookie `ivt_session` | — | 200 idem, ticket renouvelé ; 401 `SESSION_INVALID` ; 409 `SESSION_ALREADY_REFRESHED` ; 403 `ACCESS_REVOKED` |
| `POST /api/auth/logout` | cookie `ivt_session` | — | 204, cookie effacé |
| `POST /api/auth/register` | public | `{"email", "password"}` | 202 `{"status": "confirmation_pending"}` |
| `POST /api/auth/register/resend` | public | `{"email"}` | 202 `{"status": "confirmation_pending"}` |
| `POST /api/auth/password/forgot` | public | `{"email"}` | 202 `{"status": "reset_pending"}` (toujours, anti-énumération) |
| `POST /api/auth/password/reset` | cookie `ivt_reinit` | `{"password"}` | 204 ; 400 `RESET_TOKEN_INVALID` |
| `GET /api/auth/callback` | public | — | 302 vers `/auth/return?type=…&status=…` (page de la PWA) |
| `GET /api/auth/devices` | Bearer | — | 200 `{"devices": [{"id", "device", "created_at", "last_used_at", "current"}]}` |
| `DELETE /api/auth/devices/{id}` | Bearer | — | 204 ; 404 |
| `GET /api/account` | Bearer | — | 200 `{"email"}` |
| `POST /api/account/email` | Bearer | `{"email", "password"}` | 202 `{"status": "confirmation_pending"}` |

Cookies : `ivt_session` (`Path=/api/auth`, 30 jours glissants) et `ivt_reinit`
(`Path=/api/auth/password`, 15 min), tous deux `Secure; HttpOnly; SameSite=Strict`.
Refus d'auth-service relayés : `VALIDATION_FAILED`, `INVALID_CREDENTIALS` (401),
`EMAIL_ALREADY_USED` (409), `NO_PENDING_REGISTRATION` (404), `ACCESS_REVOKED` (403),
`RATE_LIMITED` (429, `Retry-After`), `AUTH_SERVICE_UNAVAILABLE` (503).
Page de retour `/auth/return` : `type` ∈ `user_registration`, `password_reset`,
`email_change`, `unknown` ; `status` ∈ `confirmed`, `already_confirmed`, `expired`,
`email_taken`.

---

## 4. Références des bouteilles (P1)

La référence (CdC §2.3) est générée par le serveur, mais doit être connue hors ligne pour
être recopiée sur l'étiquette dès l'ajout. **Décision P1 : réserve de codes par appareil.**

### `POST /api/references/reservations`

Corps : `{"count": 30}` (1 à 100). Réserve les `count` codes suivants de la séquence de
l'utilisateur (verrou sur `reference_sequences`), dans l'ordre :

```json
201 {"references": ["a2", "a3", "a4"]}
```

- La PWA garde sa réserve dans IndexedDB, consomme un code par bouteille ajoutée et la
  complète dès qu'elle repasse sous un seuil, quand le réseau est là.
- Un code réservé mais jamais utilisé est perdu : la suite des références a des trous.
- À la synchronisation (§10), une référence fournie est acceptée si elle a déjà été
  distribuée à ce compte (sa position est inférieure ou égale à celle de la séquence) et
  n'est portée par aucune autre bouteille ; sinon la mutation est rejetée
  (`REFERENCE_NOT_RESERVED`, `REFERENCE_TAKEN`). Sans référence fournie (réserve vide),
  le serveur en génère une, renvoyée dans la réponse.

---

## 5. Emplacements (CdC §2.1, §3.1, §3.2 ; en ligne uniquement)

### `GET /api/cellar` — vue globale

```json
200 {
  "cabinets": [
    {"id": 3, "name": "Cave du bas", "shelves": [
      {"id": 12, "name": null, "position": 1, "capacity": 12, "occupied": 9}
    ]}
  ],
  "boxes": [{"id": 4, "label": "Carton Bordeaux", "capacity": 6, "occupied": 6}],
  "unplaced": 2
}
```

Armoires et cartons par `id` croissant, étagères par `position` puis `id`. `occupied`
ne compte que les bouteilles `en_cave`. Les bouteilles elles-mêmes : `GET /api/bottles`.

### Armoires et étagères

| Route | Corps | Réponse |
|---|---|---|
| `POST /api/cabinets` | `{"name", "shelves": [{"name"?, "capacity"}]}` | 201 armoire (forme de `/cellar`) |
| `PATCH /api/cabinets/{id}` | `{"name"}` | 200 armoire |
| `DELETE /api/cabinets/{id}` | — | 200 `{"moved_to_unplaced": 9}` |
| `POST /api/cabinets/{id}/shelves` | `{"name"?, "capacity", "position"?}` | 201 étagère |
| `PATCH /api/shelves/{id}` | `{"name"?, "capacity"?, "position"?}` | 200 étagère ; 409 `CAPACITY_BELOW_OCCUPANCY` |
| `DELETE /api/shelves/{id}` | — | 200 `{"moved_to_unplaced": 4}` |

### Cartons

| Route | Corps | Réponse |
|---|---|---|
| `POST /api/boxes` | `{"label", "capacity"}` | 201 carton |
| `PATCH /api/boxes/{id}` | `{"label"?, "capacity"?}` | 200 carton ; 409 `CAPACITY_BELOW_OCCUPANCY` |
| `DELETE /api/boxes/{id}` | — | 200 `{"moved_to_unplaced": 6}` |

Règles :
- `name` et `label` : 1 à 100 caractères ; `capacity` : entier de 1 à 65 535 ;
  `position` : entier ≥ 0 (défaut : après la dernière étagère).
- **Capacité réduite sous l'occupation (P5)** : refusée, 409 `CAPACITY_BELOW_OCCUPANCY`,
  message avec l'occupation actuelle.
- **Suppression d'un emplacement non vide (CdC §3.1, P20)** : jamais bloquée. Dans la
  même transaction, avant le `DELETE`, chaque bouteille `en_cave` passe en
  `hors_rangement` (type **et** FK à NULL) et reçoit un mouvement `deplacement` daté de
  la suppression (`occurred_at` = heure du serveur) ; `date_dernier_mouvement_applique`
  avance d'autant. Supprimer une armoire supprime ses étagères.

### `GET /api/locations/suggestion` — suggestion d'emplacement (CdC §3.2)

Paramètres : `count` (bouteilles à ranger, défaut 1), `skip` (propositions déjà
écartées par « Autre emplacement », défaut 0).

```json
200 {"location": {"type": "etagere", "id": 12, "cabinet_id": 3, "label": "…"}, "free": 3}
200 {"location": null, "free": 0}
```

Ordre de parcours, que la PWA reproduit à l'identique hors ligne sur son cache : étagères
(armoires par `id`, étagères par `position` puis `id`), puis cartons (par `id`). Est
candidat tout emplacement dont la place libre est ≥ `count` ; `skip = k` renvoie le
(k+1)-ième candidat. Le choix manuel n'appelle pas cette route ; un emplacement complet y
est refusé côté PWA et, s'il arrive malgré tout par `/sync`, redirigé (§10.4).

---

## 6. Référentiels régions et cépages (autocomplétion)

| Route | Réponse |
|---|---|
| `GET /api/regions?q=bor` | 200 `{"regions": [{"id": 5, "name": "Bordeaux"}]}` |
| `GET /api/grapes?q=mer` | 200 `{"grapes": [{"id": 9, "name": "Merlot"}]}` |

`q` facultatif (sans `q` : tout le référentiel, pour le cache hors ligne) ; recherche
« contient », insensible à la casse, sensible aux accents (collation du schéma) ; tri
alphabétique. Pas de création directe : une région ou un cépage est créé à la volée quand
une bouteille ou une catégorie le nomme (`"region": "Bordeaux"`), retrouvé s'il existe.

---

## 7. Bouteilles (CdC §2.2, §3.5, §3.6)

### 7.1 Représentation

```json
{
  "id": 41, "client_ref": "7b0e…", "reference": "a7",
  "type": "rouge", "region": {"id": 5, "name": "Bordeaux"}, "grape": null,
  "domain": "Château Exemple", "vintage": 2018, "entry_date": "2026-10",
  "origin": "achetee", "note": "Offert par Paul", "souvenir": false,
  "location": {"type": "etagere", "id": 12, "cabinet_id": 3, "label": "…"},
  "status": "en_cave", "drink_by": "2026-12-31", "urgent": false, "age_year": 2018,
  "batch_id": "1f3c…", "has_photo": true,
  "created_at": "2026-10-07T18:42:05.000Z", "updated_at": "2026-10-07T18:42:05.000Z"
}
```

- `urgent` = `drink_by` antérieure à aujourd'hui (badge « À boire d'urgence », CdC §3.6).
- `drink_by` (P17) : toujours renseignée. Durée de garde = celle de la catégorie
  spécifique (type + région), sinon de la générique (type seul), sinon la valeur par
  défaut du type : rouge 8 ans, blanc 4, rosé 2, effervescent 3, doux 10, autre 5.
  Avec millésime : 31 décembre de (millésime + garde). Sans : date d'entrée + garde.
- Recalcul synchrone (P17) dès qu'une donnée d'entrée change : millésime, date d'entrée,
  type ou région d'une bouteille ; création, modification ou suppression d'une catégorie.

### 7.2 Lecture

| Route | Réponse |
|---|---|
| `GET /api/bottles` | 200 `{"bottles": [ … ]}` |
| `GET /api/bottles/{id}` | 200 bouteille + `"movements": [ … ]` (§8) |
| `GET /api/bottles/by-reference/{reference}` | 200 bouteille + mouvements ; 404 |

Filtres de `GET /api/bottles` (tous facultatifs, combinables) :

| Paramètre | Valeurs | Défaut |
|---|---|---|
| `status` | `en_cave`, `sortie`, `all` | `en_cave` |
| `location` | `hors_rangement`, `etagere:12`, `carton:4`, `cabinet:3` | toutes |
| `type` | un type | tous |
| `region_id`, `grape_id` | id | tous |
| `sort` | `priority` (« à boire en priorité »), `age` (« par âge ») | `reference` |
| `limit` | entier | aucune |

- `sort=priority` : `drink_by` croissante (les dépassées d'abord), puis `age_year`,
  puis `id`. La PWA met en tête les 20 premières (CdC §3.6).
- `sort=age` : `age_year` croissante (les plus vieilles d'abord), puis `id`.
- Recherche repas = `type` + `region_id` + `grape_id` ; les bouteilles souvenir restent
  dans les résultats (`souvenir: true` → badge).
- Recherche par référence : insensible à la casse, espaces retirés.

### 7.3 Édition de la fiche (en ligne uniquement, P7)

`PATCH /api/bottles/{id}` — champs modifiables, tous facultatifs : `type`, `region`
(nom ou `null`), `grape` (nom ou `null`), `domain`, `vintage` (entier ou `null`),
`entry_date` (`YYYY-MM`), `origin`, `note`, `souvenir`. Réponse : 200 bouteille.
L'emplacement et le statut ne changent que par un mouvement (§10). Une bouteille sortie
reste éditable (note notamment). Erreur : 400 `VALIDATION_FAILED`.

---

## 8. Mouvements (CdC §2.4)

Lus avec la bouteille (`GET /api/bottles/{id}`), du plus ancien au plus récent :

```json
{"id": 88, "client_ref": "c41a…", "type": "deplacement", "exit_reason": null,
 "from": {"type": "etagere", "id": 12, "label": "…"}, "to": {"type": "hors_rangement"},
 "occurred_at": "2026-10-07T18:42:05.123Z"}
```

`from` est `null` pour une `entree`, `to` est `null` pour une `sortie`. Le `label` d'un
emplacement supprimé depuis vaut « Emplacement supprimé ». Créés uniquement par `/sync`
(et par la suppression d'un emplacement, §5).

---

## 9. Catégories et manques (CdC §2.5, §3.7 ; catégories en ligne uniquement)

### Catégories

| Route | Corps | Réponse |
|---|---|---|
| `GET /api/categories` | — | 200 `{"categories": [ … ]}` |
| `POST /api/categories` | `{"type", "region"?, "threshold"?, "ageing_years"?}` | 201 ; 409 `CATEGORY_EXISTS` |
| `PATCH /api/categories/{id}` | `{"threshold"?, "ageing_years"?}` | 200 |
| `DELETE /api/categories/{id}` | — | 204 |

```json
{"id": 2, "type": "rouge", "region": {"id": 5, "name": "Bordeaux"},
 "threshold": 3, "ageing_years": 12, "count": 5}
```

- `region` absente ou `null` : catégorie générique. Le type et la région ne changent pas
  après création (supprimer et recréer).
- Unicité `(type, région)` vérifiée par l'application, y compris pour la générique
  (l'index unique ne bloque pas `region_id = NULL`) → 409 `CATEGORY_EXISTS`.
- `threshold` : 0 à 65 535 ou `null` ; `ageing_years` : 0 à 255 ou `null`.
- Toute écriture recalcule les `drink_by` concernées dans la même transaction (P17).
- `count` : bouteilles `en_cave` de la catégorie. **P6** : une générique compte toutes
  les bouteilles de son type, y compris celles qu'une spécifique couvre aussi.

### `GET /api/shortages` — manques

```json
200 {
  "shortages": [
    {"category": {"id": 2, "type": "rouge", "region": {"id": 5, "name": "Bordeaux"}},
     "threshold": 3, "count": 1, "missing": 2,
     "suggestions": [
       {"domain": "Château Exemple", "vintage": 2018, "region": "Bordeaux",
        "grape": "Merlot", "last_movement_at": "2026-09-01T12:00:00.000Z"}
     ]}
  ]
}
```

- Une catégorie est en manque si `threshold` est renseigné et `count < threshold` ;
  `missing = threshold − count`. La pastille de la navigation = nombre d'éléments.
- Seuil : la valeur de la catégorie elle-même (pas d'héritage générique → spécifique).
- `suggestions` : vins déjà eus dans la catégorie (bouteilles de tout statut), regroupés
  par domaine + millésime + région + cépage, triés par dernier mouvement décroissant
  (CdC §3.7), 10 au plus.

---

## 10. Synchronisation — `POST /api/sync` (Arch §4, §6.4)

### 10.1 Requête

```json
{
  "mutations": [
    {
      "client_ref": "1f3c…", "schema_version": 1, "kind": "add",
      "occurred_at": "2026-10-07T18:40:00.000Z",
      "bottles": [
        {"client_ref": "7b0e…", "reference": "a7"},
        {"client_ref": "9d21…", "reference": "a8"}
      ],
      "fields": {
        "type": "rouge", "region": "Bordeaux", "grape": "Merlot",
        "domain": "Château Exemple", "vintage": 2018, "entry_date": "2026-10",
        "origin": "achetee", "note": "Offert par Paul", "souvenir": false
      },
      "location": {"type": "etagere", "id": 12}
    },
    {
      "client_ref": "c41a…", "schema_version": 1, "kind": "move",
      "occurred_at": "2026-10-07T19:05:12.345Z",
      "bottle": "7b0e…", "location": {"type": "hors_rangement"}
    },
    {
      "client_ref": "e88f…", "schema_version": 1, "kind": "exit",
      "occurred_at": "2026-10-07T21:30:00.000Z",
      "bottle": "7b0e…", "exit_reason": "consommee"
    }
  ]
}
```

| `kind` | Effet | Champs propres |
|---|---|---|
| `add` | crée N bouteilles (1 à 100) + un mouvement `entree` chacune | `bottles` (`client_ref`, `reference`?), `fields`, `location` |
| `move` | mouvement `deplacement` | `bottle` (client_ref de la bouteille), `location` |
| `exit` | mouvement `sortie`, statut `sortie` | `bottle`, `exit_reason` (`consommee`, `offerte`, `perdue_cassee`) |

- Toute bouteille a un `client_ref` (créée par `/sync`) : les mouvements la désignent par
  lui, l'id serveur pouvant ne pas être encore connu hors ligne.
- `add` : `fields.type`, `entry_date` et `origin` obligatoires (`entry_date` par défaut
  le mois de `occurred_at` côté PWA) ; `batch_id` = `client_ref` de la mutation ; la note
  est copiée sur chaque bouteille ; régions et cépages créés à la volée.
- Le `client_ref` d'une mutation `move`/`exit` devient celui du mouvement ; ceux des
  mouvements `entree` restent `NULL` (l'idempotence passe par les bouteilles).
- `schema_version` : la PWA migre ses mutations jusqu'à la version courante (1) avant
  l'envoi (Arch §4.2) ; toute autre version est rejetée.
- Limites : 200 mutations par lot, sinon 413 `PAYLOAD_TOO_LARGE` ; corps mal formé →
  400 `VALIDATION_FAILED` pour tout le lot.

### 10.2 Traitement

- Une transaction pour le lot ; mutations traitées **dans l'ordre reçu** (la PWA envoie
  les ajouts avant les mouvements qui les concernent). Le serveur ne réordonne pas.
- **Idempotence** (Arch §4.2) : une mutation dont le `client_ref` (de la mutation `move`
  ou `exit`, ou des bouteilles d'un `add`) existe déjà n'est pas réappliquée ; sa
  réponse est reconstruite à l'identique (`already_applied`).
- **Horloge logique** (Arch §4.5) : l'état courant de la bouteille n'est mis à jour que
  si `occurred_at` est postérieur à `date_dernier_mouvement_applique` ; le mouvement est
  enregistré dans l'historique dans tous les cas.
- **Sortie terminale (P19)** : une sortie est toujours appliquée, quelle que soit sa date.
  Une bouteille sortie n'accepte plus aucun mouvement : `move` ou `exit` sur elle →
  rejeté (`BOTTLE_EXITED`), rien n'est enregistré.

### 10.3 Réponse

```json
200 {
  "results": [
    {"client_ref": "1f3c…", "status": "applied",
     "bottles": [
       {"client_ref": "7b0e…", "id": 41, "reference": "a7",
        "location": {"type": "etagere", "id": 12, "cabinet_id": 3, "label": "…"},
        "redirected": null}
     ]},
    {"client_ref": "c41a…", "status": "applied", "movement_id": 88, "redirected": null},
    {"client_ref": "e88f…", "status": "rejected",
     "error": {"code": "BOTTLE_EXITED", "message": "Bouteille déjà sortie."}}
  ]
}
```

Un résultat par mutation, dans l'ordre. `status` :
- `applied` : appliquée maintenant ;
- `already_applied` : déjà reçue, même contenu de réponse — la PWA la retire de sa file ;
- `rejected` : rien n'est enregistré ; `error` donne la raison.

| Code de rejet | Cas | La PWA |
|---|---|---|
| `BOTTLE_NOT_FOUND` | `bottle` inconnu (son ajout n'est pas encore arrivé) | garde la mutation, la renvoie au prochain lot |
| `BOTTLE_EXITED` | mouvement sur une bouteille sortie (P19) | retire la mutation, le signale |
| `REFERENCE_NOT_RESERVED`, `REFERENCE_TAKEN` | référence invalide (§4) | retire la mutation, le signale |
| `UNSUPPORTED_SCHEMA_VERSION` | version de mutation inconnue | garde la mutation (mise à jour de la PWA attendue) |
| `VALIDATION_FAILED` | mutation mal formée | retire la mutation, le signale |

### 10.4 Redirection vers « hors rangement » (Arch §4.5)

Un placement (`add` ou `move`) vers un emplacement complet ou disparu (supprimé pendant
que l'appareil était hors ligne) n'est pas rejeté : la bouteille va en `hors_rangement`
et `redirected` vaut `"CAPACITY_EXCEEDED"` ou `"LOCATION_NOT_FOUND"`. Pour un `add` de N
bouteilles, la redirection se décide bouteille par bouteille (les premières remplissent
la place restante). Le mouvement enregistré porte la destination réelle.

---

## 11. Photos (CdC §4, Arch §5)

### `PUT /api/photos/{client_ref}`

Corps brut `image/jpeg` (≤ 10 Mo, sinon 413 `PAYLOAD_TOO_LARGE` ; autre type → 415
`UNSUPPORTED_MEDIA_TYPE`). Réponse 204.

- `client_ref` d'une **bouteille** : photo de cette bouteille.
- `client_ref` d'une mutation **`add`** (`batch_id`) : la photo est copiée en un fichier
  distinct pour chaque bouteille du lot (Arch §5.3).
- 404 `NOT_FOUND` si aucune bouteille ne correspond encore (ajout pas encore
  synchronisé) : la PWA réessaie après le prochain `/sync`.
- Rejouable : un nouvel envoi remplace le fichier. Traitement : orientation EXIF,
  recompression JPEG, 1600 px max, miniature ; stockage hors docroot
  `{user_id}/{reference}.jpg` et `{reference}_thumb.jpg` (Arch §5.2).

### Lecture et suppression

| Route | Réponse |
|---|---|
| `GET /api/bottles/{id}/photo` | 200 `image/jpeg` ; 404 si pas de photo |
| `GET /api/bottles/{id}/photo/thumbnail` | 200 `image/jpeg` (miniature) ; 404 |
| `DELETE /api/bottles/{id}/photo` | 204 (en ligne uniquement) |

Routes authentifiées (isolation) : une balise `<img src>` ne porte pas le Bearer, la PWA
charge donc l'image par `fetch` puis l'affiche via `URL.createObjectURL()`.

---

## 12. Export (CdC §3.9, Arch §7 ; en ligne uniquement)

### `GET /api/export`

200 `application/zip`, `Content-Disposition: attachment; filename="invintory-AAAA-MM-JJ.zip"`.

- `data.json` : `{"exported_at", "cabinets" (avec `shelves`), "boxes", "regions",
  "grapes", "categories", "bottles" (avec `movements`)}`, mêmes noms de champs que
  l'API ; bouteilles désignées par leur `reference`, jamais par leur `id` (emplacements
  par nom).
- `photos/{reference}.jpg` pour chaque bouteille qui en a une (miniatures exclues).

---

## 13. Choix propres à ce contrat (validés, P30)

1. Valeurs énumérées en français, identiques au schéma et au design system (`rouge`,
   `hors_rangement`, `consommee`…), alors que les noms de champs sont en anglais.
2. Date limite : 31 décembre de (millésime + garde) ; sans millésime, date d'entrée
   (1er du mois) + garde.
3. Tri « à boire en priorité » : `drink_by` croissante, les dates dépassées en premier
   (plutôt qu'une distance absolue à aujourd'hui, qui repousserait une bouteille très en
   retard).
4. Placement vers un emplacement supprimé entre-temps : redirigé en hors rangement
   (`LOCATION_NOT_FOUND`), comme un dépassement de capacité, plutôt que rejeté.
5. `batch_id` renseigné pour tout ajout, même unitaire (le schéma le réservait à l'ajout
   en masse) : il sert de cible à l'envoi de la photo commune.
6. Réserve de références : 1 à 100 codes par appel (la PWA en demande 30).
7. Seuil des manques non hérité : une catégorie spécifique sans seuil n'est jamais en
   manque, même si sa générique en a un.
8. Suggestions de manque regroupées par domaine + millésime + région + cépage, 10 au plus.
9. Limites : 200 mutations par lot, 100 bouteilles par ajout, photo de 10 Mo.
10. Pas de pagination ; listes complètes.
