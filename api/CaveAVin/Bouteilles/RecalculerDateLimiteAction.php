<?php

declare(strict_types=1);

namespace CaveAVin\Bouteilles;

/**
 * Recalcul synchrone des dates limites d'un type (P17, Arch §6.2), après toute écriture
 * d'une catégorie de ce type : chaque bouteille, de tout statut, reprend la garde résolue
 * (spécifique, sinon générique, sinon défaut du type).
 */
final class RecalculerDateLimiteAction
{
    public function __construct(private readonly BouteilleRepository $bouteilles)
    {
    }

    public function executer(int $utilisateur, string $type): void
    {
        $gardes = [];
        foreach ($this->bouteilles->pourDateLimite($utilisateur, $type) as $bouteille) {
            $cle = (string) $bouteille['region_id'];
            if (!array_key_exists($cle, $gardes)) {
                $gardes[$cle] = $this->bouteilles->dureeDeGarde($utilisateur, $type, $bouteille['region_id']);
            }
            $date = DateLimite::calculer($type, $bouteille['millesime'], $bouteille['date_entree'], $gardes[$cle]);
            if ($date !== $bouteille['date_limite_consommation']) {
                $this->bouteilles->modifier($utilisateur, $bouteille['id'], ['date_limite_consommation' => $date]);
            }
        }
    }
}
