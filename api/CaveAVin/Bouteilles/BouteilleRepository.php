<?php

declare(strict_types=1);

namespace CaveAVin\Bouteilles;

use CaveAVin\Donnees\Repository;

/**
 * Bouteilles et leurs mouvements (schéma §5, §6), avec ce qu'il faut pour les représenter :
 * noms de région et de cépage, armoire et étagère, ou carton.
 *
 * @phpstan-type LigneBouteille array{
 *     id: int, client_ref: ?string, reference: string, type: string, region_id: ?int, region_nom: ?string,
 *     cepage_id: ?int, cepage_nom: ?string, domaine: ?string, millesime: ?int, date_entree: string,
 *     origine: string, note: ?string, tag_souvenir: int, emplacement_type: string, etagere_id: ?int,
 *     etagere_nom: ?string, etagere_position: ?int, armoire_id: ?int, armoire_nom: ?string, carton_id: ?int,
 *     carton_identifiant: ?string, statut: string, date_limite_consommation: ?string, anciennete_annee: int,
 *     lot_ajout_id: ?string, photo_path: ?string, created_at: string, updated_at: string
 * }
 * @phpstan-type LigneMouvement array{
 *     id: int, client_ref: ?string, type_mouvement: string, motif_sortie: ?string,
 *     emplacement_avant_type: ?string, emplacement_avant_id: ?int, emplacement_apres_type: ?string,
 *     emplacement_apres_id: ?int, date_mouvement: string
 * }
 * @phpstan-type Filtres array{
 *     statut?: 'en_cave'|'sortie', emplacement?: array{0: string, 1: ?int}, type?: string,
 *     region_id?: int, cepage_id?: int, tri?: 'reference'|'priorite'|'age', limite?: int
 * }
 */
final class BouteilleRepository extends Repository
{
    private const SELECTION = 'SELECT b.id, b.client_ref, b.reference, b.type, b.region_id, r.nom AS region_nom,'
        . ' b.cepage_id, c.nom AS cepage_nom, b.domaine, b.millesime, b.date_entree, b.origine, b.note,'
        . ' b.tag_souvenir, b.emplacement_type, b.etagere_id, e.nom AS etagere_nom, e.position AS etagere_position,'
        . ' a.id AS armoire_id, a.nom AS armoire_nom, b.carton_id, k.identifiant AS carton_identifiant, b.statut,'
        . ' b.date_limite_consommation, b.anciennete_annee, b.lot_ajout_id, b.photo_path, b.created_at,'
        . ' b.updated_at'
        . ' FROM bouteilles b'
        . ' LEFT JOIN regions r ON r.id = b.region_id'
        . ' LEFT JOIN cepages c ON c.id = b.cepage_id'
        . ' LEFT JOIN etageres e ON e.id = b.etagere_id'
        . ' LEFT JOIN armoires a ON a.id = e.armoire_id'
        . ' LEFT JOIN cartons k ON k.id = b.carton_id'
        . ' WHERE b.user_id = ?';

    private const TRIS = [
        // Ordre de génération : longueur, puis code (chiffres avant lettres).
        'reference' => 'CHAR_LENGTH(b.reference), b.reference',
        'priorite' => 'b.date_limite_consommation IS NULL, b.date_limite_consommation, b.anciennete_annee, b.id',
        'age' => 'b.anciennete_annee, b.id',
    ];

    /**
     * @param Filtres $filtres
     * @return list<LigneBouteille>
     */
    public function lister(int $utilisateur, array $filtres): array
    {
        $sql = self::SELECTION;
        $parametres = [$utilisateur];
        if (isset($filtres['statut'])) {
            $sql .= ' AND b.statut = ?';
            $parametres[] = $filtres['statut'];
        }
        if (isset($filtres['emplacement'])) {
            [$type, $id] = $filtres['emplacement'];
            $sql .= match ($type) {
                'etagere' => ' AND b.emplacement_type = \'etagere\' AND b.etagere_id = ?',
                'carton' => ' AND b.emplacement_type = \'carton\' AND b.carton_id = ?',
                'armoire' => ' AND b.emplacement_type = \'etagere\' AND a.id = ?',
                default => ' AND b.emplacement_type = \'hors_rangement\'',
            };
            if ($id !== null) {
                $parametres[] = $id;
            }
        }
        foreach (['type' => 'b.type', 'region_id' => 'b.region_id', 'cepage_id' => 'b.cepage_id'] as $cle => $colonne) {
            if (isset($filtres[$cle])) {
                $sql .= sprintf(' AND %s = ?', $colonne);
                $parametres[] = $filtres[$cle];
            }
        }
        $sql .= ' ORDER BY ' . self::TRIS[$filtres['tri'] ?? 'reference'];
        if (isset($filtres['limite'])) {
            $sql .= ' LIMIT ' . $filtres['limite'];
        }

        /** @var list<LigneBouteille> */
        return $this->lignes($sql, $parametres);
    }

    /** @return LigneBouteille|null */
    public function parId(int $utilisateur, int $id): ?array
    {
        /** @var LigneBouteille|null */
        return $this->ligne(self::SELECTION . ' AND b.id = ?', [$utilisateur, $id]);
    }

    /** @return LigneBouteille|null */
    public function parReference(int $utilisateur, string $reference): ?array
    {
        /** @var LigneBouteille|null */
        return $this->ligne(self::SELECTION . ' AND b.reference = ?', [$utilisateur, $reference]);
    }

    /**
     * Données de calcul de la bouteille, verrouillées jusqu'à la fin de la transaction.
     *
     * @return array{type: string, region_id: ?int, millesime: ?int, date_entree: string}|null
     */
    public function verrouiller(int $utilisateur, int $id): ?array
    {
        /** @var array{type: string, region_id: ?int, millesime: ?int, date_entree: string}|null */
        return $this->ligne(
            'SELECT type, region_id, millesime, date_entree FROM bouteilles WHERE id = ? AND user_id = ? FOR UPDATE',
            [$id, $utilisateur],
        );
    }

    /**
     * Bouteilles d'un type, tout statut, avec ce que demande le calcul de leur date limite.
     *
     * @return list<array{
     *     id: int, region_id: ?int, millesime: ?int, date_entree: string, date_limite_consommation: ?string
     * }>
     */
    public function pourDateLimite(int $utilisateur, string $type): array
    {
        /** @var list<array{id: int, region_id: ?int, millesime: ?int, date_entree: string, date_limite_consommation: ?string}> */
        return $this->lignes(
            'SELECT id, region_id, millesime, date_entree, date_limite_consommation FROM bouteilles'
            . ' WHERE user_id = ? AND type = ? ORDER BY id FOR UPDATE',
            [$utilisateur, $type],
        );
    }

    /** @param array<string, mixed> $colonnes colonnes de bouteilles et leur nouvelle valeur */
    public function modifier(int $utilisateur, int $id, array $colonnes): void
    {
        if ($colonnes === []) {
            return;
        }
        $this->executer(
            sprintf(
                'UPDATE bouteilles SET %s WHERE id = ? AND user_id = ?',
                implode(', ', array_map(fn (string $colonne): string => $colonne . ' = ?', array_keys($colonnes))),
            ),
            [...array_values($colonnes), $id, $utilisateur],
        );
    }

    /**
     * Durée de garde de la catégorie spécifique (type + région), sinon de la générique
     * (type seul) ; une catégorie sans durée est ignorée. Null : aucune.
     */
    public function dureeDeGarde(int $utilisateur, string $type, ?int $region): ?int
    {
        $duree = $this->valeur(
            'SELECT duree_garde_annees FROM categories'
            . ' WHERE user_id = ? AND type = ? AND (region_id = ? OR region_id IS NULL)'
            . ' AND duree_garde_annees IS NOT NULL ORDER BY region_id IS NULL LIMIT 1',
            [$utilisateur, $type, $region],
        );

        return $duree === null ? null : (int) $duree;
    }

    /** @return list<LigneMouvement> du plus ancien au plus récent */
    public function mouvements(int $utilisateur, int $bouteille): array
    {
        /** @var list<LigneMouvement> */
        return $this->lignes(
            'SELECT id, client_ref, type_mouvement, motif_sortie, emplacement_avant_type, emplacement_avant_id,'
            . ' emplacement_apres_type, emplacement_apres_id, date_mouvement'
            . ' FROM mouvements WHERE user_id = ? AND bouteille_id = ? ORDER BY date_mouvement, id',
            [$utilisateur, $bouteille],
        );
    }
}
