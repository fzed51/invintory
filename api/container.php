<?php

return function () {
    $containerBuilder = new \DI\ContainerBuilder();
    $jwtSecret = getenv('JWT_SECRET');
    if ($jwtSecret === false || $jwtSecret === '') {
        // HS256 exige une clé de 256 bits minimum (32 octets).
        $jwtSecret = 'invintory-dev-secret-change-me-in-production';
    }

    $containerBuilder->addDefinitions([
        // PDO SQLite connection
        \PDO::class => function () {
            $dbPath = __DIR__ . '/../data/database.sqlite';

            // Create data directory if it doesn't exist
            $dataDir = dirname($dbPath);
            if (!is_dir($dataDir)) {
                mkdir($dataDir, 0755, true);
            }

            $pdo = new \PDO('sqlite:' . $dbPath);
            $pdo->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
            $pdo->setAttribute(\PDO::ATTR_DEFAULT_FETCH_MODE, \PDO::FETCH_ASSOC);

            // Initialize schema
            $pdo->exec('
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    token TEXT,
                    created_at TEXT NOT NULL
                )
            ');

            $pdo->exec('
                CREATE TABLE IF NOT EXISTS images (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    mime_type TEXT NOT NULL,
                    extension TEXT NOT NULL,
                    storage_path TEXT NOT NULL,
                    is_temporary INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            ');

            return $pdo;
        },
        \Invintory\User\UserRepository::class => \DI\autowire(),
        \Invintory\User\JwtService::class => function () use ($jwtSecret) {
            return new \Invintory\User\JwtService($jwtSecret);
        },
        \Invintory\User\JwtAuthMiddleware::class => \DI\autowire(),
        \Invintory\User\RegisterAction::class => \DI\autowire(),
        \Invintory\User\LoginAction::class => \DI\autowire(),
        \Invintory\User\AuthController::class => \DI\autowire(),
        \Invintory\Image\UploadTemporaryImageAction::class => \DI\autowire(),
        \Invintory\Image\StreamImageAction::class => \DI\autowire(),
        \Invintory\Image\ImageController::class => \DI\autowire(),
    ]);

    return $containerBuilder->build();
};