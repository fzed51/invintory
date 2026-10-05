<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * GET /api/auth/callback, le redirect_uri déclaré à auth-service (intégration §3.5) : aucune
 * page rendue ici, une redirection vers la page de retour de la PWA. Le reset_token ne
 * quitte pas le serveur : il passe dans un cookie HttpOnly et disparaît de l'URL.
 */
final class CallbackController
{
    private const STATUTS = [
        'user_registration' => ['confirmed', 'already_confirmed', 'expired'],
        'password_reset' => ['confirmed', 'already_confirmed', 'expired'],
        'email_change' => ['confirmed', 'already_confirmed', 'expired', 'email_taken'],
    ];

    public function retour(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $parametres = $request->getQueryParams();
        $type = $parametres['type'] ?? null;
        $statut = $parametres['status'] ?? null;

        $reponse = $response
            ->withStatus(302)
            ->withHeader('Referrer-Policy', 'no-referrer')
            ->withHeader('Cache-Control', 'no-store');

        if (!is_string($type) || !is_string($statut) || !in_array($statut, self::STATUTS[$type] ?? [], true)) {
            return $reponse->withHeader('Location', '/retour?type=inconnu');
        }

        $jeton = $parametres['reset_token'] ?? null;
        if (
            $type === 'password_reset' && $statut === 'confirmed'
            && is_string($jeton) && preg_match('/^[A-Za-z0-9_-]{1,512}$/', $jeton) === 1
        ) {
            $reponse = $reponse->withHeader('Set-Cookie', Cookies::reinitialisation($jeton));
        }

        return $reponse->withHeader('Location', '/retour?' . http_build_query(['type' => $type, 'status' => $statut]));
    }
}
