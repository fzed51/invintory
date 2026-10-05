<?php

declare(strict_types=1);

namespace CaveAVin\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

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

    /** @return array<mixed> */
    protected function corps(ServerRequestInterface $requete): array
    {
        $corps = $requete->getParsedBody();

        return is_array($corps) ? $corps : [];
    }

    /** Champ texte obligatoire et non vide du corps JSON, sinon 400 VALIDATION_FAILED. */
    protected function texte(ServerRequestInterface $requete, string $champ): string
    {
        $valeur = $this->corps($requete)[$champ] ?? null;
        if (!is_string($valeur) || $valeur === '') {
            throw ErreurApi::donneesInvalides(sprintf('Champ « %s » requis.', $champ));
        }

        return $valeur;
    }

    /** Champ texte facultatif ; null s'il est absent. */
    protected function texteFacultatif(ServerRequestInterface $requete, string $champ): ?string
    {
        $valeur = $this->corps($requete)[$champ] ?? null;
        if ($valeur !== null && !is_string($valeur)) {
            throw ErreurApi::donneesInvalides(sprintf('Champ « %s » invalide.', $champ));
        }

        return $valeur;
    }
}
