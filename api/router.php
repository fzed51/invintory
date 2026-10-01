<?php

declare(strict_types=1);

use CaveAVin\Migration\JetonDeDeploiement;
use CaveAVin\Migration\MigrationController;
use CaveAVin\Sante\SanteController;
use Slim\App;

return function (App $app): void {
    // HEAD est servi par la route GET (repli de FastRoute, corps vidé par Slim).
    $app->get('/health', [SanteController::class, 'verifier']);

    // Protégée par X-Deploy-Token (et non par JWT) : seule la CI l'appelle.
    $app->post('/internal/migrate', [MigrationController::class, 'migrer'])
        ->add(new JetonDeDeploiement($app->getResponseFactory()));
};
