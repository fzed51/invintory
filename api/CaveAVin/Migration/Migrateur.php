<?php

declare(strict_types=1);

namespace CaveAVin\Migration;

use Migration\MigrationCore;
use PDO;
use Throwable;

/**
 * Applique les migrations de fzed51/migration (architecture §6.7) sur la connexion de
 * l'application, sans CLI ni exec().
 *
 * MigrationCore plutôt que Migration::run() : ce dernier ouvre sa propre connexion en
 * ignorant le port configuré (suivi, P28).
 */
final class Migrateur
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly string $dossier,
    ) {
    }

    /**
     * Exécute les fichiers en attente, dans l'ordre de leur nom.
     *
     * @return list<string> fichiers exécutés, ex. « mysql/20261002-01-creer-users.sql »
     */
    public function executer(): array
    {
        $outil = (new MigrationCore())
            ->setProvider('mysql')
            ->setMigrationDirectory($this->dossier)
            ->setPdo($this->pdo);

        // L'outil annonce chaque fichier exécuté sur la sortie standard : on la capture.
        ob_start();
        try {
            $outil->run();
        } finally {
            $sortie = (string) ob_get_clean();
        }

        // Fin de ligne PHP_EOL : « \r\n » sous Windows.
        preg_match_all('/^migration : (\S+\.sql)\r?$/m', $sortie, $executees);

        return $executees[1];
    }
}
