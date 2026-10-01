<?php

declare(strict_types=1);

namespace CaveAVin\Donnees;

use PDO;
use Pdo\Mysql;

final class Connexion
{
    /**
     * Connexion MySQL en utf8mb4, dates en UTC (schéma v1.1 : CURRENT_TIMESTAMP et
     * DATETIME(3) des mouvements sont tous en UTC).
     */
    public static function ouvrir(
        string $hote,
        string $port,
        ?string $base,
        string $utilisateur,
        string $motDePasse,
    ): PDO {
        $dsn = sprintf('mysql:host=%s;port=%s;charset=utf8mb4', $hote, $port)
            . ($base === null ? '' : ';dbname=' . $base);

        return new PDO($dsn, $utilisateur, $motDePasse, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            Mysql::ATTR_INIT_COMMAND => "SET time_zone = '+00:00'",
        ]);
    }
}
