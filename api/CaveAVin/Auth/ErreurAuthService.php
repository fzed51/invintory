<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

use RuntimeException;
use Throwable;

/**
 * Refus ou panne d'auth-service. Le code métier (codeErreur) est stable : c'est lui qu'on
 * teste, jamais le message (intégration §3.2).
 */
final class ErreurAuthService extends RuntimeException
{
    public function __construct(
        public readonly string $codeErreur,
        string $message,
        public readonly int $statut,
        public readonly ?string $reessayerApres = null,
        ?Throwable $precedente = null,
    ) {
        parent::__construct($message, $statut, $precedente);
    }
}
