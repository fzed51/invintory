<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Unit\Photos;

use CaveAVin\Photos\OrientationExif;
use CaveAVin\Tests\Support\Jpeg;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Lecture de la balise EXIF Orientation sans l'extension exif (absente de certains PHP). */
final class OrientationExifTest extends TestCase
{
    /** @return iterable<string, array{int, bool}> */
    public static function orientations(): iterable
    {
        foreach (range(1, 8) as $valeur) {
            yield 'Motorola ' . $valeur => [$valeur, false];
            yield 'Intel ' . $valeur => [$valeur, true];
        }
    }

    #[DataProvider('orientations')]
    public function testLitLaBalise(int $valeur, bool $intel): void
    {
        self::assertSame($valeur, OrientationExif::lire(Jpeg::quadrants(8, 8, $valeur, $intel)));
    }

    public function testSansExifVautUn(): void
    {
        self::assertSame(1, OrientationExif::lire(Jpeg::quadrants(8, 8)));
    }

    public function testValeurHorsNormeVautUn(): void
    {
        self::assertSame(1, OrientationExif::lire(Jpeg::quadrants(8, 8, 9)));
    }

    public function testDonneesTronqueesOuEtrangeres(): void
    {
        $jpeg = Jpeg::quadrants(8, 8, 6);

        self::assertSame(1, OrientationExif::lire(substr($jpeg, 0, 20)));
        self::assertSame(1, OrientationExif::lire(''));
        self::assertSame(1, OrientationExif::lire('pas une image'));
    }
}
