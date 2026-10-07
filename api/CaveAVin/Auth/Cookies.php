<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

/**
 * Cookies d'authentification, tous HttpOnly (illisibles par le JavaScript), Secure et
 * SameSite=Strict, limités aux routes qui les lisent (décision P3).
 */
final class Cookies
{
    public const SESSION = 'ivt_session';
    public const REINITIALISATION = 'ivt_reinit';

    private const CHEMIN_SESSION = '/api/auth';
    private const CHEMIN_REINITIALISATION = '/api/auth/password';

    /** 30 jours glissants : renouvelé à chaque rafraîchissement. */
    private const DUREE_SESSION = 30 * 86400;

    /** Durée de vie du reset_token chez auth-service (§2.5). */
    private const DUREE_REINITIALISATION = 900;

    public static function session(string $ticket): string
    {
        return self::cookie(self::SESSION, $ticket, self::CHEMIN_SESSION, self::DUREE_SESSION);
    }

    public static function effacerSession(): string
    {
        return self::cookie(self::SESSION, '', self::CHEMIN_SESSION, 0);
    }

    public static function reinitialisation(string $jeton): string
    {
        return self::cookie(
            self::REINITIALISATION,
            $jeton,
            self::CHEMIN_REINITIALISATION,
            self::DUREE_REINITIALISATION,
        );
    }

    public static function effacerReinitialisation(): string
    {
        return self::cookie(self::REINITIALISATION, '', self::CHEMIN_REINITIALISATION, 0);
    }

    private static function cookie(string $nom, string $valeur, string $chemin, int $duree): string
    {
        return sprintf('%s=%s; Path=%s; Max-Age=%d; Secure; HttpOnly; SameSite=Strict', $nom, $valeur, $chemin, $duree);
    }
}
