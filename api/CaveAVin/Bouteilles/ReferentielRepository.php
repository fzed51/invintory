<?php

declare(strict_types=1);

namespace CaveAVin\Bouteilles;

use CaveAVin\Donnees\Repository;

/**
 * Référentiels évolutifs régions et cépages (schéma §3), propres à chaque utilisateur.
 * Unicité (user_id, nom) sous la collation du schéma : insensible à la casse, sensible
 * aux accents.
 */
final class ReferentielRepository extends Repository
{
    /**
     * Tout le référentiel, ou les noms contenant $recherche ; par ordre alphabétique.
     *
     * @param 'regions'|'cepages' $table
     * @return list<array{id: int, nom: string}>
     */
    public function lister(int $utilisateur, string $table, ?string $recherche): array
    {
        $sql = sprintf('SELECT id, nom FROM %s WHERE user_id = ?', $table);
        $parametres = [$utilisateur];
        if ($recherche !== null && $recherche !== '') {
            $sql .= ' AND nom LIKE ?';
            $parametres[] = '%' . addcslashes($recherche, '\\%_') . '%';
        }

        /** @var list<array{id: int, nom: string}> */
        return $this->lignes($sql . ' ORDER BY nom, id', $parametres);
    }

    /**
     * Id de la valeur nommée $nom, créée si elle n'existe pas encore.
     *
     * @param 'regions'|'cepages' $table
     */
    public function trouverOuCreer(int $utilisateur, string $table, string $nom): int
    {
        $this->executer(
            sprintf('INSERT INTO %s (user_id, nom) VALUES (?, ?)', $table)
            . ' ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)',
            [$utilisateur, $nom],
        );

        return (int) $this->pdo->lastInsertId();
    }
}
