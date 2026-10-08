<?php

declare(strict_types=1);

namespace CaveAVin\Mouvements;

use CaveAVin\Donnees\Repository;

/**
 * Écritures des mouvements (schéma §6) et de l'état courant des bouteilles qu'ils
 * déplacent : historique append-only, état mis à jour par horloge logique (Arch §4.5).
 *
 * @phpstan-type Etat array{
 *     id: int, statut: string, emplacement_type: string, etagere_id: ?int, carton_id: ?int
 * }
 */
final class MouvementRepository extends Repository
{
    /**
     * Bouteille désignée par son client_ref, verrouillée jusqu'à la fin de la transaction.
     *
     * @return Etat|null
     */
    public function bouteille(int $utilisateur, string $clientRef): ?array
    {
        /** @var Etat|null */
        return $this->ligne(
            'SELECT id, statut, emplacement_type, etagere_id, carton_id FROM bouteilles'
            . ' WHERE user_id = ? AND client_ref = ? FOR UPDATE',
            [$utilisateur, $clientRef],
        );
    }

    public function referencePortee(int $utilisateur, string $reference): bool
    {
        return $this->ligne('SELECT 1 FROM bouteilles WHERE user_id = ? AND reference = ?', [$utilisateur, $reference])
            !== null;
    }

    /**
     * @param array<string, mixed> $colonnes colonnes de bouteilles, hors user_id
     * @return int id de la bouteille
     */
    public function creerBouteille(int $utilisateur, array $colonnes): int
    {
        $colonnes = ['user_id' => $utilisateur] + $colonnes;
        $this->executer(
            sprintf(
                'INSERT INTO bouteilles (%s) VALUES (%s)',
                implode(', ', array_keys($colonnes)),
                implode(', ', array_fill(0, count($colonnes), '?')),
            ),
            array_values($colonnes),
        );

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * @param array{type: string, id: ?int}|null $avant
     * @param array{type: string, id: ?int}|null $apres
     * @return int id du mouvement
     */
    public function enregistrer(
        int $utilisateur,
        int $bouteille,
        string $type,
        ?string $motif,
        ?array $avant,
        ?array $apres,
        string $date,
        ?string $clientRef,
    ): int {
        $this->executer(
            'INSERT INTO mouvements (bouteille_id, user_id, type_mouvement, motif_sortie, emplacement_avant_type,'
            . ' emplacement_avant_id, emplacement_apres_type, emplacement_apres_id, date_mouvement, client_ref)'
            . ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$bouteille, $utilisateur, $type, $motif, $avant['type'] ?? null, $avant['id'] ?? null,
                $apres['type'] ?? null, $apres['id'] ?? null, $date, $clientRef],
        );

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * Range la bouteille si $date est postérieure au dernier mouvement appliqué (Arch §4.5).
     *
     * @param array{type: string, id: ?int} $emplacement
     */
    public function placerSiPlusRecent(int $utilisateur, int $bouteille, array $emplacement, string $date): void
    {
        $this->executer(
            'UPDATE bouteilles SET emplacement_type = ?, etagere_id = ?, carton_id = ?,'
            . ' date_dernier_mouvement_applique = ?'
            . ' WHERE id = ? AND user_id = ?'
            . ' AND (date_dernier_mouvement_applique IS NULL OR date_dernier_mouvement_applique < ?)',
            [
                $emplacement['type'],
                $emplacement['type'] === 'etagere' ? $emplacement['id'] : null,
                $emplacement['type'] === 'carton' ? $emplacement['id'] : null,
                $date,
                $bouteille,
                $utilisateur,
                $date,
            ],
        );
    }

    /**
     * Sortie terminale (P19) : toujours appliquée ; la bouteille quitte son emplacement
     * (P15) et l'horloge logique ne recule pas.
     */
    public function sortir(int $utilisateur, int $bouteille, string $date): void
    {
        $this->executer(
            'UPDATE bouteilles SET statut = \'sortie\', emplacement_type = \'hors_rangement\', etagere_id = NULL,'
            . ' carton_id = NULL,'
            . ' date_dernier_mouvement_applique = GREATEST(COALESCE(date_dernier_mouvement_applique, ?), ?)'
            . ' WHERE id = ? AND user_id = ?',
            [$date, $date, $bouteille, $utilisateur],
        );
    }
}
