<?php

declare(strict_types=1);

namespace CaveAVin\Http;

use CaveAVin\Auth\ErreurAuthService;
use CaveAVin\Journal;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Exception\HttpMethodNotAllowedException;
use Slim\Exception\HttpNotFoundException;
use Slim\Interfaces\ErrorHandlerInterface;
use Throwable;

/** Produit l'enveloppe d'erreur uniforme {"error": {"code": "...", "message": "..."}} (architecture §6.8). */
final class ErreurHandler implements ErrorHandlerInterface
{
    /**
     * Refus d'auth-service relayés tels quels (code et statut), avec un message à nous. Les
     * autres codes (UNAUTHORIZED : notre client_id/secret est faux) sont un défaut de
     * configuration : journalisés, et rendus comme une erreur interne (intégration §3.2).
     */
    private const REFUS_RELAYES = [
        'VALIDATION_FAILED' => 'Données invalides.',
        'INVALID_CREDENTIALS' => 'Identifiants incorrects.',
        'EMAIL_ALREADY_USED' => 'Cette adresse est déjà associée à un compte.',
        'NO_PENDING_REGISTRATION' => 'Aucune inscription en attente pour cette adresse.',
        'ACCESS_REVOKED' => 'Accès suspendu.',
        'RESET_TOKEN_INVALID' => 'Lien de réinitialisation invalide ou expiré.',
        'RATE_LIMITED' => 'Trop de demandes. Réessayez plus tard.',
        'AUTH_SERVICE_UNAVAILABLE' => 'Service d’authentification indisponible. Réessayez plus tard.',
    ];

    public function __construct(
        private readonly ResponseFactoryInterface $fabrique,
        private readonly bool $debug,
        private readonly Journal $journal,
    ) {
    }

    public function __invoke(
        ServerRequestInterface $request,
        Throwable $exception,
        bool $displayErrorDetails,
        bool $logErrors,
        bool $logErrorDetails,
    ): ResponseInterface {
        $reponse = $this->fabrique->createResponse();
        $entetes = [];

        if ($exception instanceof ErreurApi) {
            [$statut, $code, $message, $entetes] = [
                $exception->statut,
                $exception->codeErreur,
                $exception->getMessage(),
                $exception->entetes,
            ];
        } elseif ($exception instanceof ErreurAuthService && isset(self::REFUS_RELAYES[$exception->codeErreur])) {
            [$statut, $code, $message] = [
                $exception->statut,
                $exception->codeErreur,
                self::REFUS_RELAYES[$exception->codeErreur],
            ];
            if ($exception->reessayerApres !== null) {
                $entetes['Retry-After'] = $exception->reessayerApres;
            }
            if ($code === 'AUTH_SERVICE_UNAVAILABLE') {
                $this->journaliser($request, $exception);
            }
        } elseif ($exception instanceof HttpNotFoundException) {
            [$statut, $code, $message] = [404, 'NOT_FOUND', 'Ressource introuvable.'];
        } elseif ($exception instanceof HttpMethodNotAllowedException) {
            [$statut, $code, $message] = [405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée pour cette ressource.'];
            $entetes['Allow'] = implode(', ', $exception->getAllowedMethods());
        } else {
            $statut = 500;
            $code = 'INTERNAL_ERROR';
            $message = $this->debug ? $exception->getMessage() : 'Erreur interne du serveur.';
            $this->journaliser($request, $exception);
        }

        foreach ($entetes as $nom => $valeur) {
            $reponse = $reponse->withHeader($nom, $valeur);
        }
        $reponse->getBody()->write(json_encode(
            ['error' => ['code' => $code, 'message' => $message]],
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE,
        ));

        return $reponse
            ->withStatus($statut)
            ->withHeader('Content-Type', 'application/json');
    }

    private function journaliser(ServerRequestInterface $request, Throwable $exception): void
    {
        $cause = $exception instanceof ErreurAuthService
            ? sprintf('auth-service %s : %s', $exception->codeErreur, $exception->getMessage())
            : $exception->getMessage();

        $this->journal->ecrire('error', sprintf(
            '%s %s : %s (%s:%d)',
            $request->getMethod(),
            $request->getUri()->getPath(),
            $cause,
            $exception->getFile(),
            $exception->getLine(),
        ));
    }
}
