<?php

declare(strict_types=1);

namespace CaveAVin\Mouvements;

use CaveAVin\Emplacements\EmplacementRepository;

/**
 * Règle de placement (contrat §10.4, Arch §4.5) : vers un emplacement disparu ou complet,
 * la bouteille va en hors rangement au lieu d'être rejetée. Pour N bouteilles, les
 * premières remplissent la place restante. L'emplacement est verrouillé jusqu'à la fin de
 * la transaction : deux lots simultanés ne dépassent pas sa capacité.
 *
 * @phpstan-type Destination array{type: string, id: ?int, redirection: ?string}
 */
final class Placement
{
    public const CAPACITE_DEPASSEE = 'CAPACITY_EXCEEDED';
    public const EMPLACEMENT_INTROUVABLE = 'LOCATION_NOT_FOUND';

    public function __construct(private readonly EmplacementRepository $emplacements)
    {
    }

    /**
     * @param array{type: string, id?: int} $demande
     * @param array{type: string, id: ?int}|null $actuel emplacement actuel de la bouteille déplacée
     * @return list<Destination> une par bouteille, dans l'ordre
     */
    public function destinations(int $utilisateur, array $demande, int $nombre, ?array $actuel = null): array
    {
        $horsRangement = fn (?string $redirection): array => [
            'type' => 'hors_rangement',
            'id' => null,
            'redirection' => $redirection,
        ];
        $id = $demande['id'] ?? null;
        $emplacement = match (true) {
            $id !== null && $demande['type'] === 'etagere' => $this->emplacements->etagere($utilisateur, $id, true),
            $id !== null && $demande['type'] === 'carton' => $this->emplacements->carton($utilisateur, $id, true),
            default => null,
        };
        if ($emplacement === null || $id === null) {
            $redirection = $demande['type'] === 'hors_rangement' ? null : self::EMPLACEMENT_INTROUVABLE;

            return array_fill(0, $nombre, $horsRangement($redirection));
        }

        // Une bouteille déjà rangée là y garde sa place.
        $dejaLa = $actuel !== null && $actuel['type'] === $demande['type'] && $actuel['id'] === $id;
        $libre = $emplacement['capacite'] - $emplacement['occupees'] + ($dejaLa ? 1 : 0);
        $destinations = [];
        for ($i = 0; $i < $nombre; $i++) {
            $destinations[] = $i < $libre
                ? ['type' => $demande['type'], 'id' => $id, 'redirection' => null]
                : $horsRangement(self::CAPACITE_DEPASSEE);
        }

        return $destinations;
    }
}
