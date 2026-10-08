<?php

declare(strict_types=1);

namespace CaveAVin\Export;

use CaveAVin\Bouteilles\LireBouteillesAction;
use CaveAVin\Bouteilles\ReferentielRepository;
use CaveAVin\Categories\CategorieRepository;
use CaveAVin\Emplacements\EmplacementRepository;
use CaveAVin\Emplacements\VueCaveAction;
use CaveAVin\Photos\PhotoRepository;
use CaveAVin\Photos\StockagePhotos;

/**
 * Export de toute la cave du compte (CdC §3.9, Arch §7) : emplacements, référentiels,
 * catégories, bouteilles de tout statut avec leurs mouvements, et fichiers des photos.
 *
 * @phpstan-import-type Armoire from VueCaveAction
 * @phpstan-import-type Carton from EmplacementRepository
 * @phpstan-import-type Categorie from CategorieRepository
 * @phpstan-import-type Bouteille from LireBouteillesAction
 * @phpstan-import-type Mouvement from LireBouteillesAction
 * @phpstan-type Export array{
 *     armoires: list<Armoire>, cartons: list<Carton>, regions: list<array{id: int, nom: string}>,
 *     cepages: list<array{id: int, nom: string}>, categories: list<Categorie>,
 *     fiches: list<array{bouteille: Bouteille, mouvements: list<Mouvement>}>, photos: array<string, string>
 * }
 */
final class ExporterAction
{
    public function __construct(
        private readonly VueCaveAction $cave,
        private readonly EmplacementRepository $emplacements,
        private readonly ReferentielRepository $referentiels,
        private readonly CategorieRepository $categories,
        private readonly LireBouteillesAction $bouteilles,
        private readonly PhotoRepository $photos,
        private readonly StockagePhotos $stockage,
    ) {
    }

    /** @return Export photos : chemin absolu de chaque fichier présent, par référence */
    public function executer(int $utilisateur): array
    {
        $photos = [];
        foreach ($this->photos->chemins($utilisateur) as $reference => $chemin) {
            $fichier = $this->stockage->fichier($chemin);
            if ($fichier !== null) {
                $photos[(string) $reference] = $fichier;
            }
        }

        return [
            'armoires' => $this->cave->armoires($utilisateur),
            'cartons' => $this->emplacements->cartons($utilisateur),
            'regions' => $this->referentiels->lister($utilisateur, 'regions', null),
            'cepages' => $this->referentiels->lister($utilisateur, 'cepages', null),
            'categories' => $this->categories->lister($utilisateur),
            'fiches' => $this->bouteilles->fiches($utilisateur),
            'photos' => $photos,
        ];
    }
}
