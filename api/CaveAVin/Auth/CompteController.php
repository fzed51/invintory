<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

use CaveAVin\Http\BaseController;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** Routes /api/compte : profil et changement d'email, pour l'utilisateur authentifié. */
final class CompteController extends BaseController
{
    public function __construct(private readonly CompteAction $compte)
    {
    }

    public function profil(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->json($response, $this->compte->profil(
            Authentification::utilisateur($request),
            Authentification::jeton($request),
        ));
    }

    public function changerEmail(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $this->compte->changerEmail(
            Authentification::jeton($request),
            $this->texte($request, 'email'),
            $this->texte($request, 'password'),
        );

        return $this->json($response, ['statut' => 'confirmation_en_attente'], 202);
    }
}
