<?php

declare(strict_types=1);

namespace CaveAVin\Categories;

/**
 * Manques (CdC §3.7, contrat §9) : une catégorie à seuil dont le compte est inférieur. Le
 * seuil est celui de la catégorie même, sans héritage (contrat §13.7).
 *
 * @phpstan-import-type Categorie from CategorieRepository
 * @phpstan-import-type Suggestion from CategorieRepository
 * @phpstan-type Manque array{categorie: Categorie, seuil: int, manquantes: int, suggestions: list<Suggestion>}
 */
final class ManquesAction
{
    public const SUGGESTIONS_MAX = 10;

    public function __construct(private readonly CategorieRepository $categories)
    {
    }

    /** @return list<Manque> dans l'ordre des catégories */
    public function executer(int $utilisateur): array
    {
        $manques = [];
        foreach ($this->categories->lister($utilisateur) as $categorie) {
            $seuil = $categorie['seuil'];
            if ($seuil === null || $categorie['nombre'] >= $seuil) {
                continue;
            }
            $manques[] = [
                'categorie' => $categorie,
                'seuil' => $seuil,
                'manquantes' => $seuil - $categorie['nombre'],
                'suggestions' => $this->categories->suggestions(
                    $utilisateur,
                    $categorie['type'],
                    $categorie['region_id'],
                    self::SUGGESTIONS_MAX,
                ),
            ];
        }

        return $manques;
    }
}
