CREATE TABLE reference_sequences (
    user_id            BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    longueur_courante  TINYINT UNSIGNED NOT NULL DEFAULT 2,
    dernier_index      BIGINT UNSIGNED NOT NULL DEFAULT 0,  -- position dans l'espace de codes de cette longueur
    CONSTRAINT fk_refseq_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;
