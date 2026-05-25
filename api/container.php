<?php

return function () {
    $containerBuilder = new \DI\ContainerBuilder();
    $jwtSecret = getenv('JWT_SECRET');
    if ($jwtSecret === false || $jwtSecret === '') {
        $jwtSecret = 'invintory-dev-secret-change-me';
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
        \TemplatePhpReact\User\UserRepository::class => \DI\autowire(),
        \TemplatePhpReact\User\JwtService::class => function () use ($jwtSecret) {
            return new \TemplatePhpReact\User\JwtService($jwtSecret);
        },
        \TemplatePhpReact\User\JwtAuthMiddleware::class => \DI\autowire(),
        \TemplatePhpReact\User\RegisterAction::class => \DI\autowire(),
        \TemplatePhpReact\User\LoginAction::class => \DI\autowire(),
        \TemplatePhpReact\User\AuthController::class => \DI\autowire(),
        \TemplatePhpReact\Image\UploadTemporaryImageAction::class => \DI\autowire(),
        \TemplatePhpReact\Image\StreamImageAction::class => \DI\autowire(),
        \TemplatePhpReact\Image\ImageController::class => \DI\autowire(),
    ]);

    return $containerBuilder->build();
};