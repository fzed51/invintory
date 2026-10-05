<?php

/**
 * Un processus = un appareil qui rafraîchit sa session : POST /api/auth/rafraichir avec le
 * ticket reçu en argument, contre la base de test et la doublure (état partagé, rotation
 * ralentie). Affiche « statut corps ». Lancé en parallèle par RafraichissementConcurrentTest.
 *
 * Usage : php rafraichir.php <dossier d'état de la doublure> <ticket> <délai de rotation en ms>
 */

declare(strict_types=1);

use CaveAVin\Application;
use CaveAVin\Auth\ClientAuthService;
use CaveAVin\Tests\Doublure\AuthServiceSimule;
use CaveAVin\Tests\Doublure\GestionnaireSimule;
use Slim\Psr7\Factory\ServerRequestFactory;

require __DIR__ . '/../../../vendor/autoload.php';

/** @var list<string> $arguments */
$arguments = $_SERVER['argv'];
[, $dossier, $ticket, $delai] = $arguments;

$service = new AuthServiceSimule(
    $dossier,
    ['delai_rotation_ms' => (int) $delai] + AuthServiceSimule::configurationDeTest(),
);
$app = Application::creer([
    ClientAuthService::class => ClientAuthService::creer(
        'https://auth.test',
        'invintory-test',
        'secret-de-test',
        new GestionnaireSimule($service),
    ),
]);

$reponse = $app->handle(
    (new ServerRequestFactory())->createServerRequest('POST', '/api/auth/rafraichir')
        ->withCookieParams(['ivt_session' => $ticket]),
);

echo $reponse->getStatusCode(), ' ', $reponse->getBody();
