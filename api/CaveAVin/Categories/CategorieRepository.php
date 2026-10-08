<?php

declare(strict_types=1);

namespace CaveAVin\Categories;

use CaveAVin\Donnees\Repository;

/**
 * Catégories (schéma §4) et ce qu'elles comptent : bouteilles en cave du type, et de la
 * région pour une spécifique ; une générique compte tout son type (P6).
 *
 * @phpstan-type Categorie array{
 *     id: int, type: string, region_id: ?int, region_nom: ?string, seuil: ?int, garde: ?int, nombre: int
 * }
 * @phpstan-type Suggestion array{
 *     domaine: ?string, millesime: ?int, region: ?string, cepage: ?string, dernier_mouvement: ?string
 * }
 */
final class CategorieRepository extends Repository
{
    private const SELECTION = 'SELECT k.id, k.type, k.region_id, r.nom AS region_nom, k.seuil_min AS seuil,'
        . ' k.duree_garde_annees AS garde,'
        . ' (SELECT COUNT(*) FROM bouteilles b WHERE b.user_id = k.user_id AND b.statut = \'en_cave\''
        . ' AND b.type = k.type AND (k.region_id IS NULL OR b.region_id = k.region_id)) AS nombre'
        . ' FROM categories k LEFT JOIN regions r ON r.id = k.region_id WHERE k.user_id = ?';

    /** @return list<Categorie> par type (ordre du schéma), la générique d'abord, puis par région */
    public function lister(int $utilisateur): array
    {
        /** @var list<Categorie> */
        return $this->lignes(
            self::SELECTION . ' ORDER BY k.type, k.region_id IS NOT NULL, r.nom, k.id',
            [$utilisateur],
        );
    }

    /** @return Categorie|null */
    public function categorie(int $utilisateur, int $id, bool $verrouiller = false): ?array
    {
        /** @var Categorie|null */
        return $this->ligne(
            self::SELECTION . ' AND k.id = ?' . ($verrouiller ? ' FOR UPDATE' : ''),
            [$utilisateur, $id],
        );
    }

    /** Vrai si la catégorie (type, région) existe déjà ; region null = générique. */
    public function existe(int $utilisateur, string $type, ?int $region): bool
    {
        return $this->ligne(
            'SELECT 1 FROM categories WHERE user_id = ? AND type = ? AND region_id <=> ?',
            [$utilisateur, $type, $region],
        ) !== null;
    }

    public function creer(int $utilisateur, string $type, ?int $region, ?int $seuil, ?int $garde): int
    {
        $this->executer(
            'INSERT INTO categories (user_id, type, region_id, seuil_min, duree_garde_annees) VALUES (?, ?, ?, ?, ?)',
            [$utilisateur, $type, $region, $seuil, $garde],
        );

        return (int) $this->pdo->lastInsertId();
    }

    public function modifier(int $utilisateur, int $id, ?int $seuil, ?int $garde): void
    {
        $this->executer(
            'UPDATE categories SET seuil_min = ?, duree_garde_annees = ? WHERE id = ? AND user_id = ?',
            [$seuil, $garde, $id, $utilisateur],
        );
    }

    public function supprimer(int $utilisateur, int $id): void
    {
        $this->executer('DELETE FROM categories WHERE id = ? AND user_id = ?', [$id, $utilisateur]);
    }

    /**
     * Vins déjà eus dans la catégorie (bouteilles de tout statut), regroupés par domaine,
     * millésime, région et cépage, du dernier mouvement le plus récent au plus ancien.
     *
     * @return list<Suggestion>
     */
    public function suggestions(int $utilisateur, string $type, ?int $region, int $limite): array
    {
        /** @var list<Suggestion> */
        return $this->lignes(
            'SELECT b.domaine, b.millesime, r.nom AS region, c.nom AS cepage,'
            . ' MAX(m.date_mouvement) AS dernier_mouvement'
            . ' FROM bouteilles b'
            . ' LEFT JOIN regions r ON r.id = b.region_id'
            . ' LEFT JOIN cepages c ON c.id = b.cepage_id'
            . ' LEFT JOIN mouvements m ON m.bouteille_id = b.id AND m.user_id = b.user_id'
            . ' WHERE b.user_id = ? AND b.type = ?' . ($region === null ? '' : ' AND b.region_id = ?')
            . ' GROUP BY b.domaine, b.millesime, b.region_id, b.cepage_id, r.nom, c.nom'
            . ' ORDER BY dernier_mouvement IS NULL, dernier_mouvement DESC, b.domaine, b.millesime'
            . ' LIMIT ' . $limite,
            $region === null ? [$utilisateur, $type] : [$utilisateur, $type, $region],
        );
    }
}
