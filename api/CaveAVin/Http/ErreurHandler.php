<?php

declare(strict_types=1);

namespace CaveAVin\Http;

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
    public function __construct(
        private readonly ResponseFactoryInterface $fabrique,
        private readonly bool $debug,
        private readonly string $fichierLog,
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

        if ($exception instanceof HttpNotFoundException) {
            $statut = 404;
            $code = 'NOT_FOUND';
            $message = 'Ressource introuvable.';
        } elseif ($exception instanceof HttpMethodNotAllowedException) {
            $statut = 405;
            $code = 'METHOD_NOT_ALLOWED';
            $message = 'Méthode non autorisée pour cette ressource.';
            $reponse = $reponse->withHeader('Allow', implode(', ', $exception->getAllowedMethods()));
        } else {
            $statut = 500;
            $code = 'INTERNAL_ERROR';
            $message = $this->debug ? $exception->getMessage() : 'Erreur interne du serveur.';
            $this->journaliser($request, $exception);
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
        $dossier = dirname($this->fichierLog);
        if (!is_dir($dossier) && !@mkdir($dossier, 0755, true) && !is_dir($dossier)) {
            return;
        }

        $ligne = sprintf(
            "[%s] %s %s : %s (%s:%d)\n",
            date('c'),
            $request->getMethod(),
            $request->getUri()->getPath(),
            $exception->getMessage(),
            $exception->getFile(),
            $exception->getLine(),
        );
        @file_put_contents($this->fichierLog, $ligne, FILE_APPEND | LOCK_EX);
    }
}
