<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Discipline des fichiers de migration (architecture §6.7). */
final class FichiersDeMigrationTest extends TestCase
{
    private const DOSSIER = __DIR__ . '/../../migrations/mysql';

    public function testIlYAUnFichierParTableDuSchema(): void
    {
        self::assertCount(11, self::fichiers());
    }

    #[DataProvider('fichiersDeMigration')]
    public function testLeNomSuitLeFormatDeLOutil(string $fichier): void
    {
        self::assertMatchesRegularExpression('/^\d{8}-\d{2}-[a-z0-9-]+\.sql$/', basename($fichier));
    }

    #[DataProvider('fichiersDeMigration')]
    public function testUneSeuleInstructionParFichier(string $fichier): void
    {
        $lignes = file($fichier, FILE_IGNORE_NEW_LINES) ?: [];
        // L'outil coupe les requêtes sur les lignes « --- » et retire les commentaires « -- ».
        self::assertSame([], preg_grep('/^\s*---/', $lignes), 'séparateur de requêtes interdit');

        $sql = trim(implode("\n", array_map(
            static fn (string $ligne): string => (string) preg_replace('/--.*/', '', $ligne),
            $lignes,
        )));

        self::assertStringEndsWith(';', $sql);
        self::assertSame(1, substr_count($sql, ';'), 'une seule instruction');
    }

    #[DataProvider('fichiersDeMigration')]
    public function testStrictementAdditif(string $fichier): void
    {
        $sql = (string) file_get_contents($fichier);

        // Nouvelle table, nouvel index ou ajout de colonne : jamais de suppression ni de modification.
        self::assertDoesNotMatchRegularExpression('/\b(DROP|TRUNCATE|RENAME|MODIFY|CHANGE)\b/i', $sql);
        self::assertMatchesRegularExpression(
            '/^\s*(--[^\n]*\n\s*)*(CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE \w+ ADD)\b/i',
            $sql,
        );
    }

    /** @return iterable<string, array{string}> */
    public static function fichiersDeMigration(): iterable
    {
        foreach (self::fichiers() as $fichier) {
            yield basename($fichier) => [$fichier];
        }
    }

    /** @return list<string> */
    private static function fichiers(): array
    {
        $fichiers = glob(self::DOSSIER . '/*.sql') ?: [];
        sort($fichiers);

        return $fichiers;
    }
}
