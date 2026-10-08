<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Categories;

use CaveAVin\Tests\Support\CaveTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Catégories (CdC §2.5, §3.9 ; contrat §9) : unicité (type, région) y compris générique,
 * comptage P6, recalcul synchrone des dates limites à chaque écriture (P17).
 */
final class CategoriesTest extends CaveTestCase
{
    public function testAucuneCategorie(): void
    {
        $reponse = $this->api('GET', '/api/categories');

        self::assertSame('no-store', $reponse->getHeaderLine('Cache-Control'));
        self::assertSame(['categories' => []], $this->json($reponse));
    }

    public function testCreerUneCategorieGeneriqueEtUneSpecifique(): void
    {
        $generique = $this->reussir('POST', '/api/categories', ['type' => 'rouge', 'threshold' => 6], 201);
        $specifique = $this->reussir('POST', '/api/categories', [
            'type' => 'rouge', 'region' => 'Bordeaux', 'threshold' => 3, 'ageing_years' => 12,
        ], 201);

        $bordeaux = (int) $this->valeur("SELECT id FROM regions WHERE nom = 'Bordeaux'");
        self::assertSame(
            ['id' => $generique['id'], 'type' => 'rouge', 'region' => null, 'threshold' => 6, 'ageing_years' => null,
                'count' => 0],
            $generique,
        );
        self::assertSame(
            ['id' => $specifique['id'], 'type' => 'rouge', 'region' => ['id' => $bordeaux, 'name' => 'Bordeaux'],
                'threshold' => 3, 'ageing_years' => 12, 'count' => 0],
            $specifique,
        );
    }

    public function testLaRegionExistanteEstReprise(): void
    {
        $bordeaux = $this->referentiel('regions', 'Bordeaux');

        $categorie = $this->reussir('POST', '/api/categories', ['type' => 'rouge', 'region' => 'bordeaux'], 201);

        self::assertSame(['id' => $bordeaux, 'name' => 'Bordeaux'], $categorie['region']);
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function doublons(): iterable
    {
        yield 'générique' => [['type' => 'rouge']];
        yield 'générique, région null' => [['type' => 'rouge', 'region' => null]];
        yield 'spécifique' => [['type' => 'blanc', 'region' => 'LOIRE']];
    }

    /** @param array<string, mixed> $corps */
    #[DataProvider('doublons')]
    public function testDoublonRefuse(array $corps): void
    {
        $this->reussir('POST', '/api/categories', ['type' => 'rouge'], 201);
        $this->reussir('POST', '/api/categories', ['type' => 'blanc', 'region' => 'Loire'], 201);

        $reponse = $this->api('POST', '/api/categories', $corps + ['threshold' => 1]);

        self::assertSame(409, $reponse->getStatusCode());
        self::assertSame('CATEGORY_EXISTS', $this->codeErreur($reponse));
        self::assertSame(2, (int) $this->valeur('SELECT COUNT(*) FROM categories'));
    }

    public function testLaMemeCategoriePourDeuxComptes(): void
    {
        $this->reussir('POST', '/api/categories', ['type' => 'rouge'], 201);
        $bob = $this->connecter('bob@exemple.fr');

        self::assertSame(201, $this->api('POST', '/api/categories', ['type' => 'rouge'], $bob)->getStatusCode());
    }

    public function testComptageP6(): void
    {
        $bordeaux = $this->referentiel('regions', 'Bordeaux');
        $this->bouteille(['region_id' => $bordeaux]);
        $this->bouteille(['region_id' => $bordeaux]);
        $this->bouteille(['region_id' => $bordeaux, 'statut' => 'sortie']);
        $this->bouteille();
        $this->bouteille(['type' => 'blanc', 'region_id' => $bordeaux]);
        $this->reussir('POST', '/api/categories', ['type' => 'rouge', 'region' => 'Bordeaux'], 201);
        $this->reussir('POST', '/api/categories', ['type' => 'rouge'], 201);
        $this->reussir('POST', '/api/categories', ['type' => 'blanc'], 201);
        $this->reussir('POST', '/api/categories', ['type' => 'rose'], 201);

        $categories = $this->reussir('GET', '/api/categories')['categories'];

        self::assertIsArray($categories);
        self::assertSame(
            [['rouge', null, 3], ['rouge', 'Bordeaux', 2], ['blanc', null, 1], ['rose', null, 0]],
            array_map(fn (array $c): array => [$c['type'], $c['region']['name'] ?? null, $c['count']], $categories),
        );
    }

    public function testModifier(): void
    {
        $categorie = $this->reussir('POST', '/api/categories', [
            'type' => 'rouge', 'threshold' => 6, 'ageing_years' => 10,
        ], 201);
        $chemin = '/api/categories/' . $categorie['id'];

        $modifiee = $this->reussir('PATCH', $chemin, ['threshold' => null, 'type' => 'blanc']);

        self::assertSame(['rouge', null, 10], [$modifiee['type'], $modifiee['threshold'], $modifiee['ageing_years']]);
        self::assertSame(4, $this->reussir('PATCH', $chemin, ['threshold' => 4])['threshold']);
    }

    public function testSupprimer(): void
    {
        $categorie = $this->reussir('POST', '/api/categories', ['type' => 'rouge'], 201);

        $reponse = $this->api('DELETE', '/api/categories/' . $categorie['id']);

        self::assertSame(204, $reponse->getStatusCode());
        self::assertSame('', (string) $reponse->getBody());
        self::assertSame(0, (int) $this->valeur('SELECT COUNT(*) FROM categories'));
    }

    public function testChaqueEcritureRecalculeLesDatesLimites(): void
    {
        $bordeaux = $this->referentiel('regions', 'Bordeaux');
        $rouge = ['millesime' => 2018, 'date_limite_consommation' => '2026-12-31'];
        $bdx = $this->bouteille($rouge + ['region_id' => $bordeaux]);
        $autre = $this->bouteille($rouge);
        $sortie = $this->bouteille($rouge + ['statut' => 'sortie']);
        $blanc = $this->bouteille(['type' => 'blanc', 'millesime' => 2018, 'date_limite_consommation' => '2022-12-31']);
        $dates = fn (): array => array_map(
            fn (int $id): mixed => $this->valeur('SELECT date_limite_consommation FROM bouteilles WHERE id = ' . $id),
            [$bdx, $autre, $sortie, $blanc],
        );

        $generique = $this->reussir('POST', '/api/categories', ['type' => 'rouge', 'ageing_years' => 10], 201);
        self::assertSame(['2028-12-31', '2028-12-31', '2028-12-31', '2022-12-31'], $dates());

        $specifique = $this->reussir('POST', '/api/categories', [
            'type' => 'rouge', 'region' => 'Bordeaux', 'ageing_years' => 20,
        ], 201);
        self::assertSame(['2038-12-31', '2028-12-31', '2028-12-31', '2022-12-31'], $dates());

        $this->reussir('PATCH', '/api/categories/' . $generique['id'], ['ageing_years' => 5]);
        self::assertSame(['2038-12-31', '2023-12-31', '2023-12-31', '2022-12-31'], $dates());

        $this->reussir('PATCH', '/api/categories/' . $specifique['id'], ['ageing_years' => null]);
        self::assertSame(['2023-12-31', '2023-12-31', '2023-12-31', '2022-12-31'], $dates());

        $this->api('DELETE', '/api/categories/' . $generique['id']);
        self::assertSame(['2026-12-31', '2026-12-31', '2026-12-31', '2022-12-31'], $dates());
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function corpsInvalides(): iterable
    {
        yield 'sans type' => [[]];
        yield 'type inconnu' => [['type' => 'bleu']];
        yield 'région vide' => [['type' => 'rouge', 'region' => '']];
        yield 'seuil négatif' => [['type' => 'rouge', 'threshold' => -1]];
        yield 'seuil trop grand' => [['type' => 'rouge', 'threshold' => 65536]];
        yield 'seuil textuel' => [['type' => 'rouge', 'threshold' => '3']];
        yield 'garde trop longue' => [['type' => 'rouge', 'ageing_years' => 256]];
        yield 'garde négative' => [['type' => 'rouge', 'ageing_years' => -1]];
    }

    /** @param array<string, mixed> $corps */
    #[DataProvider('corpsInvalides')]
    public function testCorpsInvalide(array $corps): void
    {
        $reponse = $this->api('POST', '/api/categories', $corps + ['region' => 'Bordeaux']);

        self::assertSame(400, $reponse->getStatusCode());
        self::assertSame('VALIDATION_FAILED', $this->codeErreur($reponse));
        self::assertSame(
            0,
            (int) $this->valeur('SELECT (SELECT COUNT(*) FROM categories) + (SELECT COUNT(*) FROM regions)'),
        );
    }

    public function testModificationInvalide(): void
    {
        $categorie = $this->reussir('POST', '/api/categories', ['type' => 'rouge', 'threshold' => 2], 201);

        $reponse = $this->api('PATCH', '/api/categories/' . $categorie['id'], ['threshold' => 1.5]);

        self::assertSame(400, $reponse->getStatusCode());
        self::assertSame(2, (int) $this->valeur('SELECT seuil_min FROM categories'));
    }

    public function testIsolation(): void
    {
        $categorie = $this->reussir('POST', '/api/categories', ['type' => 'rouge', 'threshold' => 2], 201);
        $bob = $this->connecter('bob@exemple.fr');

        $chemin = '/api/categories/' . $categorie['id'];
        self::assertSame(404, $this->api('PATCH', $chemin, ['threshold' => 9], $bob)->getStatusCode());
        self::assertSame(404, $this->api('DELETE', $chemin, null, $bob)->getStatusCode());
        self::assertSame(['categories' => []], $this->json($this->api('GET', '/api/categories', null, $bob)));
        self::assertSame(2, (int) $this->valeur('SELECT seuil_min FROM categories'));
    }

    /** @return iterable<string, array{string, string}> */
    public static function routes(): iterable
    {
        yield 'liste' => ['GET', '/api/categories'];
        yield 'création' => ['POST', '/api/categories'];
        yield 'modification' => ['PATCH', '/api/categories/1'];
        yield 'suppression' => ['DELETE', '/api/categories/1'];
        yield 'manques' => ['GET', '/api/shortages'];
    }

    #[DataProvider('routes')]
    public function testSansJetonRefuse(string $methode, string $chemin): void
    {
        self::assertSame(401, $this->appeler($methode, $chemin)->getStatusCode());
    }
}
