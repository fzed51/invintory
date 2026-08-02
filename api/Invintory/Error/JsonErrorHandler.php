<?php

namespace Invintory\Error;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Exception\HttpException;
use Slim\Exception\HttpMethodNotAllowedException;
use Slim\Psr7\Response as SlimResponse;

/**
 * Gestionnaire d'erreurs de l'API.
 *
 * Renvoie toujours la même forme que les contrôleurs, {"error": "message"},
 * afin qu'un client n'ait jamais à distinguer une erreur métier d'une
 * exception non rattrapée. Sans ce gestionnaire, Slim laissait remonter les
 * exceptions jusqu'à PHP, qui renvoyait au client une page HTML contenant la
 * trace complète et les chemins du serveur.
 */
class JsonErrorHandler
{
    /**
     * Messages exposés par code HTTP. Volontairement génériques : le détail
     * réel n'est joint que si les détails d'erreur sont activés.
     *
     * @var array<int, string>
     */
    private const MESSAGES = [
        400 => 'Requête invalide.',
        401 => 'Authentification requise.',
        403 => 'Accès refusé.',
        404 => 'Ressource introuvable.',
        405 => 'Méthode non autorisée.',
        410 => 'Ressource définitivement supprimée.',
        429 => 'Trop de requêtes.',
        500 => 'Erreur interne du serveur.',
        501 => 'Fonctionnalité non implémentée.',
        503 => 'Service indisponible.',
    ];

    public function __invoke(
        Request $request,
        \Throwable $exception,
        bool $displayErrorDetails,
        bool $logErrors,
        bool $logErrorDetails
    ): Response {
        $status = $this->statusFor($exception);
        $payload = ['error' => self::MESSAGES[$status] ?? self::MESSAGES[500]];

        // Slim n'exploite $logErrors que dans son gestionnaire par défaut ;
        // en le remplaçant on hérite de la responsabilité de journaliser,
        // sans quoi les pannes serveur disparaissent en silence.
        if ($logErrors && $status >= 500) {
            $this->log($request, $exception, $logErrorDetails);
        }

        if ($displayErrorDetails) {
            $payload['details'] = [
                'type' => get_class($exception),
                'message' => $exception->getMessage(),
                'file' => $exception->getFile(),
                'line' => $exception->getLine(),
                'trace' => explode("\n", $exception->getTraceAsString()),
            ];
        }

        $response = new SlimResponse($status);
        $response->getBody()->write((string) json_encode($payload, JSON_UNESCAPED_UNICODE));
        $response = $response->withHeader('Content-Type', 'application/json');

        // Exigé par la RFC 9110 pour un 405.
        if ($exception instanceof HttpMethodNotAllowedException) {
            $response = $response->withHeader(
                'Allow',
                implode(', ', $exception->getAllowedMethods())
            );
        }

        return $response;
    }

    /**
     * Journalise côté serveur, jamais vers le client. Seules les erreurs 5xx
     * sont tracées : les 4xx sont des fautes de l'appelant et rempliraient le
     * journal à chaque URL erronée.
     */
    private function log(Request $request, \Throwable $exception, bool $withDetails): void
    {
        $line = sprintf(
            '[api] %s %s -> %s: %s',
            $request->getMethod(),
            (string) $request->getUri()->getPath(),
            get_class($exception),
            $exception->getMessage()
        );

        if ($withDetails) {
            $line .= sprintf(
                ' in %s:%d%s%s',
                $exception->getFile(),
                $exception->getLine(),
                PHP_EOL,
                $exception->getTraceAsString()
            );
        }

        error_log($line);
    }

    private function statusFor(\Throwable $exception): int
    {
        if (!$exception instanceof HttpException) {
            return 500;
        }

        $status = $exception->getCode();

        // Un HttpException mal construit pourrait porter un code hors plage :
        // on ne renvoie jamais un statut invalide.
        return $status >= 400 && $status <= 599 ? $status : 500;
    }
}
