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
    date_mouvement          DATETIME(3) NOT NULL,       -- UTC, à la milliseconde (P18)
    client_ref              CHAR(36) NULL,              -- UUID côté client, dédup à la synchro offline
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_mouvements_user_client_ref (user_id, client_ref),
    KEY idx_mouvements_bouteille (bouteille_id, date_mouvement),
    KEY idx_mouvements_user_type (user_id, type_mouvement, date_mouvement),
    CONSTRAINT fk_mouvements_bouteille FOREIGN KEY (bouteille_id) REFERENCES bouteilles(id) ON DELETE CASCADE,
    CONSTRAINT fk_mouvements_user      FOREIGN KEY (user_id)      REFERENCES users(id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;
