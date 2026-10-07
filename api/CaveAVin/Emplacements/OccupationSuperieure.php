<?php

declare(strict_types=1);

namespace CaveAVin\Emplacements;

use RuntimeException;

/** Capacité demandée inférieure au nombre de bouteilles rangées (P5 : refusée). */
final class OccupationSuperieure extends RuntimeException
{
    public function __construct(public readonly int $occupees)
    {
        parent::__construct(sprintf('Occupation actuelle : %d bouteilles.', $occupees));
    }
}
