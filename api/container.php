<?php

declare(strict_types=1);

use CaveAVin\Donnees\Connexion;
use CaveAVin\Environnement;
use CaveAVin\Migration\Migrateur;
use DI\Container;
use DI\ContainerBuilder;

return function (): Container {
    $constructeur = new ContainerBuilder();

    $constructeur->addDefinitions([
        // Connexion MySQL, résolue à la demande : GET /health ne touche pas la base.
        PDO::class => fn (): PDO => Connexion::ouvrir(
            Environnement::lire('DB_HOST', 'localhost'),
            Environnement::lire('DB_PORT', '3306'),
            Environnement::lire('DB_NAME'),
            Environnement::lire('DB_USER'),
            Environnement::lire('DB_PASSWORD'),
        ),
        Migrateur::class => fn (PDO $pdo): Migrateur => new Migrateur($pdo, __DIR__ . '/migrations'),
    ]);

    return $constructeur->build();
};
