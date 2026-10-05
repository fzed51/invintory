<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Support;

use CaveAVin\Donnees\Connexion;
use CaveAVin\Environnement;
use CaveAVin\Migration\Migrateur;
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
    /** @var array<string, PDO> */
    private static array $connexions = [];

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
        return self::base(self::nomBase());
    }

    /** Connexion partagée à une autre base de test (ex. base de référence du schéma). */
    public static function base(string $nom): PDO
    {
        if (!isset(self::$connexions[$nom])) {
            self::verifierNom($nom);
            self::creerBase($nom);
            self::$connexions[$nom] = self::ouvrir(
                $nom,
                Environnement::lire('DB_TEST_USER', 'invintory'),
                Environnement::lire('DB_TEST_PASSWORD', 'changeme'),
            );
        }

        return self::$connexions[$nom];
    }

    /**
     * Applique les migrations en attente (base neuve ou schéma en retard). Si l'historique ne
     * correspond plus aux tables (base de test abîmée), repart d'une base vide.
     */
    public static function migrer(PDO $pdo): void
    {
        $migrateur = new Migrateur($pdo, __DIR__ . '/../../migrations');
        try {
            $migrateur->executer();
        } catch (RuntimeException) {
            self::supprimerTables($pdo);
            $migrateur->executer();
        }
    }

    /** Variables DB_* de l'application pointées sur la base de test (tests de route). */
    public static function exporterVersApplication(): void
    {
        $_ENV['DB_HOST'] = Environnement::lire('DB_TEST_HOST', '127.0.0.1');
        $_ENV['DB_PORT'] = Environnement::lire('DB_TEST_PORT', '3307');
        $_ENV['DB_NAME'] = self::nomBase();
        $_ENV['DB_USER'] = Environnement::lire('DB_TEST_USER', 'invintory');
        $_ENV['DB_PASSWORD'] = Environnement::lire('DB_TEST_PASSWORD', 'changeme');
    }

    public static function oublierApplication(): void
    {
        unset($_ENV['DB_HOST'], $_ENV['DB_PORT'], $_ENV['DB_NAME'], $_ENV['DB_USER'], $_ENV['DB_PASSWORD']);
    }

    /** Supprime toutes les tables de la base courante (base vide avant une migration). */
    public static function supprimerTables(PDO $pdo): void
    {
        $nom = (string) self::valeur($pdo, 'SELECT DATABASE()');
        self::verifierNom($nom);

        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        try {
            foreach (self::tables($pdo, $nom) as $table) {
                $pdo->exec('DROP TABLE `' . str_replace('`', '``', $table) . '`');
            }
        } finally {
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        }
    }

    /**
     * Vide toutes les tables de la base courante, sauf celles exclues et toujours
     * « migration_story » : le schéma migré reste cohérent avec son historique.
     *
     * @param list<string> $exclues
     */
    public static function vider(PDO $pdo, array $exclues = []): void
    {
        $nom = (string) self::valeur($pdo, 'SELECT DATABASE()');
        self::verifierNom($nom);

        $tables = array_diff(self::tables($pdo, $nom), [...$exclues, 'migration_story']);

        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        try {
            foreach ($tables as $table) {
                // DELETE plutôt que TRUNCATE (DDL, lent sous Docker) : les tables de test sont petites.
                $pdo->exec('DELETE FROM `' . str_replace('`', '``', $table) . '`');
            }
        } finally {
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        }
    }

    /** @return list<string> */
    private static function tables(PDO $pdo, string $nom): array
    {
        $requete = $pdo->prepare(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'"
        );
        $requete->execute([$nom]);
        /** @var list<string> $tables */
        $tables = $requete->fetchAll(PDO::FETCH_COLUMN);

        return $tables;
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
        // Même fabrique que l'application : mêmes réglages de session (UTC, utf8mb4).
        return Connexion::ouvrir(
            Environnement::lire('DB_TEST_HOST', '127.0.0.1'),
            Environnement::lire('DB_TEST_PORT', '3307'),
            $base,
            $utilisateur,
            $motDePasse,
        );
    }
}
