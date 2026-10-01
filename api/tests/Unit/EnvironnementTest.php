<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Unit;

use CaveAVin\Environnement;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class EnvironnementTest extends TestCase
{
    private const CLE = 'INVINTORY_TEST_VARIABLE';

    protected function tearDown(): void
    {
        unset($_ENV[self::CLE]);
        putenv(self::CLE);
    }

    public function testLitLaValeurDuEnv(): void
    {
        $_ENV[self::CLE] = 'valeur';

        self::assertSame('valeur', Environnement::lire(self::CLE, 'defaut'));
    }

    public function testRetombeSurLEnvironnementDuProcessus(): void
    {
        putenv(self::CLE . '=processus');

        self::assertSame('processus', Environnement::lire(self::CLE));
    }

    public function testLeEnvPrimeSurLEnvironnementDuProcessus(): void
    {
        $_ENV[self::CLE] = 'env';
        putenv(self::CLE . '=processus');

        self::assertSame('env', Environnement::lire(self::CLE));
    }

    public function testRenvoieLeDefautQuandAbsente(): void
    {
        self::assertSame('defaut', Environnement::lire(self::CLE, 'defaut'));
    }

    public function testRenvoieLeDefautQuandVide(): void
    {
        $_ENV[self::CLE] = '';

        self::assertSame('defaut', Environnement::lire(self::CLE, 'defaut'));
    }

    #[DataProvider('booleens')]
    public function testLitUnBooleen(string $valeur, bool $attendu): void
    {
        $_ENV[self::CLE] = $valeur;

        self::assertSame($attendu, Environnement::lireBooleen(self::CLE));
    }

    /** @return iterable<string, array{string, bool}> */
    public static function booleens(): iterable
    {
        yield 'true' => ['true', true];
        yield '1' => ['1', true];
        yield 'on' => ['on', true];
        yield 'false' => ['false', false];
        yield '0' => ['0', false];
        yield 'texte quelconque' => ['peut-être', false];
    }

    public function testBooleenAbsentVautFaux(): void
    {
        self::assertFalse(Environnement::lireBooleen(self::CLE));
    }
}
