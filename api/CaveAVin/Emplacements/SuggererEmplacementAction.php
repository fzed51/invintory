<?php

declare(strict_types=1);

namespace CaveAVin\Emplacements;

/**
 * Suggestion d'emplacement (CdC §3.2, contrat §5). Ordre de parcours, reproduit à
 * l'identique par la PWA hors ligne : étagères (armoires par id, étagères par position puis
 * id), puis cartons (par id). Candidat : place libre ≥ $nombre ; $ecartees = k renvoie le
 * (k+1)-ième candidat (« Autre emplacement »).
 *
 * @phpstan-type Suggestion array{type: 'etagere'|'carton', id: int, armoire_id?: int, libelle: string, libre: int}
 */
final class SuggererEmplacementAction
{
    public function __construct(private readonly EmplacementRepository $emplacements)
    {
    }

    /** @return Suggestion|null aucun candidat */
    public function executer(int $utilisateur, int $nombre, int $ecartees): ?array
    {
        foreach ($this->candidats($utilisateur) as $candidat) {
            if ($candidat['libre'] >= $nombre && $ecartees-- === 0) {
                return $candidat;
            }
        }

        return null;
    }

    /** @return iterable<Suggestion> */
    private function candidats(int $utilisateur): iterable
    {
        $noms = array_column($this->emplacements->armoires($utilisateur), 'nom', 'id');
        foreach ($this->emplacements->etageres($utilisateur) as $etagere) {
            yield [
                'type' => 'etagere',
                'id' => $etagere['id'],
                'armoire_id' => $etagere['armoire_id'],
                'libelle' => self::libelleEtagere($noms[$etagere['armoire_id']] ?? '', $etagere),
                'libre' => $etagere['capacite'] - $etagere['occupees'],
            ];
        }
        foreach ($this->emplacements->cartons($utilisateur) as $carton) {
            yield [
                'type' => 'carton',
                'id' => $carton['id'],
                'libelle' => $carton['identifiant'],
                'libre' => $carton['capacite'] - $carton['occupees'],
            ];
        }
    }

    /**
     * « Armoire · nom de l'étagère », ou « Armoire · Étagère N » d'après sa position (contrat §1.5).
     *
     * @param array{nom: ?string, position: int} $etagere
     */
    public static function libelleEtagere(string $armoire, array $etagere): string
    {
        return $armoire . ' · ' . ($etagere['nom'] ?? 'Étagère ' . $etagere['position']);
    }
}
