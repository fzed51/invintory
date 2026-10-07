<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Emplacements;

use CaveAVin\Tests\Support\CaveTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Suggestion d'emplacement (CdC §3.2, contrat §5) : étagères (armoires par id, étagères par
 * position puis id), puis cartons ; candidat = place libre ≥ count ; skip = k → (k+1)-ième.
 */
final class SuggestionTest extends CaveTestCase
{
    public function testCaveSansEmplacement(): void
    {
        $reponse = $this->api('GET', '/api/locations/suggestion');

        self::assertSame(200, $reponse->getStatusCode());
        self::assertSame('no-store', $reponse->getHeaderLine('Cache-Control'));
        self::assertSame(['location' => null, 'free' => 0], $this->json($reponse));
    }

    public function testParcoursCompletDansLOrdreDuContrat(): void
    {
        $bas = $this->reussir('POST', '/api/cabinets', ['name' => 'Cave du bas', 'shelves' => [
            ['capacity' => 2],
            ['name' => 'Étagère du haut', 'capacity' => 3],
        ]], 201);
        [$b1, $b2] = $this->etageres($bas);
        $haut = $this->creerArmoire('Cave du haut', [1]);
        $h1 = $this->etageres($haut)[0];
        $carton = $this->creerCarton('Carton Bordeaux', 6);
        // L'étagère du haut passe devant la première.
        $this->reussir('PATCH', '/api/shelves/' . $b2, ['position' => 0]);
        $this->insererBouteille('etagere', $b1);

        $etagere = fn (int $id, int $armoire, string $libelle, int $libre): array => [
            'location' => ['type' => 'etagere', 'id' => $id, 'cabinet_id' => $armoire, 'label' => $libelle],
            'free' => $libre,
        ];
        self::assertSame([
            $etagere($b2, $bas['id'], 'Cave du bas · Étagère du haut', 3),
            $etagere($b1, $bas['id'], 'Cave du bas · Étagère 1', 1),
            $etagere($h1, $haut['id'], 'Cave du haut · Étagère 1', 1),
            ['location' => ['type' => 'carton', 'id' => $carton, 'label' => 'Carton Bordeaux'], 'free' => 6],
            ['location' => null, 'free' => 0],
        ], array_map(
            fn (int $k): array => $this->reussir('GET', '/api/locations/suggestion?skip=' . $k),
            range(0, 4),
        ));
    }

    public function testLesEmplacementsCompletsSontSautes(): void
    {
        [$e1, $e2] = $this->etageres($this->creerArmoire('Cave', [1, 4]));
        $this->insererBouteille('etagere', $e1);
        $this->insererBouteille('hors_rangement', statut: 'sortie');

        $suggestion = $this->reussir('GET', '/api/locations/suggestion');

        self::assertSame([$e2, 4], [$suggestion['location']['id'] ?? null, $suggestion['free']]);
    }

    public function testCountExigeAssezDePlaceLibre(): void
    {
        [, $e2] = $this->etageres($this->creerArmoire('Cave', [3, 6]));
        $carton = $this->creerCarton('Carton', 12);
        $this->insererBouteille('etagere', $e2);

        self::assertSame($e2, $this->reussir('GET', '/api/locations/suggestion?count=5')['location']['id'] ?? null);
        self::assertSame($carton, $this->reussir('GET', '/api/locations/suggestion?count=6')['location']['id'] ?? null);
        self::assertSame(
            ['location' => null, 'free' => 0],
            $this->reussir('GET', '/api/locations/suggestion?count=13'),
        );
    }

    public function testLesEmplacementsDUnAutreCompteNeSontPasProposes(): void
    {
        $jetonDeBob = $this->connecter('bob@exemple.fr');
        $this->api('POST', '/api/boxes', ['label' => 'Carton de Bob', 'capacity' => 6], $jetonDeBob);

        self::assertSame(['location' => null, 'free' => 0], $this->reussir('GET', '/api/locations/suggestion'));
    }

    /** @return iterable<string, array{string}> */
    public static function parametresInvalides(): iterable
    {
        yield 'count nul' => ['count=0'];
        yield 'count négatif' => ['count=-1'];
        yield 'count non entier' => ['count=1.5'];
        yield 'count textuel' => ['count=abc'];
        yield 'count trop grand' => ['count=65536'];
        yield 'skip négatif' => ['skip=-1'];
        yield 'skip vide' => ['skip='];
        yield 'count en tableau' => ['count[]=1'];
    }

    #[DataProvider('parametresInvalides')]
    public function testParametreInvalide(string $parametres): void
    {
        $reponse = $this->api('GET', '/api/locations/suggestion?' . $parametres);

        self::assertSame(400, $reponse->getStatusCode());
        self::assertSame('VALIDATION_FAILED', $this->codeErreur($reponse));
    }
}
