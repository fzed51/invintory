<?php

declare(strict_types=1);

namespace CaveAVin\Bouteilles;

use CaveAVin\Donnees\Repository;

/**
 * Séquence des références de chaque utilisateur (schéma §7) : longueur courante et nombre
 * de codes déjà distribués dans cette longueur.
 */
final class SequenceRepository extends Repository
{
    /**
     * Position de la séquence, verrouillée jusqu'à la fin de la transaction en cours ; la
     * ligne est créée au premier appel.
     *
     * @return array{longueur: int, index: int}
     */
    public function verrouiller(int $utilisateur): array
    {
        // Verrou exclusif dès l'insertion : avec INSERT IGNORE (verrou partagé sur la ligne
        // existante) puis FOR UPDATE, deux réservations simultanées s'interbloquent.
        $this->executer(
            'INSERT INTO reference_sequences (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = user_id',
            [$utilisateur],
        );

        /** @var array{longueur: int, index: int} */
        return $this->ligne(
            'SELECT longueur_courante AS longueur, dernier_index AS `index` FROM reference_sequences'
            . ' WHERE user_id = ? FOR UPDATE',
            [$utilisateur],
        );
    }

    public function avancer(int $utilisateur, int $longueur, int $index): void
    {
        $this->executer(
            'UPDATE reference_sequences SET longueur_courante = ?, dernier_index = ? WHERE user_id = ?',
            [$longueur, $index, $utilisateur],
        );
    }
}
