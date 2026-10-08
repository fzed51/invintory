<?php

declare(strict_types=1);

namespace CaveAVin\Bouteilles;

use CaveAVin\Emplacements\EmplacementRepository;
use CaveAVin\Emplacements\SuggererEmplacementAction;
use CaveAVin\Horloge;

/**
 * Lecture des bouteilles (contrat §7.1, §7.2) et de leurs mouvements (§8). Une bouteille
 * est urgente quand sa date limite est dépassée (antérieure à aujourd'hui, UTC).
 *
 * @phpstan-import-type LigneBouteille from BouteilleRepository
 * @phpstan-import-type Filtres from BouteilleRepository
 * @phpstan-type Emplacement array{type: string, id?: int, armoire_id?: int, libelle?: string}
 * @phpstan-type Valeur array{id: int, nom: string}
 * @phpstan-type Bouteille array{
 *     id: int, client_ref: ?string, reference: string, type: string, region: ?Valeur, cepage: ?Valeur,
 *     domaine: ?string, millesime: ?int, date_entree: string, origine: string, note: ?string, souvenir: bool,
 *     emplacement: Emplacement, statut: string, date_limite: ?string, urgente: bool, anciennete: int,
 *     lot_ajout_id: ?string, photo: bool, cree_le: string, modifie_le: string
 * }
 * @phpstan-type Mouvement array{
 *     id: int, client_ref: ?string, type: string, motif_sortie: ?string, avant: ?Emplacement,
 *     apres: ?Emplacement, date: string
 * }
 */
final class LireBouteillesAction
{
    public const EMPLACEMENT_SUPPRIME = 'Emplacement supprimé';

    public function __construct(
        private readonly BouteilleRepository $bouteilles,
        private readonly EmplacementRepository $emplacements,
        private readonly Horloge $horloge,
    ) {
    }

    /**
     * @param Filtres $filtres
     * @return list<Bouteille>
     */
    public function lister(int $utilisateur, array $filtres): array
    {
        return array_map($this->representer(...), $this->bouteilles->lister($utilisateur, $filtres));
    }

    /** @return Bouteille|null */
    public function bouteille(int $utilisateur, int $id): ?array
    {
        $ligne = $this->bouteilles->parId($utilisateur, $id);

        return $ligne === null ? null : $this->representer($ligne);
    }

    /** @return array{bouteille: Bouteille, mouvements: list<Mouvement>}|null */
    public function fiche(int $utilisateur, int $id): ?array
    {
        return $this->ficheDe($utilisateur, $this->bouteilles->parId($utilisateur, $id));
    }

    /** @return array{bouteille: Bouteille, mouvements: list<Mouvement>}|null */
    public function ficheParReference(int $utilisateur, string $saisie): ?array
    {
        return $this->ficheDe(
            $utilisateur,
            $this->bouteilles->parReference($utilisateur, CodeReference::normaliser($saisie)),
        );
    }

    /**
     * Emplacements tels qu'un mouvement les a enregistrés (type et id), avec leur libellé
     * actuel, ou « Emplacement supprimé ».
     *
     * @param list<array{type: string, id: ?int}> $emplacements
     * @return list<Emplacement>
     */
    public function emplacements(int $utilisateur, array $emplacements): array
    {
        $actuels = $this->emplacementsActuels($utilisateur);

        return array_map(
            fn (array $emplacement): array => self::emplacementPasse($actuels, $emplacement['type'], $emplacement['id'])
                ?? ['type' => $emplacement['type']],
            $emplacements,
        );
    }

    /**
     * Toutes les bouteilles, tout statut, avec leurs mouvements (export), par référence.
     *
     * @return list<array{bouteille: Bouteille, mouvements: list<Mouvement>}>
     */
    public function fiches(int $utilisateur): array
    {
        $emplacements = $this->emplacementsActuels($utilisateur);

        return array_map(
            fn (array $ligne): array => $this->ficheAvec($utilisateur, $ligne, $emplacements),
            $this->bouteilles->lister($utilisateur, []),
        );
    }

    /**
     * @param LigneBouteille|null $ligne
     * @return array{bouteille: Bouteille, mouvements: list<Mouvement>}|null
     */
    private function ficheDe(int $utilisateur, ?array $ligne): ?array
    {
        return $ligne === null
            ? null
            : $this->ficheAvec($utilisateur, $ligne, $this->emplacementsActuels($utilisateur));
    }

    /**
     * @param LigneBouteille $ligne
     * @param array<string, Emplacement> $emplacements emplacements actuels
     * @return array{bouteille: Bouteille, mouvements: list<Mouvement>}
     */
    private function ficheAvec(int $utilisateur, array $ligne, array $emplacements): array
    {
        $mouvements = [];
        foreach ($this->bouteilles->mouvements($utilisateur, $ligne['id']) as $mouvement) {
            $mouvements[] = [
                'id' => $mouvement['id'],
                'client_ref' => $mouvement['client_ref'],
                'type' => $mouvement['type_mouvement'],
                'motif_sortie' => $mouvement['motif_sortie'],
                'avant' => self::emplacementPasse(
                    $emplacements,
                    $mouvement['emplacement_avant_type'],
                    $mouvement['emplacement_avant_id'],
                ),
                'apres' => self::emplacementPasse(
                    $emplacements,
                    $mouvement['emplacement_apres_type'],
                    $mouvement['emplacement_apres_id'],
                ),
                'date' => $mouvement['date_mouvement'],
            ];
        }

        return ['bouteille' => $this->representer($ligne), 'mouvements' => $mouvements];
    }

    /**
     * @param LigneBouteille $ligne
     * @return Bouteille
     */
    private function representer(array $ligne): array
    {
        $dateLimite = $ligne['date_limite_consommation'];

        return [
            'id' => $ligne['id'],
            'client_ref' => $ligne['client_ref'],
            'reference' => $ligne['reference'],
            'type' => $ligne['type'],
            'region' => self::valeur($ligne['region_id'], $ligne['region_nom']),
            'cepage' => self::valeur($ligne['cepage_id'], $ligne['cepage_nom']),
            'domaine' => $ligne['domaine'],
            'millesime' => $ligne['millesime'],
            'date_entree' => $ligne['date_entree'],
            'origine' => $ligne['origine'],
            'note' => $ligne['note'],
            'souvenir' => $ligne['tag_souvenir'] === 1,
            'emplacement' => self::emplacement($ligne),
            'statut' => $ligne['statut'],
            'date_limite' => $dateLimite,
            'urgente' => $dateLimite !== null && $dateLimite < gmdate('Y-m-d', $this->horloge->maintenant()),
            'anciennete' => $ligne['anciennete_annee'],
            'lot_ajout_id' => $ligne['lot_ajout_id'],
            'photo' => $ligne['photo_path'] !== null,
            'cree_le' => $ligne['created_at'],
            'modifie_le' => $ligne['updated_at'],
        ];
    }

    /** @return Valeur|null */
    private static function valeur(?int $id, ?string $nom): ?array
    {
        return $id === null || $nom === null ? null : ['id' => $id, 'nom' => $nom];
    }

    /**
     * @param LigneBouteille $ligne
     * @return Emplacement
     */
    private static function emplacement(array $ligne): array
    {
        if ($ligne['etagere_id'] !== null && $ligne['armoire_id'] !== null && $ligne['etagere_position'] !== null) {
            return [
                'type' => 'etagere',
                'id' => $ligne['etagere_id'],
                'armoire_id' => $ligne['armoire_id'],
                'libelle' => SuggererEmplacementAction::libelleEtagere(
                    (string) $ligne['armoire_nom'],
                    ['nom' => $ligne['etagere_nom'], 'position' => $ligne['etagere_position']],
                ),
            ];
        }
        if ($ligne['carton_id'] !== null && $ligne['carton_identifiant'] !== null) {
            return ['type' => 'carton', 'id' => $ligne['carton_id'], 'libelle' => $ligne['carton_identifiant']];
        }

        return ['type' => $ligne['emplacement_type']];
    }

    /**
     * Étagères et cartons existants de l'utilisateur, indexés par « type:id ».
     *
     * @return array<string, Emplacement>
     */
    private function emplacementsActuels(int $utilisateur): array
    {
        $noms = array_column($this->emplacements->armoires($utilisateur), 'nom', 'id');
        $emplacements = [];
        foreach ($this->emplacements->etageres($utilisateur) as $etagere) {
            $emplacements['etagere:' . $etagere['id']] = [
                'type' => 'etagere',
                'id' => $etagere['id'],
                'armoire_id' => $etagere['armoire_id'],
                'libelle' => SuggererEmplacementAction::libelleEtagere($noms[$etagere['armoire_id']] ?? '', $etagere),
            ];
        }
        foreach ($this->emplacements->cartons($utilisateur) as $carton) {
            $emplacements['carton:' . $carton['id']] = [
                'type' => 'carton',
                'id' => $carton['id'],
                'libelle' => $carton['identifiant'],
            ];
        }

        return $emplacements;
    }

    /**
     * Emplacement d'un mouvement : celui d'aujourd'hui s'il existe encore, sinon « supprimé ».
     *
     * @param array<string, Emplacement> $actuels
     * @return Emplacement|null
     */
    private static function emplacementPasse(array $actuels, ?string $type, ?int $id): ?array
    {
        if ($type === null) {
            return null;
        }
        if ($id === null) {
            return ['type' => $type];
        }

        return $actuels[$type . ':' . $id] ?? ['type' => $type, 'id' => $id, 'libelle' => self::EMPLACEMENT_SUPPRIME];
    }
}
