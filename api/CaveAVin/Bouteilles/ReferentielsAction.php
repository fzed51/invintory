<?php

declare(strict_types=1);

namespace CaveAVin\Bouteilles;

/** Autocomplétion des régions et cépages (contrat §6) ; sans recherche, tout le référentiel. */
final class ReferentielsAction
{
    public function __construct(private readonly ReferentielRepository $referentiels)
    {
    }

    /**
     * @param 'regions'|'cepages' $table
     * @return list<array{id: int, nom: string}>
     */
    public function lister(int $utilisateur, string $table, ?string $recherche): array
    {
        return $this->referentiels->lister($utilisateur, $table, $recherche);
    }
}
