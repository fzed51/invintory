<?php

declare(strict_types=1);

use CaveAVin\Environnement;
use DI\Container;
use DI\ContainerBuilder;

return function (): Container {
    $constructeur = new ContainerBuilder();

    $constructeur->addDefinitions([
        // Connexion MySQL, résolue à la demande : GET /health ne touche pas la base.
        PDO::class => function (): PDO {
            $dsn = sprintf(
                'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
                Environnement::lire('DB_HOST', 'localhost'),
                Environnement::lire('DB_PORT', '3306'),
                Environnement::lire('DB_NAME'),
            );

            return new PDO($dsn, Environnement::lire('DB_USER'), Environnement::lire('DB_PASSWORD'), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
        },
    ]);

    return $constructeur->build();
};
