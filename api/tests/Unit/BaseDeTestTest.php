<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Unit;

use CaveAVin\Tests\Support\BaseDeTest;
use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class BaseDeTestTest extends TestCase
{
    #[DataProvider('nomsRefuses')]
    public function testRefuseUneBaseQuiNEstPasUneBaseDeTest(string $nom): void
    {
        $this->expectException(LogicException::class);

        BaseDeTest::verifierNom($nom);
    }

    /** @return iterable<string, array{string}> */
    public static function nomsRefuses(): iterable
    {
        yield 'base applicative' => ['invintory'];
        yield 'suffixe au milieu' => ['invintory_test_prod'];
        yield 'vide' => [''];
        yield 'caractère interdit' => ['invintory`_test'];
    }

    public function testAccepteUneBaseDeTest(): void
    {
        BaseDeTest::verifierNom('invintory_test');

        $this->addToAssertionCount(1);
    }
}
