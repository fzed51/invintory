<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Unit\Bouteilles;

use CaveAVin\Bouteilles\CodeReference;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Référence courte (CdC §2.3, schéma §7) : 1er caractère parmi 24 lettres (sans o ni i),
 * suivants parmi 34 symboles (0-9 puis a-z sans o ni i), espace de 24 × 34^(L-1) codes.
 */
final class CodeReferenceTest extends TestCase
{
    /** @return iterable<string, array{int, int, string}> */
    public static function codes(): iterable
    {
        yield 'premier code' => [2, 0, 'a0'];
        yield 'chiffres d’abord' => [2, 9, 'a9'];
        yield 'puis les lettres' => [2, 10, 'aa'];
        yield 'h' => [2, 17, 'ah'];
        yield 'i sauté' => [2, 18, 'aj'];
        yield 'o sauté' => [2, 23, 'ap'];
        yield 'dernier second caractère' => [2, 33, 'az'];
        yield 'premier caractère suivant' => [2, 34, 'b0'];
        yield 'i sauté en tête' => [2, 8 * 34, 'j0'];
        yield 'dernier code à 2 caractères' => [2, 24 * 34 - 1, 'zz'];
        yield 'premier code à 3 caractères' => [3, 0, 'a00'];
        yield 'à 3 caractères' => [3, 34 * 34 + 35, 'b11'];
    }

    #[DataProvider('codes')]
    public function testCode(int $longueur, int $index, string $attendu): void
    {
        self::assertSame($attendu, CodeReference::code($longueur, $index));
    }

    public function testCapacite(): void
    {
        self::assertSame([816, 27744], [CodeReference::capacite(2), CodeReference::capacite(3)]);
    }

    public function testTousLesCodesDUneLongueurSontDistinctsEtSansOni(): void
    {
        $codes = array_map(fn (int $i): string => CodeReference::code(2, $i), range(0, 815));

        self::assertCount(816, array_unique($codes));
        self::assertSame([], preg_grep('/[oi]/', $codes));
        self::assertSame([], preg_grep('/^[a-z][0-9a-z]$/', $codes, PREG_GREP_INVERT));
    }

    /** @return iterable<string, array{int, int}> */
    public static function horsEspace(): iterable
    {
        yield 'index négatif' => [2, -1];
        yield 'index au-delà de l’espace' => [2, 816];
        yield 'longueur nulle' => [0, 0];
    }

    #[DataProvider('horsEspace')]
    public function testHorsDeLEspaceDeCodes(int $longueur, int $index): void
    {
        $this->expectException(InvalidArgumentException::class);

        CodeReference::code($longueur, $index);
    }

    /** @return iterable<string, array{string, string}> */
    public static function saisies(): iterable
    {
        yield 'déjà propre' => ['a7', 'a7'];
        yield 'majuscules' => ['A7', 'a7'];
        yield 'espaces' => [' b 1 1 ', 'b11'];
    }

    #[DataProvider('saisies')]
    public function testNormaliserUneSaisie(string $saisie, string $attendu): void
    {
        self::assertSame($attendu, CodeReference::normaliser($saisie));
    }

    #[DataProvider('codes')]
    public function testPositionDUnCode(int $longueur, int $index, string $code): void
    {
        self::assertSame(['longueur' => $longueur, 'index' => $index], CodeReference::position($code));
    }

    /** @return iterable<string, array{string}> */
    public static function codesInvalides(): iterable
    {
        yield 'vide' => [''];
        yield 'un seul caractère' => ['a'];
        yield 'chiffre en tête' => ['0a'];
        yield 'o' => ['ao'];
        yield 'i en tête' => ['i0'];
        yield 'majuscule' => ['A0'];
        yield 'plus long que la colonne (10)' => ['a0000000000'];
    }

    #[DataProvider('codesInvalides')]
    public function testPositionDUnCodeInvalide(string $code): void
    {
        self::assertNull(CodeReference::position($code));
    }
}
