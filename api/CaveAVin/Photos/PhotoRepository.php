<?php

declare(strict_types=1);

namespace CaveAVin\Photos;

use CaveAVin\Donnees\Repository;

/**
 * Chemin de la photo des bouteilles (`bouteilles.photo_path`, schéma §5).
 *
 * @phpstan-type Cible array{id: int, reference: string, photo_path: ?string}
 */
final class PhotoRepository extends Repository
{
    /**
     * Bouteilles désignées par un client_ref : celle qui le porte, ou celles du lot d'ajout
     * dont il est le batch_id (contrat §11). Verrouillées jusqu'à la fin de la transaction.
     *
     * @return list<Cible>
     */
    public function cibles(int $utilisateur, string $clientRef): array
    {
        /** @var list<Cible> */
        return $this->lignes(
            'SELECT id, reference, photo_path FROM bouteilles'
            . ' WHERE user_id = ? AND (client_ref = ? OR lot_ajout_id = ?) ORDER BY id FOR UPDATE',
            [$utilisateur, $clientRef, $clientRef],
        );
    }

    /** @return Cible|null */
    public function bouteille(int $utilisateur, int $id): ?array
    {
        /** @var Cible|null */
        return $this->ligne(
            'SELECT id, reference, photo_path FROM bouteilles WHERE user_id = ? AND id = ?',
            [$utilisateur, $id],
        );
    }

    /** @return array<string, string> chemin de chaque photo, par référence de bouteille */
    public function chemins(int $utilisateur): array
    {
        /** @var list<array{reference: string, photo_path: string}> $lignes */
        $lignes = $this->lignes(
            'SELECT reference, photo_path FROM bouteilles WHERE user_id = ? AND photo_path IS NOT NULL',
            [$utilisateur],
        );

        return array_column($lignes, 'photo_path', 'reference');
    }

    public function enregistrer(int $utilisateur, int $id, ?string $chemin): void
    {
        $this->executer(
            'UPDATE bouteilles SET photo_path = ? WHERE user_id = ? AND id = ?',
            [$chemin, $utilisateur, $id],
        );
    }
}
