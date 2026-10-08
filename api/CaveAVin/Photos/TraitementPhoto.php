<?php

declare(strict_types=1);

namespace CaveAVin\Photos;

use GdImage;

/**
 * Traitement serveur d'une photo (Arch §5.2, contrat §11) avec GD : orientation EXIF
 * appliquée aux pixels, réduction à 1600 px de côté au plus, recompression JPEG (les
 * métadonnées tombent) et miniature. Jamais d'agrandissement.
 */
final class TraitementPhoto
{
    public const COTE_MAX = 1600;
    public const COTE_MINIATURE = 400;
    private const QUALITE = 85;

    /**
     * @return array{photo: string, miniature: string} deux JPEG
     * @throws PhotoIllisible
     */
    public function preparer(string $octets): array
    {
        if (!str_starts_with($octets, "\xFF\xD8\xFF")) {
            throw new PhotoIllisible();
        }
        $image = @imagecreatefromstring($octets);
        if (!$image instanceof GdImage) {
            throw new PhotoIllisible();
        }
        $image = self::orienter($image, OrientationExif::lire($octets));

        return [
            'photo' => self::encoder(self::reduire($image, self::COTE_MAX)),
            'miniature' => self::encoder(self::reduire($image, self::COTE_MINIATURE)),
        ];
    }

    /** Transformation qui redresse l'image selon la balise (2 à 8 ; 1 = telle quelle). */
    private static function orienter(GdImage $image, int $orientation): GdImage
    {
        if (in_array($orientation, [2, 5, 7], true)) {
            imageflip($image, IMG_FLIP_HORIZONTAL);
        }
        if ($orientation === 4) {
            imageflip($image, IMG_FLIP_VERTICAL);
        }
        // imagerotate tourne dans le sens antihoraire.
        $angle = match ($orientation) {
            3 => 180,
            6, 7 => 270,
            5, 8 => 90,
            default => 0,
        };
        if ($angle === 0) {
            return $image;
        }
        $tournee = imagerotate($image, $angle, 0);

        return $tournee instanceof GdImage ? $tournee : $image;
    }

    private static function reduire(GdImage $image, int $coteMax): GdImage
    {
        $largeur = imagesx($image);
        $hauteur = imagesy($image);
        if (max($largeur, $hauteur) <= $coteMax) {
            return $image;
        }
        $echelle = $coteMax / max($largeur, $hauteur);
        $reduite = imagescale(
            $image,
            max(1, (int) round($largeur * $echelle)),
            max(1, (int) round($hauteur * $echelle)),
            IMG_BICUBIC,
        );

        return $reduite instanceof GdImage ? $reduite : $image;
    }

    private static function encoder(GdImage $image): string
    {
        ob_start();
        imagejpeg($image, null, self::QUALITE);

        return (string) ob_get_clean();
    }
}
