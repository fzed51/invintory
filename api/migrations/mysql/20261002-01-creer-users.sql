CREATE TABLE users (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    auth_sub    VARCHAR(36)  NOT NULL,   -- `sub` du JWT auth-service (VARCHAR(36) côté auth-service, P21)
    email       VARCHAR(255) NOT NULL,   -- mis en cache depuis GET /users/me, resynchro à la connexion
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_auth_sub (auth_sub)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;
