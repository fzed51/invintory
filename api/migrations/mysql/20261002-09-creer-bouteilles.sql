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
    date_dernier_mouvement_applique DATETIME(3) NULL,   -- horloge logique (date_mouvement du dernier
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;
