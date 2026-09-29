<?php

declare(strict_types=1);

namespace CaveAVin;

final class Environnement
{
    /**
     * Lit une variable du .env chargé, sinon de l'environnement du processus
     * ($_ENV est vide quand variables_order n'inclut pas « E »).
     */
    public static function lire(string $cle, string $defaut = ''): string
    {
        $valeur = $_ENV[$cle] ?? getenv($cle);

        return is_string($valeur) && $valeur !== '' ? $valeur : $defaut;
    }

    public static function lireBooleen(string $cle): bool
    {
        return filter_var(self::lire($cle), FILTER_VALIDATE_BOOLEAN);
    }
}
