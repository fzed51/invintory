<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Unit\Photos;

use CaveAVin\Photos\PhotoIllisible;
use CaveAVin\Photos\TraitementPhoto;
use CaveAVin\Tests\Support\Jpeg;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Traitement serveur des photos (Arch §5.2, contrat §11) : orientation EXIF appliquée,
 * recompression JPEG, 1600 px au plus, miniature.
 */
final class TraitementPhotoTest extends TestCase
{
    /**
     * Quarts attendus (haut gauche, haut droit, bas gauche, bas droit) d'une image
     * rouge | vert / bleu | blanc, une fois l'orientation appliquée.
     *
     * @return iterable<string, array{int, list<string>, bool}>
     */
    public static function orientations(): iterable
    {
        yield '1 telle quelle' => [1, ['rouge', 'vert', 'bleu', 'blanc'], false];
        yield '2 miroir horizontal' => [2, ['vert', 'rouge', 'blanc', 'bleu'], false];
        yield '3 demi-tour' => [3, ['blanc', 'bleu', 'vert', 'rouge'], false];
        yield '4 miroir vertical' => [4, ['bleu', 'blanc', 'rouge', 'vert'], false];
        yield '5 transposée' => [5, ['rouge', 'bleu', 'vert', 'blanc'], true];
        yield '6 quart de tour horaire' => [6, ['bleu', 'rouge', 'blanc', 'vert'], true];
        yield '7 transverse' => [7, ['blanc', 'vert', 'bleu', 'rouge'], true];
        yield '8 quart de tour antihoraire' => [8, ['vert', 'blanc', 'rouge', 'bleu'], true];
    }

    /** @param list<string> $quarts */
    #[DataProvider('orientations')]
    public function testOrientationAppliquee(int $orientation, array $quarts, bool $pivotee): void
    {
        $resultat = (new TraitementPhoto())->preparer(Jpeg::quadrants(120, 80, $orientation));

        self::assertSame($quarts, Jpeg::quarts($resultat['photo']));
        self::assertSame($pivotee ? [80, 120] : [120, 80], Jpeg::dimensions($resultat['photo']));
        self::assertSame($quarts, Jpeg::quarts($resultat['miniature']));
    }

    public function testRecompresseeSansExif(): void
    {
        $photo = (new TraitementPhoto())->preparer(Jpeg::quadrants(120, 80, 6))['photo'];

        self::assertStringStartsWith("\xFF\xD8\xFF", $photo);
        self::assertStringNotContainsString("Exif\0\0", $photo);
    }

    public function testReduiteA1600PixelsAuPlus(): void
    {
        $resultat = (new TraitementPhoto())->preparer(Jpeg::quadrants(2400, 1200));

        self::assertSame([1600, 800], Jpeg::dimensions($resultat['photo']));
        self::assertSame([400, 200], Jpeg::dimensions($resultat['miniature']));
        self::assertSame(['rouge', 'vert', 'bleu', 'blanc'], Jpeg::quarts($resultat['photo']));
    }

    public function testCoteLePlusLongApresRotation(): void
    {
        $resultat = (new TraitementPhoto())->preparer(Jpeg::quadrants(2000, 1000, 6));

        self::assertSame([800, 1600], Jpeg::dimensions($resultat['photo']));
        self::assertSame([200, 400], Jpeg::dimensions($resultat['miniature']));
    }

    public function testPetiteImageNonAgrandie(): void
    {
        $resultat = (new TraitementPhoto())->preparer(Jpeg::quadrants(300, 200));

        self::assertSame([300, 200], Jpeg::dimensions($resultat['photo']));
        self::assertSame([300, 200], Jpeg::dimensions($resultat['miniature']));
    }

    /** @return iterable<string, array{string}> */
    public static function illisibles(): iterable
    {
        yield 'vide' => [''];
        yield 'texte' => ['pas une image'];
        yield 'JPEG tronqué' => [substr(Jpeg::quadrants(120, 80), 0, 30)];
        yield 'PNG' => [self::png()];
    }

    #[DataProvider('illisibles')]
    public function testIllisible(string $octets): void
    {
        $this->expectException(PhotoIllisible::class);

        (new TraitementPhoto())->preparer($octets);
    }

    private static function png(): string
    {
        $image = imagecreatetruecolor(4, 4);
        ob_start();
        imagepng($image);

        return (string) ob_get_clean();
    }
}
