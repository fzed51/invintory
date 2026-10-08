<?php

declare(strict_types=1);

namespace CaveAVin\Mouvements;

/**
 * Sortie (CdC §3.4, contrat §10.2) : motif obligatoire, irréversible, toujours appliquée
 * quelle que soit sa date (P19). Libère l'emplacement : la bouteille passe en hors rangement
 * (P15), l'origine reste dans le mouvement.
 */
final class SortirBouteilleAction
{
    public const MOTIFS = ['consommee', 'offerte', 'perdue_cassee'];

    public function __construct(private readonly MouvementRepository $mouvements)
    {
    }

    /**
     * @param string $clientRef client_ref de la mutation, devient celui du mouvement
     * @param string $date UTC, Y-m-d H:i:s.v
     * @param string $bouteille client_ref de la bouteille
     * @return array{mouvement_id: int}
     * @throws MutationRejetee
     */
    public function executer(int $utilisateur, string $clientRef, string $date, string $bouteille, string $motif): array
    {
        return $this->mouvements->transaction(function () use ($utilisateur, $clientRef, $date, $bouteille, $motif) {
            $etat = $this->mouvements->bouteille($utilisateur, $bouteille)
                ?? throw MutationRejetee::bouteilleInconnue();
            if ($etat['statut'] === 'sortie') {
                throw MutationRejetee::bouteilleSortie();
            }

            $mouvement = $this->mouvements->enregistrer(
                $utilisateur,
                $etat['id'],
                'sortie',
                $motif,
                ['type' => $etat['emplacement_type'], 'id' => $etat['etagere_id'] ?? $etat['carton_id']],
                null,
                $date,
                $clientRef,
            );
            $this->mouvements->sortir($utilisateur, $etat['id'], $date);

            return ['mouvement_id' => $mouvement];
        });
    }
}
