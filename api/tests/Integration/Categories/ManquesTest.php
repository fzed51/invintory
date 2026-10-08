<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Categories;

use CaveAVin\Tests\Support\CaveTestCase;

/**
 * Manques (CdC §3.7, contrat §9) : catégorie à seuil dont le compte est inférieur, avec la
 * quantité manquante et les vins déjà eus, du dernier mouvement le plus récent au plus ancien.
 */
final class ManquesTest extends CaveTestCase
{
    public function testAucunManque(): void
    {
        $this->reussir('POST', '/api/categories', ['type' => 'rouge'], 201);
        $this->reussir('POST', '/api/categories', ['type' => 'blanc', 'threshold' => 1], 201);
        $this->bouteille(['type' => 'blanc']);

        $reponse = $this->api('GET', '/api/shortages');

        self::assertSame('no-store', $reponse->getHeaderLine('Cache-Control'));
        self::assertSame(['shortages' => []], $this->json($reponse));
    }

    public function testCategoriesEnManqueEtQuantiteManquante(): void
    {
        $bordeaux = $this->referentiel('regions', 'Bordeaux');
        $this->bouteille(['region_id' => $bordeaux]);
        $this->bouteille(['region_id' => $bordeaux, 'statut' => 'sortie']);
        $specifique = $this->reussir('POST', '/api/categories', [
            'type' => 'rouge', 'region' => 'Bordeaux', 'threshold' => 3,
        ], 201);
        $generique = $this->reussir('POST', '/api/categories', ['type' => 'rouge', 'threshold' => 2], 201);
        $this->reussir('POST', '/api/categories', ['type' => 'rose', 'region' => 'Provence'], 201);
        $this->reussir('POST', '/api/categories', ['type' => 'blanc', 'threshold' => 0], 201);

        $manques = $this->reussir('GET', '/api/shortages')['shortages'];

        self::assertIsArray($manques);
        self::assertSame([
            [['id' => $generique['id'], 'type' => 'rouge', 'region' => null], 2, 1, 1],
            [
                ['id' => $specifique['id'], 'type' => 'rouge', 'region' => ['id' => $bordeaux, 'name' => 'Bordeaux']],
                3,
                1,
                2,
            ],
        ], array_map(fn (array $m): array => [$m['category'], $m['threshold'], $m['count'], $m['missing']], $manques));
    }

    public function testSuggestionsDesVinsDejaEus(): void
    {
        $bordeaux = $this->referentiel('regions', 'Bordeaux');
        $loire = $this->referentiel('regions', 'Loire');
        $merlot = $this->referentiel('cepages', 'Merlot');
        $vin = ['domaine' => 'Château A', 'millesime' => 2018, 'region_id' => $bordeaux, 'cepage_id' => $merlot];
        $this->avecMouvement($vin, '2026-09-01 12:00:00.000');
        $this->avecMouvement($vin, '2026-03-01 12:00:00.000');
        $this->avecMouvement(['domaine' => 'Château B', 'region_id' => $loire], '2026-09-15 08:00:00.250');
        $this->avecMouvement(['domaine' => 'Château C', 'millesime' => 2015], '2025-01-01 00:00:00.000');
        $this->avecMouvement(['type' => 'blanc', 'domaine' => 'Blanc'], '2026-10-01 00:00:00.000');
        $this->reussir('POST', '/api/categories', ['type' => 'rouge', 'threshold' => 1], 201);
        $this->reussir('POST', '/api/categories', ['type' => 'rouge', 'region' => 'Bordeaux', 'threshold' => 1], 201);

        $manques = $this->reussir('GET', '/api/shortages')['shortages'];

        self::assertIsArray($manques);
        self::assertSame([
            ['domain' => 'Château B', 'vintage' => null, 'region' => 'Loire', 'grape' => null,
                'last_movement_at' => '2026-09-15T08:00:00.250Z'],
            ['domain' => 'Château A', 'vintage' => 2018, 'region' => 'Bordeaux', 'grape' => 'Merlot',
                'last_movement_at' => '2026-09-01T12:00:00.000Z'],
            ['domain' => 'Château C', 'vintage' => 2015, 'region' => null, 'grape' => null,
                'last_movement_at' => '2025-01-01T00:00:00.000Z'],
        ], $manques[0]['suggestions']);
        self::assertSame(['Château A'], array_column($manques[1]['suggestions'], 'domain'));
    }

    public function testDixSuggestionsAuPlus(): void
    {
        foreach (range(1, 12) as $n) {
            $this->avecMouvement(['domaine' => 'Domaine ' . $n], sprintf('2026-01-%02d 00:00:00.000', $n));
        }
        $this->reussir('POST', '/api/categories', ['type' => 'rouge', 'threshold' => 1], 201);

        $suggestions = $this->reussir('GET', '/api/shortages')['shortages'][0]['suggestions'] ?? null;

        self::assertIsArray($suggestions);
        self::assertSame(['Domaine 12', 'Domaine 3'], [$suggestions[0]['domain'], $suggestions[9]['domain']]);
        self::assertCount(10, $suggestions);
    }

    public function testIsolation(): void
    {
        $this->avecMouvement(['domaine' => 'Château d’Alice'], '2026-01-01 00:00:00.000');
        $this->reussir('POST', '/api/categories', ['type' => 'rouge', 'threshold' => 1], 201);
        $bob = $this->connecter('bob@exemple.fr');
        $this->api('POST', '/api/categories', ['type' => 'rouge', 'threshold' => 1], $bob);

        $manques = $this->json($this->api('GET', '/api/shortages', null, $bob))['shortages'];

        self::assertIsArray($manques);
        self::assertSame([[]], array_column($manques, 'suggestions'));
    }

    /**
     * Bouteille sortie (sauf mention contraire) et son mouvement d'entrée daté $date.
     *
     * @param array<string, mixed> $colonnes
     */
    private function avecMouvement(array $colonnes, string $date): void
    {
        $id = $this->bouteille($colonnes + ['statut' => 'sortie']);
        $this->pdo->prepare(
            "INSERT INTO mouvements (bouteille_id, user_id, type_mouvement, emplacement_apres_type, date_mouvement)"
            . " VALUES (?, ?, 'entree', 'hors_rangement', ?)"
        )->execute([$id, $this->idUtilisateur(), $date]);
    }
}
