<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Emplacements;

use CaveAVin\Tests\Support\CaveTestCase;

/**
 * Isolation stricte (CdC §4, contrat §1.1) : un emplacement d'un autre compte est
 * indiscernable d'un emplacement inexistant (404), et n'est jamais modifié.
 */
final class IsolationTest extends CaveTestCase
{
    public function testBobNAccedeANAucunEmplacementDAlice(): void
    {
        $armoire = $this->creerArmoire('Cave d’Alice', [6]);
        $etagere = $this->etageres($armoire)[0];
        $carton = $this->creerCarton('Carton d’Alice', 6);
        $this->insererBouteille('etagere', $etagere);
        $avant = $this->etat();
        $bob = $this->connecter('bob@exemple.fr');

        $tentatives = [
            ['PATCH', '/api/cabinets/' . $armoire['id'], ['name' => 'Pris']],
            ['POST', '/api/cabinets/' . $armoire['id'] . '/shelves', ['capacity' => 3]],
            ['PATCH', '/api/shelves/' . $etagere, ['capacity' => 1]],
            ['PATCH', '/api/boxes/' . $carton, ['label' => 'Pris']],
            ['DELETE', '/api/shelves/' . $etagere, null],
            ['DELETE', '/api/boxes/' . $carton, null],
            ['DELETE', '/api/cabinets/' . $armoire['id'], null],
        ];
        foreach ($tentatives as [$methode, $chemin, $corps]) {
            $reponse = $this->api($methode, $chemin, $corps, $bob);
            self::assertSame(404, $reponse->getStatusCode(), $methode . ' ' . $chemin);
            self::assertSame('NOT_FOUND', $this->codeErreur($reponse));
        }

        self::assertSame($avant, $this->etat());
        self::assertSame(
            ['cabinets' => [], 'boxes' => [], 'unplaced' => 0],
            $this->json($this->api('GET', '/api/cellar', null, $bob)),
        );
    }

    public function testChaqueCompteVoitSaPropreCave(): void
    {
        $this->creerArmoire('Cave d’Alice', [6]);
        $bob = $this->connecter('bob@exemple.fr');
        $this->api('POST', '/api/boxes', ['label' => 'Carton de Bob', 'capacity' => 3], $bob);
        $this->insererBouteille('hors_rangement', email: 'bob@exemple.fr');

        $alice = $this->reussir('GET', '/api/cellar');
        $deBob = $this->json($this->api('GET', '/api/cellar', null, $bob));

        self::assertSame([1, [], 0], [count($alice['cabinets']), $alice['boxes'], $alice['unplaced']]);
        self::assertSame([[], 1, 1], [$deBob['cabinets'], count($deBob['boxes']), $deBob['unplaced']]);
    }

    /** @return array<string, mixed> */
    private function etat(): array
    {
        return [
            'armoires' => $this->lignes('SELECT * FROM armoires'),
            'etageres' => $this->lignes('SELECT * FROM etageres'),
            'cartons' => $this->lignes('SELECT * FROM cartons'),
            'bouteilles' => $this->lignes('SELECT id, emplacement_type, etagere_id, carton_id FROM bouteilles'),
            'mouvements' => $this->lignes('SELECT * FROM mouvements'),
        ];
    }
}
