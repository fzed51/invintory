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
    ]);

    return $containerBuilder->build();
};