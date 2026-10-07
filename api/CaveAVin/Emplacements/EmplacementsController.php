<?php

declare(strict_types=1);

namespace CaveAVin\Emplacements;

use CaveAVin\Auth\Authentification;
use CaveAVin\Http\BaseController;
use CaveAVin\Http\ErreurApi;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Routes des emplacements (contrat §5) : validation des corps et traduction des noms
 * français du domaine vers le JSON anglais (contrat §1.4).
 *
 * @phpstan-import-type Etagere from EmplacementRepository
 * @phpstan-import-type Carton from EmplacementRepository
 * @phpstan-import-type Armoire from VueCaveAction
 */
final class EmplacementsController extends BaseController
{
    private const CAPACITE_MAX = 65535;
    private const POSITION_MAX = 65535;

    public function __construct(
        private readonly VueCaveAction $vue,
        private readonly GererEmplacementsAction $gerer,
        private readonly SupprimerEmplacementAction $supprimer,
        private readonly SuggererEmplacementAction $suggerer,
    ) {
    }

    public function cave(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $cave = $this->vue->executer(Authentification::utilisateur($request));

        return $this->lecture($response, [
            'cabinets' => array_map(self::armoireJson(...), $cave['armoires']),
            'boxes' => array_map(self::cartonJson(...), $cave['cartons']),
            'unplaced' => $cave['hors_rangement'],
        ]);
    }

    public function creerArmoire(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $corps = $this->corps($request);
        $nom = $this->libelle($corps['name'] ?? null, 'name');
        $etageres = $corps['shelves'] ?? [];
        if (!is_array($etageres) || !array_is_list($etageres)) {
            throw ErreurApi::donneesInvalides('Champ « shelves » : liste attendue.');
        }
        $etageres = array_map(function (mixed $etagere): array {
            if (!is_array($etagere)) {
                throw ErreurApi::donneesInvalides('Champ « shelves » : liste d’objets attendue.');
            }

            return [
                'nom' => $this->nomFacultatif($etagere),
                'capacite' => $this->entier($etagere['capacity'] ?? null, 'capacity', 1, self::CAPACITE_MAX),
            ];
        }, $etageres);

        $armoire = $this->gerer->creerArmoire(Authentification::utilisateur($request), $nom, $etageres);

        return $this->json($response, self::armoireJson($armoire), 201);
    }

    public function renommerArmoire(
        ServerRequestInterface $request,
        ResponseInterface $response,
        string $id,
    ): ResponseInterface {
        $nom = $this->libelle($this->corps($request)['name'] ?? null, 'name');
        $armoire = $this->gerer->renommerArmoire(Authentification::utilisateur($request), (int) $id, $nom);

        return $this->json($response, self::armoireJson($armoire ?? throw ErreurApi::introuvable()));
    }

    public function supprimerArmoire(
        ServerRequestInterface $request,
        ResponseInterface $response,
        string $id,
    ): ResponseInterface {
        $utilisateur = Authentification::utilisateur($request);

        return $this->basculees($response, $this->supprimer->armoire($utilisateur, (int) $id));
    }

    public function ajouterEtagere(
        ServerRequestInterface $request,
        ResponseInterface $response,
        string $id,
    ): ResponseInterface {
        $corps = $this->corps($request);
        $position = $corps['position'] ?? null;
        $etagere = $this->gerer->ajouterEtagere(
            Authentification::utilisateur($request),
            (int) $id,
            $this->nomFacultatif($corps),
            $this->entier($corps['capacity'] ?? null, 'capacity', 1, self::CAPACITE_MAX),
            $position === null ? null : $this->entier($position, 'position', 0, self::POSITION_MAX),
        );

        return $this->json($response, self::etagereJson($etagere ?? throw ErreurApi::introuvable()), 201);
    }

    public function modifierEtagere(
        ServerRequestInterface $request,
        ResponseInterface $response,
        string $id,
    ): ResponseInterface {
        $corps = $this->corps($request);
        $modifications = [];
        if (array_key_exists('name', $corps)) {
            $modifications['nom'] = $this->nomFacultatif($corps);
        }
        if (array_key_exists('capacity', $corps)) {
            $modifications['capacite'] = $this->entier($corps['capacity'], 'capacity', 1, self::CAPACITE_MAX);
        }
        if (array_key_exists('position', $corps)) {
            $modifications['position'] = $this->entier($corps['position'], 'position', 0, self::POSITION_MAX);
        }

        $utilisateur = Authentification::utilisateur($request);
        $etagere = $this->capaciteRespectee(
            fn (): ?array => $this->gerer->modifierEtagere($utilisateur, (int) $id, $modifications),
        );

        return $this->json($response, self::etagereJson($etagere ?? throw ErreurApi::introuvable()));
    }

    public function supprimerEtagere(
        ServerRequestInterface $request,
        ResponseInterface $response,
        string $id,
    ): ResponseInterface {
        $utilisateur = Authentification::utilisateur($request);

        return $this->basculees($response, $this->supprimer->etagere($utilisateur, (int) $id));
    }

    public function creerCarton(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $corps = $this->corps($request);
        $carton = $this->gerer->creerCarton(
            Authentification::utilisateur($request),
            $this->libelle($corps['label'] ?? null, 'label'),
            $this->entier($corps['capacity'] ?? null, 'capacity', 1, self::CAPACITE_MAX),
        );

        return $this->json($response, self::cartonJson($carton), 201);
    }

    public function modifierCarton(
        ServerRequestInterface $request,
        ResponseInterface $response,
        string $id,
    ): ResponseInterface {
        $corps = $this->corps($request);
        $modifications = [];
        if (array_key_exists('label', $corps)) {
            $modifications['identifiant'] = $this->libelle($corps['label'], 'label');
        }
        if (array_key_exists('capacity', $corps)) {
            $modifications['capacite'] = $this->entier($corps['capacity'], 'capacity', 1, self::CAPACITE_MAX);
        }

        $utilisateur = Authentification::utilisateur($request);
        $carton = $this->capaciteRespectee(
            fn (): ?array => $this->gerer->modifierCarton($utilisateur, (int) $id, $modifications),
        );

        return $this->json($response, self::cartonJson($carton ?? throw ErreurApi::introuvable()));
    }

    public function supprimerCarton(
        ServerRequestInterface $request,
        ResponseInterface $response,
        string $id,
    ): ResponseInterface {
        $utilisateur = Authentification::utilisateur($request);

        return $this->basculees($response, $this->supprimer->carton($utilisateur, (int) $id));
    }

    public function suggestion(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $suggestion = $this->suggerer->executer(
            Authentification::utilisateur($request),
            $this->parametreEntier($request, 'count', 1, 1, self::CAPACITE_MAX),
            $this->parametreEntier($request, 'skip', 0, 0, PHP_INT_MAX),
        );
        if ($suggestion === null) {
            return $this->lecture($response, ['location' => null, 'free' => 0]);
        }
        $emplacement = ['type' => $suggestion['type'], 'id' => $suggestion['id']];
        if (isset($suggestion['armoire_id'])) {
            $emplacement['cabinet_id'] = $suggestion['armoire_id'];
        }

        return $this->lecture($response, [
            'location' => $emplacement + ['label' => $suggestion['libelle']],
            'free' => $suggestion['libre'],
        ]);
    }

    /**
     * Nom d'étagère facultatif : absent ou null = sans nom.
     *
     * @param array<mixed> $corps
     */
    private function nomFacultatif(array $corps): ?string
    {
        $nom = $corps['name'] ?? null;

        return $nom === null ? null : $this->libelle($nom, 'name');
    }

    /**
     * @template T
     * @param callable(): T $modification
     * @return T
     */
    private function capaciteRespectee(callable $modification): mixed
    {
        try {
            return $modification();
        } catch (OccupationSuperieure $refus) {
            throw new ErreurApi(409, 'CAPACITY_BELOW_OCCUPANCY', sprintf(
                'Capacité inférieure à l’occupation actuelle : %d %s.',
                $refus->occupees,
                $refus->occupees > 1 ? 'bouteilles rangées' : 'bouteille rangée',
            ));
        }
    }

    private function basculees(ResponseInterface $reponse, ?int $nombre): ResponseInterface
    {
        return $this->json($reponse, ['moved_to_unplaced' => $nombre ?? throw ErreurApi::introuvable()]);
    }

    /**
     * @param Armoire $armoire
     * @return array<string, mixed>
     */
    private static function armoireJson(array $armoire): array
    {
        return [
            'id' => $armoire['id'],
            'name' => $armoire['nom'],
            'shelves' => array_map(self::etagereJson(...), $armoire['etageres']),
        ];
    }

    /**
     * @param Etagere $etagere
     * @return array<string, mixed>
     */
    private static function etagereJson(array $etagere): array
    {
        return [
            'id' => $etagere['id'],
            'name' => $etagere['nom'],
            'position' => $etagere['position'],
            'capacity' => $etagere['capacite'],
            'occupied' => $etagere['occupees'],
        ];
    }

    /**
     * @param Carton $carton
     * @return array<string, mixed>
     */
    private static function cartonJson(array $carton): array
    {
        return [
            'id' => $carton['id'],
            'label' => $carton['identifiant'],
            'capacity' => $carton['capacite'],
            'occupied' => $carton['occupees'],
        ];
    }
}
