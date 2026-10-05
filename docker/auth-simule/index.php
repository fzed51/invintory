<?php

/**
 * Doublure d'auth-service servie en HTTP par le service « auth » du docker-compose
 * (php -S), tant que les identifiants réels manquent (suivi, P13). Même classe que les
 * tests : api/tests/Doublure/AuthServiceSimule.php.
 *
 * Route propre à la doublure, pour le développement et les tests de bout en bout :
 * GET /_doublure/emails?a=<adresse> liste les emails « envoyés » (avec leur lien).
 */

declare(strict_types=1);

use CaveAVin\Tests\Doublure\AuthServiceSimule;
use GuzzleHttp\Psr7\Response;
use GuzzleHttp\Psr7\ServerRequest;

require __DIR__ . '/../../api/vendor/autoload.php';

$variable = static function (string $nom): string {
    $valeur = getenv($nom);
    if (!is_string($valeur) || $valeur === '') {
        throw new RuntimeException(sprintf('Variable %s manquante (docker-compose.yml).', $nom));
    }

    return $valeur;
};

try {
    $service = new AuthServiceSimule($variable('AUTH_SIMULE_ETAT'), [
        'client_id' => $variable('AUTH_SIMULE_CLIENT_ID'),
        'client_secret' => $variable('AUTH_SIMULE_CLIENT_SECRET'),
        'redirect_uri' => $variable('AUTH_SIMULE_REDIRECT_URI'),
        'iss' => $variable('AUTH_SIMULE_ISS'),
        'url_publique' => $variable('AUTH_SIMULE_URL_PUBLIQUE'),
    ]);
    $requete = ServerRequest::fromGlobals();

    if ($requete->getMethod() === 'GET' && $requete->getUri()->getPath() === '/_doublure/emails') {
        $adresse = $requete->getQueryParams()['a'] ?? '';
        $reponse = new Response(200, ['Content-Type' => 'application/json'], json_encode(
            $service->emails(is_string($adresse) ? $adresse : ''),
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES,
        ));
    } else {
        $reponse = $service->traiter($requete);
    }
} catch (Throwable $exception) {
    $reponse = AuthServiceSimule::erreurInterne($exception);
}

http_response_code($reponse->getStatusCode());
foreach ($reponse->getHeaders() as $nom => $valeurs) {
    foreach ($valeurs as $valeur) {
        header($nom . ': ' . $valeur, false);
    }
}
echo $reponse->getBody();
