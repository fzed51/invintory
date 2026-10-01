<?php

declare(strict_types=1);

namespace CaveAVin\Migration;

use CaveAVin\Environnement;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Exige l'en-tête X-Deploy-Token égal à DEPLOY_TOKEN (comparaison à temps constant).
 * Vérifié avant la résolution du contrôleur : un appel refusé n'ouvre pas la base.
 */
final class JetonDeDeploiement implements MiddlewareInterface
{
    public function __construct(private readonly ResponseFactoryInterface $fabrique)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $attendu = Environnement::lire('DEPLOY_TOKEN');

        // Jeton non configuré : tout est refusé (hash_equals('', '') serait vrai).
        if ($attendu !== '' && hash_equals($attendu, $request->getHeaderLine('X-Deploy-Token'))) {
            return $handler->handle($request);
        }

        $reponse = $this->fabrique->createResponse(401)->withHeader('Content-Type', 'application/json');
        $reponse->getBody()->write(json_encode(['error' => [
            'code' => 'INVALID_DEPLOY_TOKEN',
            'message' => 'Jeton de déploiement absent ou invalide.',
        ]], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));

        return $reponse;
    }
}
