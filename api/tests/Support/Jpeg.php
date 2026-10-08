<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Support;

use GdImage;
use RuntimeException;

/**
 * Photos de test : quatre quarts de couleurs franches (rouge, vert, bleu, blanc), qui
 * survivent à la compression JPEG et révèlent toute rotation ou symétrie.
 */
final class Jpeg
{
    private const COULEURS = [
        'rouge' => [255, 0, 0],
        'vert' => [0, 255, 0],
        'bleu' => [0, 0, 255],
        'blanc' => [255, 255, 255],
    ];

    /**
     * JPEG $largeur × $hauteur : rouge en haut à gauche, vert en haut à droite, bleu en bas
     * à gauche, blanc en bas à droite ; balise EXIF Orientation si $orientation est donnée.
     *
     * @param positive-int $largeur
     * @param positive-int $hauteur
     */
    public static function quadrants(int $largeur, int $hauteur, ?int $orientation = null, bool $intel = false): string
    {
        $image = imagecreatetruecolor($largeur, $hauteur);
        $quarts = [['rouge', 0, 0], ['vert', 1, 0], ['bleu', 0, 1], ['blanc', 1, 1]];
        foreach ($quarts as [$nom, $x, $y]) {
            [$r, $v, $b] = self::COULEURS[$nom];
            $couleur = imagecolorallocate($image, $r, $v, $b);
            if ($couleur === false) {
                throw new RuntimeException('Couleur de test impossible à allouer.');
            }
            imagefilledrectangle(
                $image,
                intdiv($x * $largeur, 2),
                intdiv($y * $hauteur, 2),
                intdiv(($x + 1) * $largeur, 2) - 1,
                intdiv(($y + 1) * $hauteur, 2) - 1,
                $couleur,
            );
        }
        $jpeg = self::encoder($image);

        return $orientation === null ? $jpeg : self::avecOrientation($jpeg, $orientation, $intel);
    }

    /**
     * Couleur dominante de chaque quart, dans l'ordre haut gauche, haut droit, bas gauche,
     * bas droit.
     *
     * @return list<string>
     */
    public static function quarts(string $jpeg): array
    {
        $image = imagecreatefromstring($jpeg);
        if (!$image instanceof GdImage) {
            throw new RuntimeException('Image de test illisible.');
        }
        $largeur = imagesx($image);
        $hauteur = imagesy($image);
        $noms = [];
        foreach ([[1, 1], [3, 1], [1, 3], [3, 3]] as [$x, $y]) {
            $noms[] = self::nommer(imagecolorat($image, intdiv($x * $largeur, 4), intdiv($y * $hauteur, 4)));
        }

        return $noms;
    }

    /** @return array{0: int, 1: int} largeur et hauteur */
    public static function dimensions(string $jpeg): array
    {
        $taille = getimagesizefromstring($jpeg);
        if ($taille === false) {
            throw new RuntimeException('Image de test illisible.');
        }

        return [$taille[0], $taille[1]];
    }

    /** Insère un segment APP1 « Exif » minimal (IFD0 avec la seule balise Orientation) après SOI. */
    public static function avecOrientation(string $jpeg, int $orientation, bool $intel = false): string
    {
        $court = fn (int $n): string => pack($intel ? 'v' : 'n', $n);
        $long = fn (int $n): string => pack($intel ? 'V' : 'N', $n);
        $tiff = ($intel ? 'II' : 'MM') . $court(42) . $long(8)
            . $court(1)
            . $court(0x0112) . $court(3) . $long(1) . $court($orientation) . $court(0)
            . $long(0);
        $segment = "Exif\0\0" . $tiff;

        return substr($jpeg, 0, 2) . "\xFF\xE1" . pack('n', strlen($segment) + 2) . $segment . substr($jpeg, 2);
    }

    private static function encoder(GdImage $image): string
    {
        ob_start();
        imagejpeg($image, null, 95);

        return (string) ob_get_clean();
    }

    private static function nommer(int|false $pixel): string
    {
        self::assurer($pixel !== false);
        $rvb = [($pixel >> 16) & 0xFF, ($pixel >> 8) & 0xFF, $pixel & 0xFF];
        foreach (self::COULEURS as $nom => $reference) {
            $ecart = 0;
            foreach ($reference as $i => $composante) {
                $ecart = max($ecart, abs($composante - $rvb[$i]));
            }
            if ($ecart < 60) {
                return $nom;
            }
        }

        return sprintf('inconnue(%d,%d,%d)', ...$rvb);
    }

    private static function assurer(bool $condition): void
    {
        if (!$condition) {
            throw new RuntimeException('Image de test invalide.');
        }
    }
}
