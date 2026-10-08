<?php

declare(strict_types=1);

namespace CaveAVin\Categories;

use CaveAVin\Auth\Authentification;
use CaveAVin\Bouteilles\BouteillesController;
use CaveAVin\Http\BaseController;
use CaveAVin\Http\ErreurApi;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Routes des catégories et des manques (contrat §9) : validation et traduction vers le
 * JSON anglais (§1.4).
 *
 * @phpstan-import-type Categorie from CategorieRepository
 */
final class CategoriesController extends BaseController
{
    private const SEUIL_MAX = 65535;
    private const GARDE_MAX = 255;

    public function __construct(
        private readonly CategoriesAction $categories,
        private readonly ManquesAction $manques,
    ) {
    }

    public function lister(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $categories = $this->categories->lister(Authentification::utilisateur($request));

        return $this->lecture($response, ['categories' => array_map(self::categorieJson(...), $categories)]);
    }

    public function creer(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $corps = $this->corps($request);
        $type = $corps['type'] ?? null;
        if (!is_string($type) || !in_array($type, BouteillesController::TYPES, true)) {
            throw ErreurApi::donneesInvalides('Champ « type » : ' . implode(', ', BouteillesController::TYPES) . '.');
        }
        $region = $corps['region'] ?? null;
        $region = $region === null ? null : $this->libelle($region, 'region', 150);
        $seuil = $this->nombreFacultatif($corps, 'threshold', self::SEUIL_MAX);
        $garde = $this->nombreFacultatif($corps, 'ageing_years', self::GARDE_MAX);

        try {
            $utilisateur = Authentification::utilisateur($request);
            $categorie = $this->categories->creer($utilisateur, $type, $region, $seuil, $garde);
        } catch (CategorieExistante) {
            throw new ErreurApi(409, 'CATEGORY_EXISTS', 'Cette catégorie existe déjà.');
        }

        return $this->json($response, self::categorieJson($categorie), 201);
    }

    public function modifier(
        ServerRequestInterface $request,
        ResponseInterface $response,
        string $id,
    ): ResponseInterface {
        $corps = $this->corps($request);
        $modifications = [];
        if (array_key_exists('threshold', $corps)) {
            $modifications['seuil'] = $this->nombreFacultatif($corps, 'threshold', self::SEUIL_MAX);
        }
        if (array_key_exists('ageing_years', $corps)) {
            $modifications['garde'] = $this->nombreFacultatif($corps, 'ageing_years', self::GARDE_MAX);
        }

        $categorie = $this->categories->modifier(Authentification::utilisateur($request), (int) $id, $modifications);

        return $this->json($response, self::categorieJson($categorie ?? throw ErreurApi::introuvable()));
    }

    public function supprimer(
        ServerRequestInterface $request,
        ResponseInterface $response,
        string $id,
    ): ResponseInterface {
        if (!$this->categories->supprimer(Authentification::utilisateur($request), (int) $id)) {
            throw ErreurApi::introuvable();
        }

        return $response->withStatus(204);
    }

    public function manques(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $manques = $this->manques->executer(Authentification::utilisateur($request));

        return $this->lecture($response, ['shortages' => array_map(fn (array $manque): array => [
            'category' => array_intersect_key(
                self::categorieJson($manque['categorie']),
                array_flip(['id', 'type', 'region']),
            ),
            'threshold' => $manque['seuil'],
            'count' => $manque['categorie']['nombre'],
            'missing' => $manque['manquantes'],
            'suggestions' => array_map(fn (array $suggestion): array => [
                'domain' => $suggestion['domaine'],
                'vintage' => $suggestion['millesime'],
                'region' => $suggestion['region'],
                'grape' => $suggestion['cepage'],
                'last_movement_at' => $suggestion['dernier_mouvement'] === null
                    ? null
                    : self::dateHeure($suggestion['dernier_mouvement']),
            ], $manque['suggestions']),
        ], $manques)]);
    }

    /** @param array<mixed> $corps */
    private function nombreFacultatif(array $corps, string $champ, int $max): ?int
    {
        $valeur = $corps[$champ] ?? null;

        return $valeur === null ? null : $this->entier($valeur, $champ, 0, $max);
    }

    /**
     * @param Categorie $categorie
     * @return array<string, mixed>
     */
    public static function categorieJson(array $categorie): array
    {
        return [
            'id' => $categorie['id'],
            'type' => $categorie['type'],
            'region' => $categorie['region_id'] === null || $categorie['region_nom'] === null
                ? null
                : ['id' => $categorie['region_id'], 'name' => $categorie['region_nom']],
            'threshold' => $categorie['seuil'],
            'ageing_years' => $categorie['garde'],
            'count' => $categorie['nombre'],
        ];
    }
}
