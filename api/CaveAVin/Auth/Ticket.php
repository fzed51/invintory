<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

/**
 * Identifiant opaque de session (« ticket », décision P3) : 256 bits aléatoires, transportés
 * en cookie HttpOnly. Seule son empreinte SHA-256 est stockée (user_sessions).
 */
final class Ticket
{
    public static function nouveau(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }

    public static function empreinte(string $ticket): string
    {
        return hash('sha256', $ticket);
    }
}
