<?php

declare(strict_types=1);

namespace CaveAVin\Emplacements;

use CaveAVin\Horloge;

/**
 * Suppression d'une armoire, d'une étagère ou d'un carton (CdC §3.1, P20) : jamais bloquée.
 * Dans la même transaction, avant le DELETE, les bouteilles en cave passent en hors
 * rangement, avec un mouvement « deplacement » daté de la suppression (heure du serveur).
 * Renvoie le nombre de bouteilles basculées, ou null si l'emplacement est absent ou d'un
 * autre compte.
 */
final class SupprimerEmplacementAction
{
    public function __construct(
        private readonly EmplacementRepository $emplacements,
        private readonly Horloge $horloge,
    ) {
    }

    public function armoire(int $utilisateur, int $id): ?int
    {
        return $this->emplacements->transaction(function () use ($utilisateur, $id): ?int {
            if ($this->emplacements->armoire($utilisateur, $id, true) === null) {
                return null;
            }
            $etageres = array_column($this->emplacements->etageres($utilisateur, $id), 'id');
            $basculees = $this->emplacements->basculerHorsRangement($utilisateur, 'etagere', $etageres, $this->date());
            $this->emplacements->supprimerArmoire($utilisateur, $id);

            return $basculees;
        });
    }

    public function etagere(int $utilisateur, int $id): ?int
    {
        return $this->emplacements->transaction(function () use ($utilisateur, $id): ?int {
            if ($this->emplacements->etagere($utilisateur, $id, true) === null) {
                return null;
            }
            $basculees = $this->emplacements->basculerHorsRangement($utilisateur, 'etagere', [$id], $this->date());
            $this->emplacements->supprimerEtagere($utilisateur, $id);

            return $basculees;
        });
    }

    public function carton(int $utilisateur, int $id): ?int
    {
        return $this->emplacements->transaction(function () use ($utilisateur, $id): ?int {
            if ($this->emplacements->carton($utilisateur, $id, true) === null) {
                return null;
            }
            $basculees = $this->emplacements->basculerHorsRangement($utilisateur, 'carton', [$id], $this->date());
            $this->emplacements->supprimerCarton($utilisateur, $id);

            return $basculees;
        });
    }

    /** Format DATETIME(3) de date_mouvement, en UTC. */
    private function date(): string
    {
        return gmdate('Y-m-d H:i:s', $this->horloge->maintenant()) . '.000';
    }
}
