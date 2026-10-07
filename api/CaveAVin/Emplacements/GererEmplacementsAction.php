<?php

declare(strict_types=1);

namespace CaveAVin\Emplacements;

use LogicException;

/**
 * Création et modification des armoires, étagères et cartons (CdC §3.1). Une capacité ne
 * descend jamais sous l'occupation (P5) : vérifiée sous verrou, dans une transaction.
 * Un emplacement absent ou d'un autre compte donne null.
 *
 * @phpstan-import-type Etagere from EmplacementRepository
 * @phpstan-import-type Carton from EmplacementRepository
 * @phpstan-import-type Armoire from VueCaveAction
 */
final class GererEmplacementsAction
{
    public function __construct(
        private readonly EmplacementRepository $emplacements,
        private readonly VueCaveAction $vue,
    ) {
    }

    /**
     * @param list<array{nom: ?string, capacite: int}> $etageres dans l'ordre d'affichage
     * @return Armoire
     */
    public function creerArmoire(int $utilisateur, string $nom, array $etageres): array
    {
        $id = $this->emplacements->transaction(function () use ($utilisateur, $nom, $etageres): int {
            $id = $this->emplacements->creerArmoire($utilisateur, $nom);
            foreach ($etageres as $etagere) {
                $this->emplacements->creerEtagere($utilisateur, $id, $etagere['nom'], $etagere['capacite'], null);
            }

            return $id;
        });

        return $this->armoire($utilisateur, $id) ?? throw new LogicException('Armoire créée introuvable.');
    }

    /** @return Armoire|null */
    public function renommerArmoire(int $utilisateur, int $id, string $nom): ?array
    {
        if ($this->emplacements->armoire($utilisateur, $id) === null) {
            return null;
        }
        $this->emplacements->renommerArmoire($utilisateur, $id, $nom);

        return $this->armoire($utilisateur, $id);
    }

    /** @return Etagere|null */
    public function ajouterEtagere(int $utilisateur, int $armoire, ?string $nom, int $capacite, ?int $position): ?array
    {
        return $this->emplacements->transaction(function () use ($utilisateur, $armoire, $nom, $capacite, $position) {
            // Verrou sur l'armoire : deux ajouts simultanés ne prennent pas la même position.
            if ($this->emplacements->armoire($utilisateur, $armoire, true) === null) {
                return null;
            }
            $id = $this->emplacements->creerEtagere($utilisateur, $armoire, $nom, $capacite, $position);

            return $this->emplacements->etagere($utilisateur, $id);
        });
    }

    /**
     * @param array{nom?: ?string, capacite?: int, position?: int} $modifications champs absents inchangés
     * @return Etagere|null
     * @throws OccupationSuperieure
     */
    public function modifierEtagere(int $utilisateur, int $id, array $modifications): ?array
    {
        return $this->emplacements->transaction(function () use ($utilisateur, $id, $modifications) {
            $etagere = $this->emplacements->etagere($utilisateur, $id, true);
            if ($etagere === null) {
                return null;
            }
            $capacite = $modifications['capacite'] ?? $etagere['capacite'];
            if ($capacite < $etagere['occupees']) {
                throw new OccupationSuperieure($etagere['occupees']);
            }
            $this->emplacements->modifierEtagere(
                $utilisateur,
                $id,
                array_key_exists('nom', $modifications) ? $modifications['nom'] : $etagere['nom'],
                $capacite,
                $modifications['position'] ?? $etagere['position'],
            );

            return $this->emplacements->etagere($utilisateur, $id);
        });
    }

    /** @return Carton */
    public function creerCarton(int $utilisateur, string $identifiant, int $capacite): array
    {
        $id = $this->emplacements->creerCarton($utilisateur, $identifiant, $capacite);

        return $this->emplacements->carton($utilisateur, $id) ?? throw new LogicException('Carton créé introuvable.');
    }

    /**
     * @param array{identifiant?: string, capacite?: int} $modifications champs absents inchangés
     * @return Carton|null
     * @throws OccupationSuperieure
     */
    public function modifierCarton(int $utilisateur, int $id, array $modifications): ?array
    {
        return $this->emplacements->transaction(function () use ($utilisateur, $id, $modifications) {
            $carton = $this->emplacements->carton($utilisateur, $id, true);
            if ($carton === null) {
                return null;
            }
            $capacite = $modifications['capacite'] ?? $carton['capacite'];
            if ($capacite < $carton['occupees']) {
                throw new OccupationSuperieure($carton['occupees']);
            }
            $this->emplacements->modifierCarton(
                $utilisateur,
                $id,
                $modifications['identifiant'] ?? $carton['identifiant'],
                $capacite,
            );

            return $this->emplacements->carton($utilisateur, $id);
        });
    }

    /** @return Armoire|null */
    public function armoire(int $utilisateur, int $id): ?array
    {
        return $this->vue->armoires($utilisateur, $id)[0] ?? null;
    }
}
