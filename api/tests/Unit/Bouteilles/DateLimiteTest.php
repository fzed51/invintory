<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Unit\Bouteilles;

use CaveAVin\Bouteilles\DateLimite;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Date limite de consommation (P17, contrat §7.1, §13.2) : avec millésime, 31 décembre de
 * (millésime + garde) ; sans, date d'entrée + garde. Garde par défaut selon le type.
 */
final class DateLimiteTest extends TestCase
{
    /** @return iterable<string, array{string, ?int, string, ?int, string}> */
    public static function cas(): iterable
    {
        yield 'millésime et garde de catégorie' => ['rouge', 2018, '2026-10-01', 12, '2030-12-31'];
        yield 'sans millésime : date d’entrée + garde' => ['blanc', null, '2026-10-01', 3, '2029-10-01'];
        yield 'rouge par défaut : 8 ans' => ['rouge', 2018, '2026-10-01', null, '2026-12-31'];
        yield 'blanc par défaut : 4 ans' => ['blanc', 2020, '2026-10-01', null, '2024-12-31'];
        yield 'rosé par défaut : 2 ans' => ['rose', 2024, '2026-10-01', null, '2026-12-31'];
        yield 'effervescent par défaut : 3 ans' => ['effervescent', null, '2026-02-01', null, '2029-02-01'];
        yield 'doux par défaut : 10 ans' => ['doux', 2001, '2026-10-01', null, '2011-12-31'];
        yield 'autre par défaut : 5 ans' => ['autre', null, '2025-01-01', null, '2030-01-01'];
        yield 'garde nulle' => ['rouge', 2020, '2026-10-01', 0, '2020-12-31'];
    }

    #[DataProvider('cas')]
    public function testCalcul(string $type, ?int $millesime, string $entree, ?int $garde, string $attendu): void
    {
        self::assertSame($attendu, DateLimite::calculer($type, $millesime, $entree, $garde));
    }
}
