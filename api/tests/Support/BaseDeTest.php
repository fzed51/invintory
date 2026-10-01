<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Support;

use CaveAVin\Environnement;
use LogicException;
use PDO;
use RuntimeException;

/**
 * Base MySQL dédiée aux tests d'intégration, dans la doublure Docker.
 *
 * Variables (défauts = docker-compose vu depuis l'hôte) : DB_TEST_HOST, DB_TEST_PORT,
 * DB_TEST_NAME, DB_TEST_USER, DB_TEST_PASSWORD, DB_TEST_ROOT_PASSWORD.
 */
final class BaseDeTest
{
    private static ?PDO $connexion = null;

    public static function nomBase(): string
    {
        return Environnement::lire('DB_TEST_NAME', 'invintory_test');
    }

    /** Garde-fou : on ne vide jamais une base dont le nom ne finit pas par « _test ». */
    public static function verifierNom(string $nom): void
    {
        if (preg_match('/^[A-Za-z0-9_]+_test$/', $nom) !== 1) {
            throw new LogicException(sprintf('« %s » n\'est pas une base de test (suffixe _test attendu).', $nom));
        }
    }

    /** Connexion partagée, avec l'utilisateur applicatif ; crée la base au premier appel. */
    public static function connexion(): PDO
    {
        if (self::$connexion === null) {
            $nom = self::nomBase();
            self::verifierNom($nom);
            self::creerBase($nom);
            self::$connexion = self::ouvrir(
                $nom,
                Environnement::lire('DB_TEST_USER', 'invintory'),
                Environnement::lire('DB_TEST_PASSWORD', 'changeme'),
            );
        }

        return self::$connexion;
    }

    /**
     * Vide toutes les tables de la base courante, sauf celles exclues
     * (par exemple « migration_story », pour garder le schéma migré).
     *
     * @param list<string> $exclues
     */
    public static function vider(PDO $pdo, array $exclues = []): void
    {
        $nom = (string) self::valeur($pdo, 'SELECT DATABASE()');
        self::verifierNom($nom);

        $requete = $pdo->prepare(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'"
        );
        $requete->execute([$nom]);
        /** @var list<string> $tables */
        $tables = array_diff($requete->fetchAll(PDO::FETCH_COLUMN), $exclues);

        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        try {
            foreach ($tables as $table) {
                $pdo->exec('TRUNCATE TABLE `' . str_replace('`', '``', $table) . '`');
            }
        } finally {
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        }
    }

    /** Première colonne de la première ligne d'une requête sans paramètre. */
    public static function valeur(PDO $pdo, string $sql): mixed
    {
        $requete = $pdo->query($sql);
        if ($requete === false) {
            throw new RuntimeException('Requête impossible : ' . $sql);
        }

        return $requete->fetchColumn();
    }

    /** Crée la base et donne les droits à l'utilisateur applicatif (compte root de la doublure). */
    private static function creerBase(string $nom): void
    {
        $root = self::ouvrir(null, 'root', Environnement::lire('DB_TEST_ROOT_PASSWORD', 'root'));
        $root->exec(sprintf('CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4', $nom));
        $root->exec(sprintf(
            "GRANT ALL PRIVILEGES ON `%s`.* TO '%s'@'%%'",
            $nom,
            str_replace("'", "''", Environnement::lire('DB_TEST_USER', 'invintory')),
        ));
    }

    private static function ouvrir(?string $base, string $utilisateur, string $motDePasse): PDO
    {
        $dsn = sprintf(
            'mysql:host=%s;port=%s;charset=utf8mb4',
            Environnement::lire('DB_TEST_HOST', '127.0.0.1'),
            Environnement::lire('DB_TEST_PORT', '3307'),
        ) . ($base === null ? '' : ';dbname=' . $base);

        return new PDO($dsn, $utilisateur, $motDePasse, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
}
