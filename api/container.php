<?php

return function () {
    $containerBuilder = new \DI\ContainerBuilder();

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

            return $pdo;
        },
    ]);

    // Here you can add definitions to the container
    // $containerBuilder->addDefinitions([...]);

    return $containerBuilder->build();
};