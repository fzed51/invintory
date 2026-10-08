<?php

declare(strict_types=1);

namespace CaveAVin\Photos;

/**
 * Photos des bouteilles (CdC §4, Arch §5, contrat §11). L'envoi est rejouable : il remplace
 * le fichier. Envoyée pour un lot, la photo est copiée en un fichier distinct par bouteille
 * (Arch §5.3) : modifier l'une ne touche pas les autres.
 */
final class PhotosAction
{
    public function __construct(
        private readonly PhotoRepository $photos,
        private readonly StockagePhotos $stockage,
        private readonly TraitementPhoto $traitement,
    ) {
    }

    /**
     * @param string $clientRef client_ref d'une bouteille ou d'une mutation d'ajout
     * @return bool false si aucune bouteille ne correspond (pas encore synchronisée)
     * @throws PhotoIllisible
     */
    public function envoyer(int $utilisateur, string $clientRef, string $octets): bool
    {
        $images = $this->traitement->preparer($octets);

        return $this->photos->transaction(function () use ($utilisateur, $clientRef, $images): bool {
            $cibles = $this->photos->cibles($utilisateur, $clientRef);
            foreach ($cibles as $bouteille) {
                $chemin = $this->stockage->ecrire(
                    $utilisateur,
                    $bouteille['reference'],
                    $images['photo'],
                    $images['miniature'],
                );
                $this->photos->enregistrer($utilisateur, $bouteille['id'], $chemin);
            }

            return $cibles !== [];
        });
    }

    /** Chemin absolu de la photo (ou de sa miniature), null si la bouteille n'en a pas. */
    public function fichier(int $utilisateur, int $bouteille, bool $miniature): ?string
    {
        $chemin = $this->photos->bouteille($utilisateur, $bouteille)['photo_path'] ?? null;

        return $chemin === null ? null : $this->stockage->fichier($chemin, $miniature);
    }

    /** @return bool false si la bouteille est inconnue ; sans photo, rien à faire */
    public function supprimer(int $utilisateur, int $id): bool
    {
        return $this->photos->transaction(function () use ($utilisateur, $id): bool {
            $bouteille = $this->photos->bouteille($utilisateur, $id);
            if ($bouteille === null) {
                return false;
            }
            if ($bouteille['photo_path'] !== null) {
                $this->photos->enregistrer($utilisateur, $id, null);
                $this->stockage->supprimer($bouteille['photo_path']);
            }

            return true;
        });
    }
}
