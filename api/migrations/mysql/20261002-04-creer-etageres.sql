CREATE TABLE etageres (
    id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    armoire_id         BIGINT UNSIGNED NOT NULL,
    nom                VARCHAR(100) NULL,             -- optionnel, ex. "Étagère du haut"
    capacite_alveoles  SMALLINT UNSIGNED NOT NULL,
    position           SMALLINT UNSIGNED NOT NULL DEFAULT 0,  -- ordre d'affichage
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_etageres_armoire (armoire_id),
    CONSTRAINT fk_etageres_armoire FOREIGN KEY (armoire_id) REFERENCES armoires(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;
