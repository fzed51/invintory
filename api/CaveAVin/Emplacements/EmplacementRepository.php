<?php

declare(strict_types=1);

namespace CaveAVin\Emplacements;

use CaveAVin\Donnees\Repository;

/**
 * Armoires, étagères et cartons (schéma §1.3–1.5). Les étagères n'ont pas de user_id : leur
 * isolation passe par l'armoire. L'occupation ne compte que les bouteilles en cave.
 *
 * @phpstan-type Etagere array{id: int, armoire_id: int, nom: ?string, position: int, capacite: int, occupees: int}
 * @phpstan-type Carton array{id: int, identifiant: string, capacite: int, occupees: int}
 */
final class EmplacementRepository extends Repository
{
    private const ETAGERES = 'SELECT e.id, e.armoire_id, e.nom, e.position, e.capacite_alveoles AS capacite,'
        . ' (SELECT COUNT(*) FROM bouteilles b WHERE b.user_id = a.user_id AND b.statut = \'en_cave\''
        . ' AND b.emplacement_type = \'etagere\' AND b.etagere_id = e.id) AS occupees'
        . ' FROM etageres e JOIN armoires a ON a.id = e.armoire_id WHERE a.user_id = ?';

    private const CARTONS = 'SELECT c.id, c.identifiant, c.capacite,'
        . ' (SELECT COUNT(*) FROM bouteilles b WHERE b.user_id = c.user_id AND b.statut = \'en_cave\''
        . ' AND b.emplacement_type = \'carton\' AND b.carton_id = c.id) AS occupees'
        . ' FROM cartons c WHERE c.user_id = ?';

    /** Colonne de bouteilles désignant chaque type d'emplacement. */
    private const COLONNES = ['etagere' => 'etagere_id', 'carton' => 'carton_id'];

    /** @return list<array{id: int, nom: string}> par id croissant */
    public function armoires(int $utilisateur): array
    {
        /** @var list<array{id: int, nom: string}> */
        return $this->lignes('SELECT id, nom FROM armoires WHERE user_id = ? ORDER BY id', [$utilisateur]);
    }

    /** @return array{id: int, nom: string}|null */
    public function armoire(int $utilisateur, int $id, bool $verrouiller = false): ?array
    {
        /** @var array{id: int, nom: string}|null */
        return $this->ligne(
            'SELECT id, nom FROM armoires WHERE id = ? AND user_id = ?' . ($verrouiller ? ' FOR UPDATE' : ''),
            [$id, $utilisateur],
        );
    }

    /** @return list<Etagere> par armoire, puis position, puis id */
    public function etageres(int $utilisateur, ?int $armoire = null): array
    {
        /** @var list<Etagere> */
        return $this->lignes(
            self::ETAGERES . ($armoire === null ? '' : ' AND a.id = ?') . ' ORDER BY a.id, e.position, e.id',
            $armoire === null ? [$utilisateur] : [$utilisateur, $armoire],
        );
    }

    /** @return Etagere|null */
    public function etagere(int $utilisateur, int $id, bool $verrouiller = false): ?array
    {
        /** @var Etagere|null */
        return $this->ligne(
            self::ETAGERES . ' AND e.id = ?' . ($verrouiller ? ' FOR UPDATE' : ''),
            [$utilisateur, $id],
        );
    }

    /** @return list<Carton> par id croissant */
    public function cartons(int $utilisateur): array
    {
        /** @var list<Carton> */
        return $this->lignes(self::CARTONS . ' ORDER BY c.id', [$utilisateur]);
    }

    /** @return Carton|null */
    public function carton(int $utilisateur, int $id, bool $verrouiller = false): ?array
    {
        /** @var Carton|null */
        return $this->ligne(
            self::CARTONS . ' AND c.id = ?' . ($verrouiller ? ' FOR UPDATE' : ''),
            [$utilisateur, $id],
        );
    }

    public function horsRangement(int $utilisateur): int
    {
        return (int) $this->valeur(
            'SELECT COUNT(*) FROM bouteilles'
            . ' WHERE user_id = ? AND statut = \'en_cave\' AND emplacement_type = \'hors_rangement\'',
            [$utilisateur],
        );
    }

    public function creerArmoire(int $utilisateur, string $nom): int
    {
        $this->executer('INSERT INTO armoires (user_id, nom) VALUES (?, ?)', [$utilisateur, $nom]);

        return (int) $this->pdo->lastInsertId();
    }

    public function renommerArmoire(int $utilisateur, int $id, string $nom): void
    {
        $this->executer('UPDATE armoires SET nom = ? WHERE id = ? AND user_id = ?', [$nom, $id, $utilisateur]);
    }

    /** Ajoute une étagère à une armoire de l'utilisateur ; position par défaut : après la dernière. */
    public function creerEtagere(int $utilisateur, int $armoire, ?string $nom, int $capacite, ?int $position): int
    {
        $position ??= 1 + (int) $this->valeur(
            'SELECT COALESCE(MAX(e.position), 0) FROM etageres e JOIN armoires a ON a.id = e.armoire_id'
            . ' WHERE a.id = ? AND a.user_id = ?',
            [$armoire, $utilisateur],
        );
        $this->executer(
            'INSERT INTO etageres (armoire_id, nom, capacite_alveoles, position)'
            . ' SELECT id, ?, ?, ? FROM armoires WHERE id = ? AND user_id = ?',
            [$nom, $capacite, $position, $armoire, $utilisateur],
        );

        return (int) $this->pdo->lastInsertId();
    }

    public function modifierEtagere(int $utilisateur, int $id, ?string $nom, int $capacite, int $position): void
    {
        $this->executer(
            'UPDATE etageres e JOIN armoires a ON a.id = e.armoire_id'
            . ' SET e.nom = ?, e.capacite_alveoles = ?, e.position = ? WHERE e.id = ? AND a.user_id = ?',
            [$nom, $capacite, $position, $id, $utilisateur],
        );
    }

    public function creerCarton(int $utilisateur, string $identifiant, int $capacite): int
    {
        $this->executer(
            'INSERT INTO cartons (user_id, identifiant, capacite) VALUES (?, ?, ?)',
            [$utilisateur, $identifiant, $capacite],
        );

        return (int) $this->pdo->lastInsertId();
    }

    public function modifierCarton(int $utilisateur, int $id, string $identifiant, int $capacite): void
    {
        $this->executer(
            'UPDATE cartons SET identifiant = ?, capacite = ? WHERE id = ? AND user_id = ?',
            [$identifiant, $capacite, $id, $utilisateur],
        );
    }

    /**
     * Passe en hors rangement les bouteilles en cave des emplacements donnés, avec un
     * mouvement « deplacement » daté $date chacune ; l'horloge logique ne recule jamais.
     *
     * @param 'etagere'|'carton' $type
     * @param list<int> $ids
     * @return int bouteilles basculées
     */
    public function basculerHorsRangement(int $utilisateur, string $type, array $ids, string $date): int
    {
        if ($ids === []) {
            return 0;
        }
        $colonne = self::COLONNES[$type];
        $condition = sprintf(
            ' WHERE user_id = ? AND statut = \'en_cave\' AND emplacement_type = ? AND %s IN (%s)',
            $colonne,
            implode(', ', array_fill(0, count($ids), '?')),
        );
        $parametres = [$utilisateur, $type, ...$ids];

        $this->executer(
            'INSERT INTO mouvements (bouteille_id, user_id, type_mouvement, emplacement_avant_type,'
            . ' emplacement_avant_id, emplacement_apres_type, date_mouvement)'
            . sprintf(' SELECT id, user_id, \'deplacement\', emplacement_type, %s, \'hors_rangement\', ?', $colonne)
            . ' FROM bouteilles' . $condition . ' ORDER BY id',
            [$date, ...$parametres],
        );

        return $this->executer(
            'UPDATE bouteilles SET emplacement_type = \'hors_rangement\', etagere_id = NULL, carton_id = NULL,'
            . ' date_dernier_mouvement_applique = GREATEST(COALESCE(date_dernier_mouvement_applique, ?), ?)'
            . $condition,
            [$date, $date, ...$parametres],
        );
    }

    public function supprimerArmoire(int $utilisateur, int $id): void
    {
        // Les étagères suivent (ON DELETE CASCADE).
        $this->executer('DELETE FROM armoires WHERE id = ? AND user_id = ?', [$id, $utilisateur]);
    }

    public function supprimerEtagere(int $utilisateur, int $id): void
    {
        $this->executer(
            'DELETE e FROM etageres e JOIN armoires a ON a.id = e.armoire_id WHERE e.id = ? AND a.user_id = ?',
            [$id, $utilisateur],
        );
    }

    public function supprimerCarton(int $utilisateur, int $id): void
    {
        $this->executer('DELETE FROM cartons WHERE id = ? AND user_id = ?', [$id, $utilisateur]);
    }
}
