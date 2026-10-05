<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

/** Paire émise par auth-service à la connexion et à chaque rotation. */
final class Paire
{
    public function __construct(
        public readonly string $jetonDAcces,
        public readonly string $jetonDeRafraichissement,
        public readonly int $expireDans,
    ) {
    }
}
