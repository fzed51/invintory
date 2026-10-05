<?php

declare(strict_types=1);

namespace CaveAVin\Http;

use RuntimeException;

/** Refus de l'API, rendu dans l'enveloppe {"error": {"code", "message"}} par ErreurHandler. */
final class ErreurApi extends RuntimeException
{
    /** @param array<string, string> $entetes */
    public function __construct(
        public readonly int $statut,
        public readonly string $codeErreur,
        string $message,
        public readonly array $entetes = [],
    ) {
        parent::__construct($message, $statut);
    }

    public static function donneesInvalides(string $message): self
    {
        return new self(400, 'VALIDATION_FAILED', $message);
    }

    public static function introuvable(): self
    {
        return new self(404, 'NOT_FOUND', 'Ressource introuvable.');
    }
}
