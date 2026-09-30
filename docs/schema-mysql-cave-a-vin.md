# Schéma MySQL détaillé — Cave à Vin

**Version 1.0** — dérivé de `cahier-des-charges-fonctionnel-cave-a-vin.md` v1.0

Conventions : InnoDB partout (transactions + FK), noms de tables/colonnes en français
pour rester cohérent avec le cahier des charges, `snake_case`, clés primaires
`BIGINT UNSIGNED AUTO_INCREMENT`.

---

## 1. Comptes et session

### 1.1 `users`

Fait le lien entre l'identité `auth-service` (qui authentifie mais n'autorise pas — voir
`integration.md` §4) et la cave de l'utilisateur.

```sql
CREATE TABLE users (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    auth_sub    VARCHAR(64)  NOT NULL,   -- `sub` du JWT auth-service, identifiant stable
    email       VARCHAR(255) NOT NULL,   -- mis en cache depuis GET /users/me, resynchro à la connexion
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_auth_sub (auth_sub)
) ENGINE=InnoDB;
```

### 1.2 `user_sessions` — dépôt du refresh token uniquement

Précision de vocabulaire : le caractère B2B / multi-tenant de l'API (`integration.md`
§1) décrit qui a le droit d'appeler l'API — un client authentifié par
`client_id`/`client_secret` — pas à qui appartient la session. La paire
access_token/refresh_token émise par `POST /sessions` est la session de
**l'utilisateur final** (son `sub`), pas une session propre à votre backend. Ce qui
force le passage par le backend est plus étroit : le navigateur ne peut porter le
`client_secret` exigé sur chaque route, donc il ne peut pas appeler `auth-service`
lui-même — mais ça ne dit rien sur où les tokens doivent être *stockés* une fois
obtenus.

Les raisons de garder spécifiquement le `refresh_token` côté serveur sont donc
indépendantes du B2B : la rotation doit être sérialisée pour éviter la révocation en
cascade du §2.4 (scénario réaliste ici : la file de synchro offline qui se réveille en
parallèle d'un onglet resté ouvert), et un credential valide 30 jours a une surface
d'exposition bien plus grande dans un stockage client persistant par nature
(IndexedDB, offline) que le même token gardé en base côté serveur. L'`access_token`,
lui, auto-porteur et vérifiable localement (§3.3) et valide seulement 15 minutes, peut
être transmis tel quel à la PWA sans ce risque.

```sql
CREATE TABLE user_sessions (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id               BIGINT UNSIGNED NOT NULL,
    refresh_session_hash  CHAR(64) NOT NULL,      -- SHA-256 de l'identifiant opaque détenu par la PWA
    auth_refresh_token    VARCHAR(255) NOT NULL,  -- refresh_token courant, remplacé à chaque rotation
    device_label          VARCHAR(255) NULL,      -- informatif ("iPhone de Fabien")
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sessions_refresh_hash (refresh_session_hash),
    KEY idx_sessions_user (user_id),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

Flux résultant :
1. **Connexion** : le backend appelle `POST /sessions` sur `auth-service`, reçoit
   `access_token` + `refresh_token`. Il crée une ligne `user_sessions` (refresh_token +
   un nouvel identifiant opaque), et renvoie à la PWA l'`access_token` tel quel, plus
   l'identifiant opaque — jamais le refresh_token.
2. **Appels normaux** : la PWA envoie `Authorization: Bearer <access_token>` à votre
   API ; le backend vérifie le JWT localement (JWKS), sans toucher à `user_sessions`.
3. **Rafraîchissement** : la PWA envoie l'identifiant opaque à votre propre endpoint de
   refresh ; le backend retrouve la ligne, verrouille (`TokenProvider`, §3.4), appelle
   `POST /sessions/refresh`, met à jour la ligne, renvoie le nouvel `access_token`.
4. **Multi-appareils** : chaque connexion crée sa propre ligne — ça correspond
   naturellement à la notion de session par appareil d'`auth-service` (`GET /sessions`),
   et permet une révocation par appareil depuis l'écran Compte (§3.9) indépendamment du
   modèle de révocation d'`auth-service` (qui n'empêche que le renouvellement, pas
   l'access token déjà émis).

*Point encore ouvert* : durée de vie de l'identifiant opaque côté PWA, à choisir en
cohérence avec l'exigence offline (probablement proche des 30 jours glissants du
refresh token plutôt que des 15 minutes de l'access token).

---

## 2. Emplacements (§2.1, §3.1)

```sql
CREATE TABLE armoires (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,
    nom         VARCHAR(100) NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_armoires_user (user_id),
    CONSTRAINT fk_armoires_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE etageres (
    id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    armoire_id         BIGINT UNSIGNED NOT NULL,
    nom                VARCHAR(100) NULL,             -- optionnel, ex. "Étagère du haut"
    capacite_alveoles  SMALLINT UNSIGNED NOT NULL,
    position           SMALLINT UNSIGNED NOT NULL DEFAULT 0,  -- ordre d'affichage
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_etageres_armoire (armoire_id),
    CONSTRAINT fk_etageres_armoire FOREIGN KEY (armoire_id) REFERENCES armoires(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE cartons (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,
    identifiant VARCHAR(100) NOT NULL,
    capacite    SMALLINT UNSIGNED NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_cartons_user (user_id),
    CONSTRAINT fk_cartons_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

**"Hors rangement" n'a pas de table.** C'est représenté sur la bouteille par
`emplacement_type = 'hors_rangement'` avec `etagere_id` et `carton_id` à `NULL` —
cohérent avec le fait que cette zone est unique, générique et sans capacité (§2.1).

---

## 3. Référentiels évolutifs (§2.2, §3.9)

Régions et cépages sont créés à la volée par l'autocomplétion, par utilisateur (isolation
stricte oblige — pas de référentiel partagé entre comptes).

```sql
CREATE TABLE regions (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,
    nom         VARCHAR(150) NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_regions_user_nom (user_id, nom),
    CONSTRAINT fk_regions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE cepages (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,
    nom         VARCHAR(150) NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cepages_user_nom (user_id, nom),
    CONSTRAINT fk_cepages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

Le **Type** (rouge/blanc/rosé/effervescent/doux/autre) est une liste fixe non
modifiable (§3.9) : simple `ENUM`, pas de table.

---

## 4. Catégories, seuils, durée de garde (§2.5, §3.7, §3.9)

```sql
CREATE TABLE categories (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT UNSIGNED NOT NULL,
    type                ENUM('rouge','blanc','rose','effervescent','doux','autre') NOT NULL,
    region_id           BIGINT UNSIGNED NULL,   -- NULL = catégorie générique (type seul)
    seuil_min           SMALLINT UNSIGNED NULL,
    duree_garde_annees  TINYINT UNSIGNED NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_categories_user_type_region (user_id, type, region_id),
    KEY idx_categories_user (user_id),
    CONSTRAINT fk_categories_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_categories_region FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

⚠️ **Piège MySQL** : dans un index `UNIQUE`, plusieurs lignes avec `region_id = NULL`
ne sont **pas** considérées comme des doublons (NULL ≠ NULL). L'unicité de la catégorie
générique `(user_id, type, NULL)` doit donc être vérifiée côté application avant
insertion, l'index ne la garantit pas à lui seul.

La règle de résolution du §2.5 (spécifique prime sur générique) se fait en lecture :
`SELECT` la ligne `(type, region_id)` si elle existe, sinon fallback sur
`(type, NULL)`.

---

## 5. Bouteilles (§2.2, §2.3)

```sql
CREATE TABLE bouteilles (
    id                       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id                  BIGINT UNSIGNED NOT NULL,
    reference                VARCHAR(10) NOT NULL,   -- code court (voir §2.3, génération applicative)
    type                     ENUM('rouge','blanc','rose','effervescent','doux','autre') NOT NULL,
    region_id                BIGINT UNSIGNED NULL,
    cepage_id                BIGINT UNSIGNED NULL,
    domaine                  VARCHAR(255) NULL,
    millesime                SMALLINT UNSIGNED NULL,    -- optionnel (§2.2)
    date_entree              DATE NOT NULL,             -- toujours au 1er du mois : année+mois seuls comptent
    photo_path               VARCHAR(255) NULL,
    origine                  ENUM('achetee','offerte') NOT NULL,
    note                     TEXT NULL,
    tag_souvenir             TINYINT(1) NOT NULL DEFAULT 0,
    emplacement_type         ENUM('etagere','carton','hors_rangement') NOT NULL,
    etagere_id               BIGINT UNSIGNED NULL,
    carton_id                BIGINT UNSIGNED NULL,
    statut                   ENUM('en_cave','sortie') NOT NULL DEFAULT 'en_cave',
    date_limite_consommation DATE NULL,                 -- recalculée en appli (voir note sous le tableau)
    anciennete_annee         SMALLINT UNSIGNED
        GENERATED ALWAYS AS (COALESCE(millesime, YEAR(date_entree))) STORED,  -- pour tri "par âge" (§3.6)
    lot_ajout_id             CHAR(36) NULL,             -- UUID commun à un ajout en masse (§3.3)
    client_ref               CHAR(36) NULL,             -- UUID côté client, dédup à la synchro offline
    date_dernier_mouvement_applique DATETIME NULL,      -- horloge logique (date_mouvement du dernier
                                                         -- mouvement appliqué) pour l'UPDATE conditionnel
                                                         -- anti-conflit multi-appareils, voir architecture §4.5
    created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_bouteilles_user_reference (user_id, reference),
    UNIQUE KEY uq_bouteilles_user_client_ref (user_id, client_ref),
    KEY idx_bouteilles_recherche (user_id, statut, type, region_id, cepage_id),
    KEY idx_bouteilles_dlc (user_id, date_limite_consommation),
    KEY idx_bouteilles_anciennete (user_id, anciennete_annee),
    KEY idx_bouteilles_emplacement (emplacement_type, etagere_id, carton_id),
    CONSTRAINT fk_bouteilles_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    CONSTRAINT fk_bouteilles_region  FOREIGN KEY (region_id)  REFERENCES regions(id)  ON DELETE SET NULL,
    CONSTRAINT fk_bouteilles_cepage  FOREIGN KEY (cepage_id)  REFERENCES cepages(id)  ON DELETE SET NULL,
    CONSTRAINT fk_bouteilles_etagere FOREIGN KEY (etagere_id) REFERENCES etageres(id) ON DELETE RESTRICT,
    CONSTRAINT fk_bouteilles_carton  FOREIGN KEY (carton_id)  REFERENCES cartons(id)  ON DELETE RESTRICT
) ENGINE=InnoDB;
```

Points d'attention :

- **`ON DELETE RESTRICT` sur étagère/carton, volontairement.** Le §3.1 exige que la
  suppression d'un emplacement non vide déplace ses bouteilles vers "Hors rangement"
  plutôt que d'être bloquée — mais un `SET NULL` automatique laisserait
  `emplacement_type = 'etagere'` avec `etagere_id = NULL`, un état incohérent. La
  bascule vers `hors_rangement` (mise à jour de `emplacement_type` **et**
  `etagere_id`/`carton_id`) doit donc être faite par l'application, dans la même
  transaction, **avant** le `DELETE` de l'emplacement.
- **Format de `reference`** (1er caractère `a-z` hors `o`/`i`, suivants `0-9a-z` hors
  `o`/`i`) : contrainte purement applicative, portée par le générateur — pas de `CHECK`
  MySQL dessus (regex peu portable, et la génération séquentielle est de toute façon
  gérée par l'application, voir §7).
- **`date_limite_consommation`** est dénormalisée pour permettre le tri "à boire en
  priorité" (§3.6) sans recalcul à chaque requête. Elle doit être recalculée par
  l'application : à la création de la bouteille, et par un batch de mise à jour quand
  la `duree_garde_annees` d'une catégorie change (impact potentiel sur toutes les
  bouteilles de cette catégorie).
- Le `CHECK` cohérence `emplacement_type` ↔ `etagere_id`/`carton_id` (un seul renseigné
  selon le type) n'est pas posé en DDL : `CHECK` nécessite MySQL 8.0.16+ / MariaDB
  10.2+, à vérifier sur l'offre mutualisée OVH avant de s'appuyer dessus. À défaut,
  enforcement applicatif uniquement.
- **`date_dernier_mouvement_applique`** n'est pas une donnée métier : elle ne sert qu'à
  l'application d'un mouvement de façon idempotente et sûre en cas d'écriture
  concurrente depuis deux appareils (`UPDATE ... WHERE ... AND (date_dernier_mouvement_applique
  IS NULL OR date_dernier_mouvement_applique < :date_mouvement)`). Mise à jour
  uniquement par le traitement d'un mouvement, jamais par l'utilisateur.

---

## 6. Mouvements (§2.4)

```sql
CREATE TABLE mouvements (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    bouteille_id            BIGINT UNSIGNED NOT NULL,
    user_id                 BIGINT UNSIGNED NOT NULL,   -- dénormalisé : isolation stricte sans jointure
    type_mouvement          ENUM('entree','sortie','deplacement') NOT NULL,
    motif_sortie            ENUM('consommee','offerte','perdue_cassee') NULL,  -- seulement si sortie
    emplacement_avant_type  ENUM('etagere','carton','hors_rangement') NULL,
    emplacement_avant_id    BIGINT UNSIGNED NULL,       -- id étagère OU carton selon le type (polymorphe, sans FK)
    emplacement_apres_type  ENUM('etagere','carton','hors_rangement') NULL,
    emplacement_apres_id    BIGINT UNSIGNED NULL,
    date_mouvement          DATETIME NOT NULL,
    client_ref              CHAR(36) NULL,              -- UUID côté client, dédup à la synchro offline
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_mouvements_user_client_ref (user_id, client_ref),
    KEY idx_mouvements_bouteille (bouteille_id, date_mouvement),
    KEY idx_mouvements_user_type (user_id, type_mouvement, date_mouvement),
    CONSTRAINT fk_mouvements_bouteille FOREIGN KEY (bouteille_id) REFERENCES bouteilles(id) ON DELETE CASCADE,
    CONSTRAINT fk_mouvements_user      FOREIGN KEY (user_id)      REFERENCES users(id)      ON DELETE CASCADE
) ENGINE=InnoDB;
```

`emplacement_avant_id`/`emplacement_apres_id` n'ont pas de FK : ils pointent vers
`etageres` ou `cartons` selon le `_type` associé (association polymorphe classique,
MySQL ne fait pas de FK conditionnelle). L'intégrité référentielle sur ces deux colonnes
reste donc à la charge de l'application — comme documenté, c'est un choix de modèle
assumé plutôt qu'un oubli.

`type_mouvement = 'entree'` n'a pas d'`emplacement_avant_*` (rien avant). Une **Sortie**
n'a pas d'`emplacement_apres_*` (elle libère l'alvéole, ne va nulle part).

---

## 7. Génération de la référence bouteille (§2.3)

Pas de table dédiée aux valeurs déjà attribuées (elles vivent dans `bouteilles.reference`) ;
une seule ligne par utilisateur pour suivre l'avancement de la séquence :

```sql
CREATE TABLE reference_sequences (
    user_id            BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    longueur_courante  TINYINT UNSIGNED NOT NULL DEFAULT 2,
    dernier_index      BIGINT UNSIGNED NOT NULL DEFAULT 0,  -- position dans l'espace de codes de cette longueur
    CONSTRAINT fk_refseq_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

Logique applicative (pas de SQL) :
- alphabet des caractères suivants = 34 symboles (`0-9` + `a-z` moins `o`,`i`) ;
- 1er caractère = 24 symboles (`a-z` moins `o`,`i`) ;
- espace de codes pour une longueur `L` : `24 × 34^(L-1)` ;
- `dernier_index` incrémenté à chaque génération (avec verrou / transaction pour éviter
  une collision si deux ajouts sont synchronisés au même instant) ; une fois l'espace
  épuisé, `longueur_courante += 1` et `dernier_index` repart à 0.

---

## 8. Ce qui reste ouvert

- **Design de session PWA↔backend** (§1.2 ci-dessus) — durée de vie du token de session,
  stockage côté PWA, comportement au retour réseau après une longue coupure.
- **Recalcul de `date_limite_consommation`** lors d'une modification de
  `duree_garde_annees` : à traiter comme un batch applicatif, pas de trigger SQL prévu
  pour l'instant.
- **Compatibilité `CHECK` constraints** avec la version MySQL/MariaDB réellement
  disponible sur l'offre mutualisée OVH — à vérifier avant de s'y appuyer.
