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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;
