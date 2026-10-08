<?php

declare(strict_types=1);

namespace CaveAVin\Categories;

use CaveAVin\Bouteilles\RecalculerDateLimiteAction;
use CaveAVin\Bouteilles\ReferentielRepository;
use LogicException;

/**
 * Catégories, seuils et durées de garde (CdC §2.5, §3.9 ; contrat §9). Unicité (type,
 * région) vérifiée ici, y compris pour la générique que l'index unique ne couvre pas. Toute
 * écriture recalcule les dates limites du type dans la même transaction (P17).
 *
 * @phpstan-import-type Categorie from CategorieRepository
 */
final class CategoriesAction
{
    public function __construct(
        private readonly CategorieRepository $categories,
        private readonly ReferentielRepository $referentiels,
        private readonly RecalculerDateLimiteAction $recalculer,
    ) {
    }

    /** @return list<Categorie> */
    public function lister(int $utilisateur): array
    {
        return $this->categories->lister($utilisateur);
    }

    /**
     * @param string|null $region nom de la région (retrouvée ou créée) ; null = générique
     * @return Categorie
     * @throws CategorieExistante
     */
    public function creer(int $utilisateur, string $type, ?string $region, ?int $seuil, ?int $garde): array
    {
        return $this->categories->transaction(function () use ($utilisateur, $type, $region, $seuil, $garde): array {
            $regionId = $region === null ? null : $this->referentiels->trouverOuCreer($utilisateur, 'regions', $region);
            if ($this->categories->existe($utilisateur, $type, $regionId)) {
                throw new CategorieExistante();
            }
            $id = $this->categories->creer($utilisateur, $type, $regionId, $seuil, $garde);
            $this->recalculer->executer($utilisateur, $type);

            return $this->categories->categorie($utilisateur, $id)
                ?? throw new LogicException('Catégorie créée introuvable.');
        });
    }

    /**
     * @param array{seuil?: ?int, garde?: ?int} $modifications champs absents inchangés
     * @return Categorie|null absente ou d'un autre compte
     */
    public function modifier(int $utilisateur, int $id, array $modifications): ?array
    {
        return $this->categories->transaction(function () use ($utilisateur, $id, $modifications): ?array {
            $categorie = $this->categories->categorie($utilisateur, $id, true);
            if ($categorie === null) {
                return null;
            }
            $this->categories->modifier(
                $utilisateur,
                $id,
                array_key_exists('seuil', $modifications) ? $modifications['seuil'] : $categorie['seuil'],
                array_key_exists('garde', $modifications) ? $modifications['garde'] : $categorie['garde'],
            );
            $this->recalculer->executer($utilisateur, $categorie['type']);

            return $this->categories->categorie($utilisateur, $id);
        });
    }

    /** @return bool faux si absente ou d'un autre compte */
    public function supprimer(int $utilisateur, int $id): bool
    {
        return $this->categories->transaction(function () use ($utilisateur, $id): bool {
            $categorie = $this->categories->categorie($utilisateur, $id, true);
            if ($categorie === null) {
                return false;
            }
            $this->categories->supprimer($utilisateur, $id);
            $this->recalculer->executer($utilisateur, $categorie['type']);

            return true;
        });
    }
}
