<?php

declare(strict_types=1);

namespace CaveAVin\Bouteilles;

/**
 * Édition de la fiche (contrat §7.3) : régions et cépages nommés sont retrouvés ou créés
 * (§6), la date limite est recalculée (P17). L'emplacement et le statut ne changent que par
 * un mouvement.
 *
 * @phpstan-import-type Bouteille from LireBouteillesAction
 * @phpstan-type Modifications array{
 *     type?: string, region?: ?string, cepage?: ?string, domaine?: ?string, millesime?: ?int,
 *     date_entree?: string, origine?: string, note?: ?string, souvenir?: bool
 * }
 */
final class ModifierBouteilleAction
{
    /** Champs repris tels quels : ils portent le nom de leur colonne. */
    private const COLONNES = ['type', 'domaine', 'millesime', 'date_entree', 'origine', 'note'];

    public function __construct(
        private readonly BouteilleRepository $bouteilles,
        private readonly ReferentielRepository $referentiels,
        private readonly LireBouteillesAction $lire,
    ) {
    }

    /**
     * @param Modifications $modifications champs absents inchangés ; date_entree au format Y-m-d
     * @return Bouteille|null absente ou d'un autre compte
     */
    public function executer(int $utilisateur, int $id, array $modifications): ?array
    {
        $modifiee = $this->bouteilles->transaction(function () use ($utilisateur, $id, $modifications): bool {
            $actuelle = $this->bouteilles->verrouiller($utilisateur, $id);
            if ($actuelle === null) {
                return false;
            }
            $colonnes = array_intersect_key($modifications, array_flip(self::COLONNES));
            if (array_key_exists('souvenir', $modifications)) {
                $colonnes['tag_souvenir'] = (int) $modifications['souvenir'];
            }
            if (array_key_exists('region', $modifications)) {
                $colonnes['region_id'] = $this->referentiel($utilisateur, 'regions', $modifications['region']);
            }
            if (array_key_exists('cepage', $modifications)) {
                $colonnes['cepage_id'] = $this->referentiel($utilisateur, 'cepages', $modifications['cepage']);
            }
            $type = $modifications['type'] ?? $actuelle['type'];
            $colonnes['date_limite_consommation'] = DateLimite::calculer(
                $type,
                array_key_exists('millesime', $modifications) ? $modifications['millesime'] : $actuelle['millesime'],
                $modifications['date_entree'] ?? $actuelle['date_entree'],
                $this->bouteilles->dureeDeGarde(
                    $utilisateur,
                    $type,
                    array_key_exists('region_id', $colonnes) ? $colonnes['region_id'] : $actuelle['region_id'],
                ),
            );
            $this->bouteilles->modifier($utilisateur, $id, $colonnes);

            return true;
        });

        return $modifiee ? $this->lire->bouteille($utilisateur, $id) : null;
    }

    /** @param 'regions'|'cepages' $table */
    private function referentiel(int $utilisateur, string $table, ?string $nom): ?int
    {
        return $nom === null ? null : $this->referentiels->trouverOuCreer($utilisateur, $table, $nom);
    }
}
