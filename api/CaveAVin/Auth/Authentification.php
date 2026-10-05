<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

use CaveAVin\Http\ErreurApi;
use LogicException;
use Psr\Container\ContainerInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Routing\RouteContext;

/**
 * Exige un Bearer valide sur toute route, sauf celles nommées « public.* » (santé, callback,
 * parcours de connexion, migration qui a son propre jeton). Placé après le routage : une
 * route inconnue reste un 404, et HEAD suit la règle de la route GET correspondante.
 */
final class Authentification implements MiddlewareInterface
{
    private const UTILISATEUR = 'utilisateur';
    private const JETON = 'jeton';

    /**
     * Dépendances résolues à la demande : une route publique (GET /health) ne doit ouvrir ni
     * la base ni le client auth-service.
     */
    public function __construct(private readonly ContainerInterface $conteneur)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $route = RouteContext::fromRequest($request)->getRoute();
        if ($route !== null && str_starts_with($route->getName() ?? '', 'public.')) {
            return $handler->handle($request);
        }

        $jeton = $this->jetonPresente($request);
        try {
            $utilisateur = $jeton === null
                ? null
                : $this->utilisateurs()->idParSub($this->verificateur()->verifier($jeton));
        } catch (JetonInvalide) {
            $utilisateur = null;
        }
        if ($jeton === null || $utilisateur === null) {
            throw new ErreurApi(401, 'INVALID_ACCESS_TOKEN', 'Jeton d’accès absent ou invalide.', [
                'WWW-Authenticate' => 'Bearer',
            ]);
        }

        return $handler->handle($request
            ->withAttribute(self::UTILISATEUR, $utilisateur)
            ->withAttribute(self::JETON, $jeton));
    }

    /** users.id de l'utilisateur authentifié, pour filtrer toute requête (isolation). */
    public static function utilisateur(ServerRequestInterface $requete): int
    {
        $utilisateur = $requete->getAttribute(self::UTILISATEUR);

        return is_int($utilisateur) ? $utilisateur : throw new LogicException('Route non authentifiée.');
    }

    /** Access token présenté, à relayer aux routes Bearer d'auth-service. */
    public static function jeton(ServerRequestInterface $requete): string
    {
        $jeton = $requete->getAttribute(self::JETON);

        return is_string($jeton) ? $jeton : throw new LogicException('Route non authentifiée.');
    }

    private function verificateur(): VerificateurDeJeton
    {
        $verificateur = $this->conteneur->get(VerificateurDeJeton::class);
        assert($verificateur instanceof VerificateurDeJeton);

        return $verificateur;
    }

    private function utilisateurs(): UtilisateurRepository
    {
        $utilisateurs = $this->conteneur->get(UtilisateurRepository::class);
        assert($utilisateurs instanceof UtilisateurRepository);

        return $utilisateurs;
    }

    private function jetonPresente(ServerRequestInterface $requete): ?string
    {
        if (preg_match('/^Bearer ([A-Za-z0-9_.-]+)$/', $requete->getHeaderLine('Authorization'), $m) !== 1) {
            return null;
        }

        return $m[1];
    }
}
