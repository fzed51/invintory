<?php

declare(strict_types=1);

namespace CaveAVin\Http;

use Psr\Http\Message\ResponseInterface;

abstract class BaseController
{
    /** @param array<string, mixed> $donnees */
    protected function json(ResponseInterface $reponse, array $donnees, int $statut = 200): ResponseInterface
    {
        $reponse->getBody()->write(json_encode($donnees, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));

        return $reponse
            ->withStatus($statut)
            ->withHeader('Content-Type', 'application/json');
    }
}
