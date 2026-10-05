<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration;

use CaveAVin\Migration\Migrateur;
use CaveAVin\Tests\Support\BaseDeTest;
use CaveAVin\Tests\Support\IntegrationTestCase;
use PDO;
use PDOException;

/**
 * Migrations appliquées sur une base vide, comparées au schéma de référence
 * (docs/schema-mysql-cave-a-vin.md, exécuté tel quel dans une seconde base de test).
 */
final class MigrationTest extends IntegrationTestCase
{
    private const SCHEMA = __DIR__ . '/../../../docs/schema-mysql-cave-a-vin.md';

    private const TABLES = [
        'armoires', 'bouteilles', 'cartons', 'categories', 'cepages', 'etageres',
        'mouvements', 'reference_sequences', 'regions', 'user_sessions', 'users',
    ];

    /** @var list<string> fichiers exécutés par la migration de la base vide */
    private static array $executees = [];

    /** Une seule migration depuis une base vide pour la classe (le DDL est lent sous Docker). */
    public static function setUpBeforeClass(): void
    {
        $pdo = BaseDeTest::connexion();
        BaseDeTest::supprimerTables($pdo);
        self::$executees = self::migrateur($pdo)->executer();
    }

    public function testBaseVideMigreeDonneLesOnzeTablesEtLHistorique(): void
    {
        self::assertSame([...self::TABLES, 'migration_story'], $this->tables($this->pdo));
        self::assertCount(13, self::$executees);
        self::assertSame(13, (int) $this->valeur('SELECT COUNT(*) FROM migration_story'));
    }

    public function testLesFichiersSontExecutesDansLOrdreEtRenvoyes(): void
    {
        self::assertSame('mysql/20261002-01-creer-users.sql', self::$executees[0]);
        $tries = self::$executees;
        sort($tries);
        self::assertSame($tries, self::$executees);
    }

    public function testRelancerNExecuteRien(): void
    {
        self::assertSame([], self::migrateur($this->pdo)->executer());
        self::assertSame(13, (int) $this->valeur('SELECT COUNT(*) FROM migration_story'));
    }

    public function testLeSchemaMigreEstIdentiqueAuSchemaDeReference(): void
    {
        $reference = BaseDeTest::base(preg_replace('/_test$/', '_ref_test', BaseDeTest::nomBase()) ?? '');
        BaseDeTest::supprimerTables($reference);
        foreach ($this->instructionsDuSchema() as $instruction) {
            $reference->exec($instruction);
        }

        self::assertSame(self::TABLES, $this->tables($reference));
        foreach (self::REQUETES_DE_STRUCTURE as $aspect => $sql) {
            self::assertSame(
                $this->structure($reference, $sql),
                $this->structure($this->pdo, $sql),
                sprintf('écart sur %s', $aspect),
            );
        }
    }

    public function testChaqueTableEstEnUtf8mb4SensibleAuxAccents(): void
    {
        $requete = $this->pdo->prepare(
            'SELECT DISTINCT TABLE_COLLATION, ENGINE FROM information_schema.TABLES'
            . " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> 'migration_story'"
        );
        $requete->execute();

        self::assertSame([['TABLE_COLLATION' => 'utf8mb4_0900_as_ci', 'ENGINE' => 'InnoDB']], $requete->fetchAll());
    }

    public function testLesDatesDeMouvementSontALaMilliseconde(): void
    {
        $requete = $this->pdo->query(
            'SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS'
            . ' WHERE TABLE_SCHEMA = DATABASE()'
            . " AND COLUMN_NAME IN ('date_mouvement', 'date_dernier_mouvement_applique')"
            . ' ORDER BY TABLE_NAME'
        );

        self::assertNotFalse($requete);
        self::assertSame([
            [
                'TABLE_NAME' => 'bouteilles',
                'COLUMN_NAME' => 'date_dernier_mouvement_applique',
                'COLUMN_TYPE' => 'datetime(3)',
            ],
            ['TABLE_NAME' => 'mouvements', 'COLUMN_NAME' => 'date_mouvement', 'COLUMN_TYPE' => 'datetime(3)'],
        ], $requete->fetchAll());
    }

    public function testLeTicketPrecedentEstUniqueEtFacultatif(): void
    {
        $requete = $this->pdo->query(
            'SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY FROM information_schema.COLUMNS'
            . " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_sessions'"
            . " AND COLUMN_NAME = 'previous_refresh_session_hash'"
        );
        self::assertNotFalse($requete);

        self::assertSame(['char(64)', 'YES', 'UNI'], array_values((array) $requete->fetch()));
    }

    public function testAuthSubFait36Caracteres(): void
    {
        self::assertSame('varchar(36)', $this->valeur(
            'SELECT COLUMN_TYPE FROM information_schema.COLUMNS'
            . " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'auth_sub'"
        ));
    }

    public function testRegionsDistingueLesAccentsMaisPasLaCasse(): void
    {
        $utilisateur = $this->creerUtilisateur();
        $this->pdo->exec("INSERT INTO regions (user_id, nom) VALUES ($utilisateur, 'Rhône'), ($utilisateur, 'Rhone')");

        $this->expectException(PDOException::class);
        $this->pdo->exec("INSERT INTO regions (user_id, nom) VALUES ($utilisateur, 'rhône')");
    }

    public function testAncienneteVientDuMillesimeSinonDeLAnneeDEntree(): void
    {
        $utilisateur = $this->creerUtilisateur();
        $this->pdo->exec(
            'INSERT INTO bouteilles'
            . ' (user_id, reference, type, millesime, date_entree, origine, emplacement_type) VALUES'
            . " ($utilisateur, 'a2', 'rouge', 2015, '2024-03-01', 'achetee', 'hors_rangement'),"
            . " ($utilisateur, 'a3', 'blanc', NULL, '2024-03-01', 'offerte', 'hors_rangement')"
        );

        $requete = $this->pdo->query('SELECT reference, anciennete_annee FROM bouteilles ORDER BY reference');
        self::assertNotFalse($requete);

        self::assertSame(['a2' => 2015, 'a3' => 2024], array_map('intval', $requete->fetchAll(PDO::FETCH_KEY_PAIR)));
    }

    public function testUneEtagereOccupeeNePeutPasEtreSupprimee(): void
    {
        $utilisateur = $this->creerUtilisateur();
        $this->pdo->exec("INSERT INTO armoires (user_id, nom) VALUES ($utilisateur, 'Cuisine')");
        $this->pdo->exec('INSERT INTO etageres (armoire_id, capacite_alveoles) VALUES (LAST_INSERT_ID(), 12)');
        $etagere = (int) $this->pdo->lastInsertId();
        $this->pdo->exec(
            'INSERT INTO bouteilles (user_id, reference, type, date_entree, origine, emplacement_type, etagere_id)'
            . " VALUES ($utilisateur, 'a2', 'rouge', '2024-03-01', 'achetee', 'etagere', $etagere)"
        );

        $this->expectException(PDOException::class);
        $this->pdo->exec("DELETE FROM etageres WHERE id = $etagere");
    }

    public function testSupprimerUnUtilisateurSupprimeSaCave(): void
    {
        $utilisateur = $this->creerUtilisateur();
        $this->pdo->exec("INSERT INTO armoires (user_id, nom) VALUES ($utilisateur, 'Cuisine')");
        $this->pdo->exec('INSERT INTO etageres (armoire_id, capacite_alveoles) VALUES (LAST_INSERT_ID(), 12)');
        $this->pdo->exec("INSERT INTO reference_sequences (user_id) VALUES ($utilisateur)");

        $this->pdo->exec("DELETE FROM users WHERE id = $utilisateur");

        self::assertSame(0, (int) $this->valeur('SELECT COUNT(*) FROM etageres'));
        self::assertSame(0, (int) $this->valeur('SELECT COUNT(*) FROM reference_sequences'));
    }

    /** Aspects comparés, sans le nom de la base (TABLE_SCHEMA). */
    private const REQUETES_DE_STRUCTURE = [
        'tables' => 'SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES'
            . ' WHERE TABLE_SCHEMA = DATABASE() %s ORDER BY TABLE_NAME',
        'colonnes' => 'SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE,'
            . ' CHARACTER_SET_NAME, COLLATION_NAME, COLUMN_KEY, EXTRA, GENERATION_EXPRESSION'
            . ' FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() %s'
            . ' ORDER BY TABLE_NAME, ORDINAL_POSITION',
        'index' => 'SELECT TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME, NON_UNIQUE'
            . ' FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() %s'
            . ' ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX',
        'clés étrangères' => 'SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME,'
            . ' k.REFERENCED_COLUMN_NAME, r.UPDATE_RULE, r.DELETE_RULE'
            . ' FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r'
            . ' ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME'
            . ' WHERE k.TABLE_SCHEMA = DATABASE() %s ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME',
    ];

    /** @return list<array<string, mixed>> */
    private function structure(PDO $pdo, string $sql): array
    {
        $colonne = str_contains($sql, 'k.TABLE_NAME') ? 'k.TABLE_NAME' : 'TABLE_NAME';
        $requete = $pdo->query(sprintf($sql, "AND $colonne <> 'migration_story'"));
        self::assertNotFalse($requete);

        /** @var list<array<string, mixed>> $lignes */
        $lignes = $requete->fetchAll();

        return $lignes;
    }

    /** @return list<string> */
    private function instructionsDuSchema(): array
    {
        preg_match_all('/```sql\n(.*?)```/s', (string) file_get_contents(self::SCHEMA), $blocs);
        $instructions = [];
        foreach ($blocs[1] as $bloc) {
            foreach (preg_split('/;\s*$/m', $bloc) ?: [] as $instruction) {
                if (trim($instruction) !== '') {
                    $instructions[] = $instruction;
                }
            }
        }
        self::assertCount(11, $instructions);

        return $instructions;
    }

    /** @return list<string> */
    private function tables(PDO $pdo): array
    {
        $requete = $pdo->query(
            'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
            . " ORDER BY TABLE_NAME = 'migration_story', TABLE_NAME"
        );
        self::assertNotFalse($requete);

        /** @var list<string> $tables */
        $tables = $requete->fetchAll(PDO::FETCH_COLUMN);

        return $tables;
    }

    private function creerUtilisateur(): int
    {
        $this->pdo->exec("INSERT INTO users (auth_sub, email) VALUES (UUID(), 'a@exemple.fr')");

        return (int) $this->pdo->lastInsertId();
    }

    private static function migrateur(PDO $pdo): Migrateur
    {
        return new Migrateur($pdo, __DIR__ . '/../../migrations');
    }
}
