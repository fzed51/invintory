<?php

declare(strict_types=1);

namespace CaveAVin\Emplacements;

/**
 * Vue globale de la cave (CdC §3.1) : armoires et leurs étagères, cartons, et nombre de
 * bouteilles hors rangement.
 *
 * @phpstan-import-type Etagere from EmplacementRepository
 * @phpstan-import-type Carton from EmplacementRepository
 * @phpstan-type Armoire array{id: int, nom: string, etageres: list<Etagere>}
 */
final class VueCaveAction
{
    public function __construct(private readonly EmplacementRepository $emplacements)
    {
    }

    /** @return array{armoires: list<Armoire>, cartons: list<Carton>, hors_rangement: int} */
    public function executer(int $utilisateur): array
    {
        return [
            'armoires' => $this->armoires($utilisateur),
            'cartons' => $this->emplacements->cartons($utilisateur),
            'hors_rangement' => $this->emplacements->horsRangement($utilisateur),
        ];
    }

    /** @return list<Armoire> par id, étagères par position puis id */
    public function armoires(int $utilisateur, ?int $seule = null): array
    {
        $parArmoire = [];
        foreach ($this->emplacements->etageres($utilisateur, $seule) as $etagere) {
            $parArmoire[$etagere['armoire_id']][] = $etagere;
        }
        $armoires = [];
        foreach ($this->emplacements->armoires($utilisateur) as $armoire) {
            if ($seule === null || $armoire['id'] === $seule) {
                $armoires[] = $armoire + ['etageres' => $parArmoire[$armoire['id']] ?? []];
            }
        }

        return $armoires;
    }
}
