<?php

declare(strict_types=1);

namespace CaveAVin\Mouvements;

/**
 * Déplacement (CdC §3.5, contrat §10.2) : toujours inscrit à l'historique ; l'état courant
 * ne change que si le mouvement est le plus récent (Arch §4.5). Une bouteille sortie
 * n'accepte plus de mouvement (P19).
 */
final class DeplacerBouteilleAction
{
    public function __construct(
        private readonly MouvementRepository $mouvements,
        private readonly Placement $placement,
    ) {
    }

    /**
     * @param string $clientRef client_ref de la mutation, devient celui du mouvement
     * @param string $date UTC, Y-m-d H:i:s.v
     * @param string $bouteille client_ref de la bouteille
     * @param array{type: string, id?: int} $emplacement
     * @return array{mouvement_id: int, redirection: ?string}
     * @throws MutationRejetee
     */
    public function executer(
        int $utilisateur,
        string $clientRef,
        string $date,
        string $bouteille,
        array $emplacement,
    ): array {
        return $this->mouvements->transaction(function () use (
            $utilisateur,
            $clientRef,
            $date,
            $bouteille,
            $emplacement,
        ): array {
            $etat = $this->mouvements->bouteille($utilisateur, $bouteille)
                ?? throw MutationRejetee::bouteilleInconnue();
            if ($etat['statut'] === 'sortie') {
                throw MutationRejetee::bouteilleSortie();
            }
            $actuel = ['type' => $etat['emplacement_type'], 'id' => $etat['etagere_id'] ?? $etat['carton_id']];
            $destination = $this->placement->destinations($utilisateur, $emplacement, 1, $actuel)[0];

            $mouvement = $this->mouvements->enregistrer(
                $utilisateur,
                $etat['id'],
                'deplacement',
                null,
                $actuel,
                $destination,
                $date,
                $clientRef,
            );
            $this->mouvements->placerSiPlusRecent($utilisateur, $etat['id'], $destination, $date);

            return ['mouvement_id' => $mouvement, 'redirection' => $destination['redirection']];
        });
    }
}
