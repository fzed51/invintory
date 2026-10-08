<?php

declare(strict_types=1);

namespace CaveAVin\Photos;

use RuntimeException;

/**
 * Fichiers des photos, hors docroot (Arch §5.2) : `{user_id}/{reference}.jpg` et
 * `{reference}_thumb.jpg`, chemins relatifs au dossier racine (ce qui est stocké dans
 * `bouteilles.photo_path`). Écriture par renommage : un lecteur ne voit jamais un fichier
 * à moitié écrit.
 */
final class StockagePhotos
{
    public function __construct(private readonly string $dossier)
    {
    }

    /** @return string chemin relatif de la photo */
    public function ecrire(int $utilisateur, string $reference, string $photo, string $miniature): string
    {
        $chemin = $utilisateur . '/' . $reference . '.jpg';
        $repertoire = $this->dossier . '/' . $utilisateur;
        if (!is_dir($repertoire) && !@mkdir($repertoire, 0775, true) && !is_dir($repertoire)) {
            throw new RuntimeException('Dossier des photos impossible à créer : ' . $repertoire);
        }
        $this->remplacer($this->absolu($chemin), $photo);
        $this->remplacer($this->absolu(self::miniature($chemin)), $miniature);

        return $chemin;
    }

    /** Chemin absolu du fichier (ou de sa miniature), null s'il n'existe pas. */
    public function fichier(string $chemin, bool $miniature = false): ?string
    {
        $absolu = $this->absolu($miniature ? self::miniature($chemin) : $chemin);

        return is_file($absolu) ? $absolu : null;
    }

    public function supprimer(string $chemin): void
    {
        foreach ([$chemin, self::miniature($chemin)] as $fichier) {
            if (is_file($this->absolu($fichier))) {
                unlink($this->absolu($fichier));
            }
        }
    }

    private static function miniature(string $chemin): string
    {
        return (string) preg_replace('/\.jpg$/', '_thumb.jpg', $chemin);
    }

    private function absolu(string $chemin): string
    {
        return $this->dossier . '/' . $chemin;
    }

    private function remplacer(string $fichier, string $contenu): void
    {
        $temporaire = $fichier . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (file_put_contents($temporaire, $contenu) === false || !rename($temporaire, $fichier)) {
            @unlink($temporaire);
            throw new RuntimeException('Photo impossible à écrire : ' . $fichier);
        }
    }
}
