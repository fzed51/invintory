<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

/** Ce que reçoit la PWA : l'access token (corps) et le ticket (cookie), jamais le refresh token. */
final class SessionOuverte
{
    public function __construct(
        public readonly string $jetonDAcces,
        public readonly int $expireDans,
        public readonly string $ticket,
    ) {
    }
}
