<?php

declare(strict_types=1);

namespace CaveAVin\Synchronisation;

use CaveAVin\Donnees\Repository;

/**
 * Ce qui a déjà été reçu (Arch §4.2) : bouteilles par client_ref, avec la destination de
 * leur mouvement d'entrée, et mouvements par client_ref de leur mutation.
 *
 * @phpstan-type BouteilleRecue array{
 *     client_ref: string, id: int, reference: string, lot_ajout_id: ?string,
 *     apres_type: ?string, apres_id: ?int
 * }
 * @phpstan-type MouvementRecu array{id: int, type_mouvement: string, apres_type: ?string, apres_id: ?int}
 */
final class SynchronisationRepository extends Repository
{
    /**
     * @param non-empty-list<string> $clientRefs
     * @return array<string, BouteilleRecue> par client_ref
     */
    public function bouteilles(int $utilisateur, array $clientRefs): array
    {
        /** @var list<BouteilleRecue> $lignes */
        $lignes = $this->lignes(
            'SELECT b.client_ref, b.id, b.reference, b.lot_ajout_id,'
            . ' m.emplacement_apres_type AS apres_type, m.emplacement_apres_id AS apres_id'
            . ' FROM bouteilles b'
            . ' LEFT JOIN mouvements m ON m.bouteille_id = b.id AND m.user_id = b.user_id'
            . ' AND m.type_mouvement = \'entree\''
            . ' WHERE b.user_id = ? AND b.client_ref IN ('
            . implode(', ', array_fill(0, count($clientRefs), '?')) . ')',
            [$utilisateur, ...$clientRefs],
        );

        return array_column($lignes, null, 'client_ref');
    }

    /** @return MouvementRecu|null */
    public function mouvement(int $utilisateur, string $clientRef): ?array
    {
        /** @var MouvementRecu|null */
        return $this->ligne(
            'SELECT id, type_mouvement, emplacement_apres_type AS apres_type, emplacement_apres_id AS apres_id'
            . ' FROM mouvements WHERE user_id = ? AND client_ref = ?',
            [$utilisateur, $clientRef],
        );
    }
}
