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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;
