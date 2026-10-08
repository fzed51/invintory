<?php

declare(strict_types=1);

namespace CaveAVin\Photos;

/**
 * Balise EXIF Orientation (0x0112) d'un JPEG, lue sans l'extension exif : parcours des
 * segments jusqu'à APP1 « Exif », puis de l'IFD0. Toute donnée absente, tronquée ou hors
 * norme vaut 1 (image telle quelle).
 */
final class OrientationExif
{
    public static function lire(string $jpeg): int
    {
        if (!str_starts_with($jpeg, "\xFF\xD8")) {
            return 1;
        }
        $position = 2;
        $taille = strlen($jpeg);
        while ($position + 4 <= $taille && $jpeg[$position] === "\xFF") {
            $marqueur = ord($jpeg[$position + 1]);
            $longueur = self::entier($jpeg, $position + 2, 2, false);
            // SOS ou EOI : fin des en-têtes.
            if ($marqueur === 0xDA || $marqueur === 0xD9 || $longueur === null || $longueur < 2) {
                return 1;
            }
            if ($marqueur === 0xE1 && substr($jpeg, $position + 4, 6) === "Exif\0\0") {
                return self::depuisTiff(substr($jpeg, $position + 10, $longueur - 8));
            }
            $position += 2 + $longueur;
        }

        return 1;
    }

    private static function depuisTiff(string $tiff): int
    {
        $intel = match (substr($tiff, 0, 2)) {
            'II' => true,
            'MM' => false,
            default => null,
        };
        if ($intel === null) {
            return 1;
        }
        $ifd = self::entier($tiff, 4, 4, $intel);
        $nombre = $ifd === null ? null : self::entier($tiff, $ifd, 2, $intel);
        if ($ifd === null || $nombre === null) {
            return 1;
        }
        for ($i = 0; $i < $nombre; $i++) {
            $entree = $ifd + 2 + 12 * $i;
            if (self::entier($tiff, $entree, 2, $intel) === 0x0112) {
                $valeur = self::entier($tiff, $entree + 8, 2, $intel);

                return $valeur !== null && $valeur >= 1 && $valeur <= 8 ? $valeur : 1;
            }
        }

        return 1;
    }

    /** Entier non signé de 2 ou 4 octets à $position, null hors des données. */
    private static function entier(string $octets, int $position, int $longueur, bool $intel): ?int
    {
        if ($position < 0 || $position + $longueur > strlen($octets)) {
            return null;
        }
        $format = $longueur === 2 ? ($intel ? 'v' : 'n') : ($intel ? 'V' : 'N');
        $valeur = unpack($format, substr($octets, $position, $longueur));

        return $valeur === false ? null : (int) $valeur[1];
    }
}
