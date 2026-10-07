<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Emplacements;

use CaveAVin\Tests\Support\CaveTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/** Armoires, étagères, cartons et vue globale (contrat §5, CdC §3.1). */
final class EmplacementsTest extends CaveTestCase
{
    public function testUneCaveNeuveEstVide(): void
    {
        $reponse = $this->api('GET', '/api/cellar');

        self::assertSame(200, $reponse->getStatusCode());
        self::assertSame('no-store', $reponse->getHeaderLine('Cache-Control'));
        self::assertSame(['cabinets' => [], 'boxes' => [], 'unplaced' => 0], $this->json($reponse));
    }

    public function testCreerUneArmoireAvecSesEtageres(): void
    {
        $armoire = $this->reussir('POST', '/api/cabinets', [
            'name' => 'Cave du bas',
            'shelves' => [['capacity' => 12], ['name' => 'Étagère du haut', 'capacity' => 8]],
        ], 201);

        [$premiere, $seconde] = $this->etageres($armoire);
        self::assertSame([
            'id' => $armoire['id'],
            'name' => 'Cave du bas',
            'shelves' => [
                ['id' => $premiere, 'name' => null, 'position' => 1, 'capacity' => 12, 'occupied' => 0],
                ['id' => $seconde, 'name' => 'Étagère du haut', 'position' => 2, 'capacity' => 8, 'occupied' => 0],
            ],
        ], $armoire);
        self::assertSame($this->idUtilisateur(), (int) $this->valeur('SELECT user_id FROM armoires'));
    }

    public function testUneArmoireSansEtagere(): void
    {
        $armoire = $this->reussir('POST', '/api/cabinets', ['name' => 'Vide'], 201);

        self::assertSame([], $armoire['shelves']);
    }

    public function testVueGlobaleCompteLesBouteillesEnCaveSeulement(): void
    {
        $bas = $this->creerArmoire('Cave du bas', [12, 6]);
        $haut = $this->creerArmoire('Cave du haut', [4]);
        [$e1, $e2] = $this->etageres($bas);
        $carton = $this->creerCarton('Carton Bordeaux', 6);
        $this->insererBouteille('etagere', $e1);
        $this->insererBouteille('etagere', $e1);
        $this->insererBouteille('carton', $carton);
        $this->insererBouteille('hors_rangement');
        $this->insererBouteille('hors_rangement', statut: 'sortie');
        $this->reussir('PATCH', '/api/shelves/' . $e2, ['position' => 0]);

        self::assertSame([
            'cabinets' => [
                ['id' => $bas['id'], 'name' => 'Cave du bas', 'shelves' => [
                    ['id' => $e2, 'name' => null, 'position' => 0, 'capacity' => 6, 'occupied' => 0],
                    ['id' => $e1, 'name' => null, 'position' => 1, 'capacity' => 12, 'occupied' => 2],
                ]],
                ['id' => $haut['id'], 'name' => 'Cave du haut', 'shelves' => [
                    ['id' => $this->etageres($haut)[0], 'name' => null, 'position' => 1, 'capacity' => 4,
                        'occupied' => 0],
                ]],
            ],
            'boxes' => [['id' => $carton, 'label' => 'Carton Bordeaux', 'capacity' => 6, 'occupied' => 1]],
            'unplaced' => 1,
        ], $this->reussir('GET', '/api/cellar'));
    }

    public function testRenommerUneArmoire(): void
    {
        $armoire = $this->creerArmoire('Cave', [3]);

        $renommee = $this->reussir('PATCH', '/api/cabinets/' . $armoire['id'], ['name' => 'Cellier']);

        self::assertSame('Cellier', $renommee['name']);
        self::assertSame($armoire['shelves'], $renommee['shelves']);
    }

    public function testAjouterUneEtagerePlaceeApresLaDerniere(): void
    {
        $armoire = $this->creerArmoire('Cave', [3, 3]);

        $etagere = $this->reussir('POST', '/api/cabinets/' . $armoire['id'] . '/shelves', ['capacity' => 5], 201);

        self::assertSame(
            ['id' => $etagere['id'], 'name' => null, 'position' => 3, 'capacity' => 5, 'occupied' => 0],
            $etagere,
        );
    }

    public function testAjouterUneEtagereAUnePositionDonnee(): void
    {
        $armoire = $this->reussir('POST', '/api/cabinets', ['name' => 'Cave'], 201);

        $etagere = $this->reussir('POST', '/api/cabinets/' . $armoire['id'] . '/shelves', [
            'name' => 'Basse', 'capacity' => 5, 'position' => 7,
        ], 201);

        self::assertSame(['Basse', 7], [$etagere['name'], $etagere['position']]);
    }

    public function testModifierUneEtagere(): void
    {
        $etagere = $this->etageres($this->creerArmoire('Cave', [6]))[0];
        $this->insererBouteille('etagere', $etagere);
        $this->insererBouteille('etagere', $etagere);

        $modifiee = $this->reussir('PATCH', '/api/shelves/' . $etagere, [
            'name' => 'Haute', 'capacity' => 2, 'position' => 4,
        ]);

        self::assertSame(
            ['id' => $etagere, 'name' => 'Haute', 'position' => 4, 'capacity' => 2, 'occupied' => 2],
            $modifiee,
        );
    }

    public function testEffacerLeNomDUneEtagere(): void
    {
        $armoire = $this->reussir('POST', '/api/cabinets', [
            'name' => 'Cave', 'shelves' => [['name' => 'Haute', 'capacity' => 6]],
        ], 201);
        $etagere = $this->etageres($armoire)[0];

        $modifiee = $this->reussir('PATCH', '/api/shelves/' . $etagere, ['name' => null]);

        self::assertNull($modifiee['name']);
        self::assertSame(6, $modifiee['capacity']);
    }

    public function testCapaciteDEtagereSousLOccupationRefusee(): void
    {
        $etagere = $this->etageres($this->creerArmoire('Cave', [6]))[0];
        $this->insererBouteille('etagere', $etagere);
        $this->insererBouteille('etagere', $etagere);
        $this->insererBouteille('etagere', $etagere);
        $this->insererBouteille('hors_rangement', statut: 'sortie');

        $reponse = $this->api('PATCH', '/api/shelves/' . $etagere, ['capacity' => 2, 'name' => 'Haute']);

        self::assertSame(409, $reponse->getStatusCode());
        self::assertSame(['error' => [
            'code' => 'CAPACITY_BELOW_OCCUPANCY',
            'message' => 'Capacité inférieure à l’occupation actuelle : 3 bouteilles rangées.',
        ]], $this->json($reponse));
        self::assertSame(
            ['capacite_alveoles' => 6, 'nom' => null],
            $this->ligne('SELECT capacite_alveoles, nom FROM etageres'),
        );
    }

    public function testCreerEtModifierUnCarton(): void
    {
        $carton = $this->reussir('POST', '/api/boxes', ['label' => 'Carton Bordeaux', 'capacity' => 6], 201);
        self::assertSame(
            ['id' => $carton['id'], 'label' => 'Carton Bordeaux', 'capacity' => 6, 'occupied' => 0],
            $carton,
        );
        $this->insererBouteille('carton', $carton['id']);

        $modifie = $this->reussir('PATCH', '/api/boxes/' . $carton['id'], ['label' => 'Carton Loire', 'capacity' => 1]);

        self::assertSame(
            ['id' => $carton['id'], 'label' => 'Carton Loire', 'capacity' => 1, 'occupied' => 1],
            $modifie,
        );
    }

    public function testCapaciteDeCartonSousLOccupationRefusee(): void
    {
        $carton = $this->creerCarton('Carton', 6);
        $this->insererBouteille('carton', $carton);
        $this->insererBouteille('carton', $carton);

        $reponse = $this->api('PATCH', '/api/boxes/' . $carton, ['capacity' => 1]);

        self::assertSame(409, $reponse->getStatusCode());
        self::assertSame('CAPACITY_BELOW_OCCUPANCY', $this->codeErreur($reponse));
        self::assertSame(6, (int) $this->valeur('SELECT capacite FROM cartons'));
    }

    public function testPatchVideNeChangeRien(): void
    {
        $carton = $this->creerCarton('Carton', 6);

        $modifie = $this->reussir('PATCH', '/api/boxes/' . $carton, []);

        self::assertSame(['Carton', 6], [$modifie['label'], $modifie['capacity']]);
    }

    /** @return iterable<string, array{string, string, array<string, mixed>}> */
    public static function corpsInvalides(): iterable
    {
        $long = str_repeat('é', 101);
        yield 'armoire sans nom' => ['POST', '/api/cabinets', []];
        yield 'armoire au nom vide' => ['POST', '/api/cabinets', ['name' => '']];
        yield 'armoire au nom trop long' => ['POST', '/api/cabinets', ['name' => $long]];
        yield 'armoire au nom non textuel' => ['POST', '/api/cabinets', ['name' => 12]];
        yield 'étagères non listées' => ['POST', '/api/cabinets', ['name' => 'A', 'shelves' => 'x']];
        yield 'étagère sans capacité' => ['POST', '/api/cabinets', ['name' => 'A', 'shelves' => [[]]]];
        yield 'étagère de capacité nulle' => [
            'POST',
            '/api/cabinets',
            ['name' => 'A', 'shelves' => [['capacity' => 0]]],
        ];
        yield 'capacité trop grande' => [
            'POST',
            '/api/cabinets',
            ['name' => 'A', 'shelves' => [['capacity' => 65536]]],
        ];
        yield 'capacité en texte' => ['POST', '/api/cabinets', ['name' => 'A', 'shelves' => [['capacity' => '6']]]];
        yield 'capacité décimale' => ['POST', '/api/cabinets', ['name' => 'A', 'shelves' => [['capacity' => 6.5]]]];
        yield 'nom d’étagère vide' => [
            'POST',
            '/api/cabinets',
            ['name' => 'A', 'shelves' => [['name' => '', 'capacity' => 6]]],
        ];
        yield 'carton sans libellé' => ['POST', '/api/boxes', ['capacity' => 6]];
        yield 'carton sans capacité' => ['POST', '/api/boxes', ['label' => 'C']];
        yield 'carton au libellé trop long' => ['POST', '/api/boxes', ['label' => $long, 'capacity' => 6]];
    }

    /** @param array<string, mixed> $corps */
    #[DataProvider('corpsInvalides')]
    public function testCorpsInvalideRefuseSansRienCreer(string $methode, string $chemin, array $corps): void
    {
        $reponse = $this->api($methode, $chemin, $corps);

        self::assertSame(400, $reponse->getStatusCode());
        self::assertSame('VALIDATION_FAILED', $this->codeErreur($reponse));
        self::assertSame(
            0,
            (int) $this->valeur('SELECT (SELECT COUNT(*) FROM armoires) + (SELECT COUNT(*) FROM cartons)'),
        );
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function modificationsDEtagereInvalides(): iterable
    {
        yield 'capacité nulle' => [['capacity' => 0]];
        yield 'capacité à null' => [['capacity' => null]];
        yield 'position négative' => [['position' => -1]];
        yield 'position trop grande' => [['position' => 65536]];
        yield 'position en texte' => [['position' => '2']];
        yield 'nom vide' => [['name' => '']];
    }

    /** @param array<string, mixed> $corps */
    #[DataProvider('modificationsDEtagereInvalides')]
    public function testModificationDEtagereInvalide(array $corps): void
    {
        $etagere = $this->etageres($this->creerArmoire('Cave', [6]))[0];

        $reponse = $this->api('PATCH', '/api/shelves/' . $etagere, $corps);

        self::assertSame(400, $reponse->getStatusCode());
        self::assertSame('VALIDATION_FAILED', $this->codeErreur($reponse));
    }

    public function testRenommerUneArmoireExigeUnNom(): void
    {
        $armoire = $this->creerArmoire('Cave', []);

        $reponse = $this->api('PATCH', '/api/cabinets/' . $armoire['id'], []);

        self::assertSame(400, $reponse->getStatusCode());
    }

    public function testLeLibelleDuCartonNeSEffacePas(): void
    {
        $carton = $this->creerCarton('Carton', 6);

        self::assertSame(400, $this->api('PATCH', '/api/boxes/' . $carton, ['label' => null])->getStatusCode());
    }

    /** @return iterable<string, array{string, string}> */
    public static function ressourcesInexistantes(): iterable
    {
        yield 'renommer une armoire' => ['PATCH', '/api/cabinets/999999'];
        yield 'supprimer une armoire' => ['DELETE', '/api/cabinets/999999'];
        yield 'ajouter une étagère' => ['POST', '/api/cabinets/999999/shelves'];
        yield 'modifier une étagère' => ['PATCH', '/api/shelves/999999'];
        yield 'supprimer une étagère' => ['DELETE', '/api/shelves/999999'];
        yield 'modifier un carton' => ['PATCH', '/api/boxes/999999'];
        yield 'supprimer un carton' => ['DELETE', '/api/boxes/999999'];
        yield 'identifiant non numérique' => ['PATCH', '/api/boxes/abc'];
    }

    #[DataProvider('ressourcesInexistantes')]
    public function testRessourceInexistanteEn404(string $methode, string $chemin): void
    {
        $reponse = $this->api($methode, $chemin, ['name' => 'X', 'label' => 'X', 'capacity' => 3]);

        self::assertSame(404, $reponse->getStatusCode());
        self::assertSame('NOT_FOUND', $this->codeErreur($reponse));
    }

    /** @return iterable<string, array{string, string}> */
    public static function routesDesEmplacements(): iterable
    {
        yield 'vue globale' => ['GET', '/api/cellar'];
        yield 'créer une armoire' => ['POST', '/api/cabinets'];
        yield 'renommer une armoire' => ['PATCH', '/api/cabinets/1'];
        yield 'supprimer une armoire' => ['DELETE', '/api/cabinets/1'];
        yield 'ajouter une étagère' => ['POST', '/api/cabinets/1/shelves'];
        yield 'modifier une étagère' => ['PATCH', '/api/shelves/1'];
        yield 'supprimer une étagère' => ['DELETE', '/api/shelves/1'];
        yield 'créer un carton' => ['POST', '/api/boxes'];
        yield 'modifier un carton' => ['PATCH', '/api/boxes/1'];
        yield 'supprimer un carton' => ['DELETE', '/api/boxes/1'];
        yield 'suggestion' => ['GET', '/api/locations/suggestion'];
    }

    #[DataProvider('routesDesEmplacements')]
    public function testSansJetonRefuse(string $methode, string $chemin): void
    {
        self::assertSame(401, $this->appeler($methode, $chemin)->getStatusCode());
    }
}
