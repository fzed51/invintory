<?php

declare(strict_types=1);

use CaveAVin\Sante\SanteController;
use Slim\App;

return function (App $app): void {
    // HEAD est servi par la route GET (repli de FastRoute, corps vidé par Slim).
    $app->get('/health', [SanteController::class, 'verifier']);
};
