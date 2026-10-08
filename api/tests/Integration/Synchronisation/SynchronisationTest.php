<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Synchronisation;

use CaveAVin\Tests\Support\MouvementsTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * POST /api/sync (contrat §10 ; Arch §4.2, §4.5) : lot en une transaction, mutations dans
 * l'ordre reçu, idempotence par client_ref, rejets propres, horloge logique.
 */
final class SynchronisationTest extends MouvementsTestCase
{
    private int $etagere;

    protected function setUp(): void
    {
        parent::setUp();
        $this->etagere = $this->etageres($this->creerArmoire('Cave', [2]))[0];
    }

    public function testAjoutDeplacementSortieDansUnLot(): void
    {
        [$a, $b] = $this->reserver(2);

        $resultats = $this->synchroniser([
            $this->ajout(1, [[10, $a], [11, $b]], ['type' => 'etagere', 'id' => $this->etagere], [
                'region' => 'Bordeaux', 'grape' => 'Merlot', 'domain' => 'Château Exemple', 'vintage' => 2018,
                'note' => 'Offert par Paul', 'souvenir' => true,
            ]),
            $this->deplacement(2, 10, ['type' => 'hors_rangement'], '2026-10-07T19:05:12.345Z'),
            $this->sortie(3, 11, 'consommee', '2026-10-07T21:30:00.000Z'),
        ]);

        $ids = $this->idsParClientRef();
        self::assertSame([
            [
                'client_ref' => self::uuid(1),
                'status' => 'applied',
                'bottles' => [
                    [
                        'client_ref' => self::uuid(10), 'id' => $ids[self::uuid(10)], 'reference' => $a,
                        'location' => [
                            'type' => 'etagere', 'id' => $this->etagere, 'cabinet_id' => $this->armoire(),
                            'label' => 'Cave · Étagère 1',
                        ],
                        'redirected' => null,
                    ],
                    [
                        'client_ref' => self::uuid(11), 'id' => $ids[self::uuid(11)], 'reference' => $b,
                        'location' => [
                            'type' => 'etagere', 'id' => $this->etagere, 'cabinet_id' => $this->armoire(),
                            'label' => 'Cave · Étagère 1',
                        ],
                        'redirected' => null,
                    ],
                ],
            ],
            [
                'client_ref' => self::uuid(2), 'status' => 'applied',
                'movement_id' => $this->mouvement(self::uuid(2)), 'redirected' => null,
            ],
            ['client_ref' => self::uuid(3), 'status' => 'applied', 'movement_id' => $this->mouvement(self::uuid(3))],
        ], $resultats);

        $premiere = $this->reussir('GET', '/api/bottles/' . $ids[self::uuid(10)]);
        self::assertSame(['type' => 'hors_rangement'], $premiere['location']);
        self::assertSame(['Bordeaux', 'Merlot', 'Château Exemple', 2018, '2026-10', 'Offert par Paul', true], [
            $premiere['region']['name'] ?? null, $premiere['grape']['name'] ?? null, $premiere['domain'],
            $premiere['vintage'], $premiere['entry_date'], $premiere['note'], $premiere['souvenir'],
        ]);
        self::assertSame(self::uuid(1), $premiere['batch_id']);
        self::assertSame('2026-12-31', $premiere['drink_by']);
        self::assertSame('sortie', $this->reussir('GET', '/api/bottles/' . $ids[self::uuid(11)])['status']);
        self::assertSame(
            [['entree', null, '2026-10-07 18:40:00.000'], ['deplacement', self::uuid(2), '2026-10-07 19:05:12.345']],
            array_map(
                fn (array $m): array => [$m['type_mouvement'], $m['client_ref'], $m['date_mouvement']],
                $this->mouvementsDe($ids[self::uuid(10)]),
            ),
        );
    }

    public function testAjoutSansReferenceEnGenereUne(): void
    {
        $resultats = $this->synchroniser([$this->ajout(1, [[10, null]])]);

        self::assertSame('a0', $resultats[0]['bottles'][0]['reference']);
        self::assertSame(['type' => 'hors_rangement'], $resultats[0]['bottles'][0]['location']);
    }

    public function testMemeLotEnvoyeDeuxFoisSansDoublon(): void
    {
        [$a] = $this->reserver(1);
        $lot = [
            $this->ajout(1, [[10, $a], [11, null]], ['type' => 'etagere', 'id' => $this->etagere]),
            $this->deplacement(2, 10, ['type' => 'hors_rangement'], '2026-10-07T19:00:00.000Z'),
            $this->sortie(3, 11, 'offerte', '2026-10-07T20:00:00.000Z'),
        ];
        $premier = $this->synchroniser($lot);

        $second = $this->synchroniser($lot);

        self::assertSame(
            array_map(fn (array $r): array => array_replace($r, ['status' => 'already_applied']), $premier),
            $second,
        );
        self::assertSame(2, (int) $this->valeur('SELECT COUNT(*) FROM bouteilles'));
        self::assertSame(4, (int) $this->valeur('SELECT COUNT(*) FROM mouvements'));
    }

    public function testRejeuReconstruitLaRedirection(): void
    {
        $lot = [
            $this->ajout(1, [[10, null], [11, null], [12, null]], ['type' => 'etagere', 'id' => $this->etagere]),
            $this->deplacement(2, 12, ['type' => 'etagere', 'id' => 999_999], '2026-10-07T19:00:00.000Z'),
        ];
        $premier = $this->synchroniser($lot);
        self::assertSame(
            [null, null, 'CAPACITY_EXCEEDED'],
            array_column($premier[0]['bottles'], 'redirected'),
        );
        self::assertSame('LOCATION_NOT_FOUND', $premier[1]['redirected']);
        // Déplacée depuis : la réponse rejouée reste celle de l'ajout.
        $this->synchroniser([$this->deplacement(3, 10, ['type' => 'hors_rangement'], '2026-10-08T08:00:00.000Z')]);

        $second = $this->synchroniser($lot);

        self::assertSame(
            array_map(fn (array $r): array => array_replace($r, ['status' => 'already_applied']), $premier),
            $second,
        );
    }

    public function testDoublonDansLeMemeLot(): void
    {
        $ajout = $this->ajout(1, [[10, null]]);

        $resultats = $this->synchroniser([$ajout, $ajout]);

        self::assertSame(['applied', 'already_applied'], array_column($resultats, 'status'));
        self::assertSame(1, (int) $this->valeur('SELECT COUNT(*) FROM bouteilles'));
    }

    public function testMouvementAvantSonAjoutPuisAuLotSuivant(): void
    {
        $deplacement = $this->deplacement(
            2,
            10,
            ['type' => 'etagere', 'id' => $this->etagere],
            '2026-10-07T19:00:00.000Z',
        );

        $premier = $this->synchroniser([$deplacement, $this->ajout(1, [[10, null]])]);
        $second = $this->synchroniser([$deplacement]);

        self::assertSame([
            'client_ref' => self::uuid(2), 'status' => 'rejected',
            'error' => ['code' => 'BOTTLE_NOT_FOUND', 'message' => 'Bouteille inconnue.'],
        ], $premier[0]);
        self::assertSame('applied', $premier[1]['status']);
        self::assertSame('applied', $second[0]['status']);
        $bouteille = $this->reussir('GET', '/api/bottles/' . $this->idsParClientRef()[self::uuid(10)]);
        self::assertSame('etagere', $bouteille['location']['type'] ?? null);
    }

    public function testRejetsSansEffetSurLeResteDuLot(): void
    {
        [$a] = $this->reserver(1);

        $resultats = $this->synchroniser([
            $this->ajout(1, [[10, $a]]),
            $this->ajout(2, [[11, $a]]),
            $this->ajout(3, [[12, 'zz']]),
            $this->sortie(4, 10, 'consommee', '2026-10-07T20:00:00.000Z'),
            $this->deplacement(5, 10, ['type' => 'hors_rangement'], '2026-10-07T21:00:00.000Z'),
            $this->sortie(6, 10, 'offerte', '2026-10-07T22:00:00.000Z'),
            $this->ajout(7, [[13, null]]),
        ]);

        self::assertSame(
            ['applied', 'rejected', 'rejected', 'applied', 'rejected', 'rejected', 'applied'],
            array_column($resultats, 'status'),
        );
        self::assertSame(
            ['REFERENCE_TAKEN', 'REFERENCE_NOT_RESERVED', 'BOTTLE_EXITED', 'BOTTLE_EXITED'],
            array_column(array_column($resultats, 'error'), 'code'),
        );
        self::assertSame(
            [self::uuid(10), self::uuid(13)],
            array_column($this->lignes('SELECT client_ref FROM bouteilles ORDER BY id'), 'client_ref'),
        );
        self::assertSame(3, (int) $this->valeur('SELECT COUNT(*) FROM mouvements'));
    }

    public function testConflitDeDeuxAppareils(): void
    {
        $carton = $this->creerCarton('Carton', 6);
        $this->synchroniser([$this->ajout(1, [[10, null]], ['type' => 'etagere', 'id' => $this->etagere])]);

        // L'appareil B, plus récent, synchronise avant l'appareil A.
        $this->synchroniser([
            $this->deplacement(3, 10, ['type' => 'carton', 'id' => $carton], '2026-10-07T20:00:00.000Z'),
        ]);
        $a = $this->synchroniser([$this->deplacement(2, 10, ['type' => 'hors_rangement'], '2026-10-07T19:00:00.000Z')]);

        self::assertSame('applied', $a[0]['status']);
        $id = $this->idsParClientRef()[self::uuid(10)];
        self::assertSame(
            ['type' => 'carton', 'id' => $carton, 'label' => 'Carton'],
            $this->reussir('GET', '/api/bottles/' . $id)['location'],
        );
        self::assertSame(
            [['entree', null], ['deplacement', self::uuid(3)], ['deplacement', self::uuid(2)]],
            array_map(fn (array $m): array => [$m['type_mouvement'], $m['client_ref']], $this->mouvementsDe($id)),
        );
    }

    public function testVersionDeSchemaInconnue(): void
    {
        $ajout = $this->ajout(1, [[10, null]]);
        $ajout['schema_version'] = 2;

        self::assertSame([[
            'client_ref' => self::uuid(1), 'status' => 'rejected',
            'error' => [
                'code' => 'UNSUPPORTED_SCHEMA_VERSION',
                'message' => 'Version de mutation 2 non prise en charge.',
            ],
        ]], $this->synchroniser([$ajout]));
        self::assertSame(0, (int) $this->valeur('SELECT COUNT(*) FROM bouteilles'));
    }

    /** @return iterable<string, array{array<string, mixed>, string}> */
    public static function mutationsMalFormees(): iterable
    {
        $uuid = fn (int $n): string => self::uuid($n);
        $ajout = [
            'client_ref' => $uuid(1), 'schema_version' => 1, 'kind' => 'add',
            'occurred_at' => '2026-10-07T18:40:00.000Z',
            'bottles' => [['client_ref' => $uuid(10)]],
            'fields' => ['type' => 'rouge', 'entry_date' => '2026-10', 'origin' => 'achetee'],
            'location' => ['type' => 'hors_rangement'],
        ];
        $deplacement = [
            'client_ref' => $uuid(1), 'schema_version' => 1, 'kind' => 'move',
            'occurred_at' => '2026-10-07T18:40:00.000Z',
            'bottle' => $uuid(10), 'location' => ['type' => 'hors_rangement'],
        ];
        $sortie = [
            'client_ref' => $uuid(1), 'schema_version' => 1, 'kind' => 'exit',
            'occurred_at' => '2026-10-07T18:40:00.000Z',
            'bottle' => $uuid(10), 'exit_reason' => 'consommee',
        ];

        yield 'version absente' => [array_diff_key($ajout, ['schema_version' => 0]), 'schema_version'];
        yield 'version non entière' => [['schema_version' => '1'] + $ajout, 'schema_version'];
        yield 'kind inconnu' => [['kind' => 'delete'] + $ajout, 'kind'];
        yield 'date absente' => [array_diff_key($ajout, ['occurred_at' => 0]), 'occurred_at'];
        yield 'date sans fuseau' => [['occurred_at' => '2026-10-07T18:40:00.000'] + $ajout, 'occurred_at'];
        yield 'date impossible' => [['occurred_at' => '2026-02-30T18:40:00.000Z'] + $ajout, 'occurred_at'];
        yield 'bouteilles vides' => [['bottles' => []] + $ajout, 'bottles'];
        yield '101 bouteilles' => [
            ['bottles' => array_map(fn (int $n): array => ['client_ref' => $uuid(100 + $n)], range(1, 101))] + $ajout,
            'bottles',
        ];
        yield 'client_ref de bouteille invalide' => [['bottles' => [['client_ref' => 'X']]] + $ajout, 'bottles'];
        yield 'client_ref de bouteille répété' => [
            ['bottles' => [['client_ref' => $uuid(10)], ['client_ref' => $uuid(10)]]] + $ajout,
            'bottles',
        ];
        yield 'référence non textuelle' => [
            ['bottles' => [['client_ref' => $uuid(10), 'reference' => 7]]] + $ajout,
            'reference',
        ];
        yield 'fields absent' => [array_diff_key($ajout, ['fields' => 0]), 'fields'];
        yield 'type absent' => [['fields' => ['entry_date' => '2026-10', 'origin' => 'achetee']] + $ajout, 'type'];
        yield 'type inconnu' => [['fields' => ['type' => 'vert'] + $ajout['fields']] + $ajout, 'type'];
        yield 'entry_date absente' => [['fields' => ['type' => 'rouge', 'origin' => 'achetee']] + $ajout, 'entry_date'];
        yield 'origin absente' => [['fields' => ['type' => 'rouge', 'entry_date' => '2026-10']] + $ajout, 'origin'];
        yield 'millésime invalide' => [['fields' => ['vintage' => 99] + $ajout['fields']] + $ajout, 'vintage'];
        yield 'souvenir non booléen' => [['fields' => ['souvenir' => 1] + $ajout['fields']] + $ajout, 'souvenir'];
        yield 'location absente' => [array_diff_key($ajout, ['location' => 0]), 'location'];
        yield 'location inconnue' => [['location' => ['type' => 'cave']] + $ajout, 'location'];
        yield 'étagère sans id' => [['location' => ['type' => 'etagere']] + $ajout, 'location'];
        yield 'carton à id négatif' => [['location' => ['type' => 'carton', 'id' => -1]] + $ajout, 'location'];
        yield 'bottle absent' => [array_diff_key($deplacement, ['bottle' => 0]), 'bottle'];
        yield 'bottle invalide' => [['bottle' => 'X'] + $deplacement, 'bottle'];
        yield 'déplacement sans location' => [array_diff_key($deplacement, ['location' => 0]), 'location'];
        yield 'motif absent' => [array_diff_key($sortie, ['exit_reason' => 0]), 'exit_reason'];
        yield 'motif inconnu' => [['exit_reason' => 'vendue'] + $sortie, 'exit_reason'];
    }

    /** @param array<string, mixed> $mutation */
    #[DataProvider('mutationsMalFormees')]
    public function testMutationMalFormeeRejetee(array $mutation, string $champ): void
    {
        $resultats = $this->synchroniser([$mutation, $this->ajout(2, [[20, null]])]);

        self::assertSame(['rejected', 'applied'], array_column($resultats, 'status'));
        self::assertSame('VALIDATION_FAILED', $resultats[0]['error']['code']);
        self::assertStringContainsString($champ, $resultats[0]['error']['message']);
        self::assertSame(
            [self::uuid(20)],
            array_column($this->lignes('SELECT client_ref FROM bouteilles'), 'client_ref'),
        );
    }

    public function testClientRefDejaUtiliseParUneAutreMutation(): void
    {
        $this->synchroniser([
            $this->ajout(1, [[10, null]]),
            $this->sortie(2, 10, 'consommee', '2026-10-07T20:00:00.000Z'),
        ]);

        $resultats = $this->synchroniser([
            $this->ajout(3, [[10, null]]),
            $this->ajout(4, [[11, null], [10, null]]),
            $this->deplacement(2, 10, ['type' => 'hors_rangement'], '2026-10-07T21:00:00.000Z'),
        ]);

        self::assertSame(['rejected', 'rejected', 'rejected'], array_column($resultats, 'status'));
        self::assertSame(
            ['VALIDATION_FAILED', 'VALIDATION_FAILED', 'VALIDATION_FAILED'],
            array_column(array_column($resultats, 'error'), 'code'),
        );
        self::assertSame(1, (int) $this->valeur('SELECT COUNT(*) FROM bouteilles'));
    }

    /** @return iterable<string, array{mixed}> */
    public static function lotsMalFormes(): iterable
    {
        yield 'sans mutations' => [[]];
        yield 'mutations non liste' => [['mutations' => ['a' => 1]]];
        yield 'mutation non objet' => [['mutations' => ['texte']]];
        yield 'client_ref absent' => [['mutations' => [['kind' => 'add']]]];
        yield 'client_ref invalide' => [['mutations' => [['client_ref' => 'ABC']]]];
        yield 'client_ref en majuscules' => [
            ['mutations' => [['client_ref' => '7B0E0000-0000-4000-8000-000000000000']]],
        ];
    }

    #[DataProvider('lotsMalFormes')]
    public function testLotMalForme(mixed $corps): void
    {
        $reponse = $this->api('POST', '/api/sync', is_array($corps) ? $corps : null);

        self::assertSame(400, $reponse->getStatusCode());
        self::assertSame('VALIDATION_FAILED', $this->codeErreur($reponse));
    }

    public function testLotVideAccepte(): void
    {
        self::assertSame(['results' => []], $this->reussir('POST', '/api/sync', ['mutations' => []]));
    }

    public function testLotTropGros(): void
    {
        $mutations = array_map(
            fn (int $n): array => $this->sortie($n, 10, 'consommee', '2026-10-07T20:00:00.000Z'),
            range(1, 201),
        );

        $reponse = $this->api('POST', '/api/sync', ['mutations' => $mutations]);

        self::assertSame(413, $reponse->getStatusCode());
        self::assertSame('PAYLOAD_TOO_LARGE', $this->codeErreur($reponse));
        self::assertSame(
            200,
            $this->api('POST', '/api/sync', ['mutations' => array_slice($mutations, 0, 200)])->getStatusCode(),
        );
    }

    public function testDateAuFormatIsoSansMillisecondes(): void
    {
        $ajout = $this->ajout(1, [[10, null]]);
        $ajout['occurred_at'] = '2026-10-07T18:40:00Z';

        $this->synchroniser([$ajout]);

        self::assertSame('2026-10-07 18:40:00.000', $this->valeur('SELECT date_mouvement FROM mouvements'));
    }

    public function testIsolation(): void
    {
        $etagere = $this->etagere;
        $this->synchroniser([$this->ajout(1, [[10, null]])]);
        $bob = $this->connecter('bob@exemple.fr');

        $reponse = $this->api('POST', '/api/sync', ['mutations' => [
            $this->deplacement(2, 10, ['type' => 'hors_rangement'], '2026-10-07T19:00:00.000Z'),
            $this->sortie(3, 10, 'consommee', '2026-10-07T19:00:00.000Z'),
            $this->ajout(4, [[11, 'a0']]),
            $this->ajout(5, [[12, null]], ['type' => 'etagere', 'id' => $etagere]),
            // Même client_ref qu'une bouteille d'alice : aucun conflit entre comptes.
            $this->ajout(1, [[10, null]]),
        ]], $bob);

        $resultats = $this->json($reponse)['results'];
        self::assertIsArray($resultats);
        self::assertSame(
            ['rejected', 'rejected', 'rejected', 'applied', 'applied'],
            array_column($resultats, 'status'),
        );
        self::assertSame(
            ['BOTTLE_NOT_FOUND', 'BOTTLE_NOT_FOUND', 'REFERENCE_NOT_RESERVED'],
            array_column(array_column($resultats, 'error'), 'code'),
        );
        self::assertSame('LOCATION_NOT_FOUND', $resultats[3]['bottles'][0]['redirected']);
        self::assertSame(1, (int) $this->valeur(
            'SELECT COUNT(*) FROM mouvements WHERE user_id = ' . $this->idUtilisateur(),
        ));
    }

    public function testSansJeton(): void
    {
        $reponse = $this->appeler('POST', '/api/sync', ['mutations' => []]);

        self::assertSame(401, $reponse->getStatusCode());
    }

    /**
     * @param list<array<string, mixed>> $mutations
     * @return list<array<string, mixed>>
     */
    private function synchroniser(array $mutations): array
    {
        $resultats = $this->reussir('POST', '/api/sync', ['mutations' => $mutations])['results'];
        self::assertIsArray($resultats);

        /** @var list<array<string, mixed>> */
        return $resultats;
    }

    /**
     * @param list<array{int, ?string}> $bouteilles numéro du client_ref, référence
     * @param array<string, mixed> $location
     * @param array<string, mixed> $champs
     * @return array<string, mixed>
     */
    private function ajout(
        int $ref,
        array $bouteilles,
        array $location = ['type' => 'hors_rangement'],
        array $champs = [],
    ): array {
        return [
            'client_ref' => self::uuid($ref), 'schema_version' => 1, 'kind' => 'add',
            'occurred_at' => '2026-10-07T18:40:00.000Z',
            'bottles' => array_map(
                fn (array $b): array => ['client_ref' => self::uuid($b[0]), 'reference' => $b[1]],
                $bouteilles,
            ),
            'fields' => $champs + ['type' => 'rouge', 'entry_date' => '2026-10', 'origin' => 'achetee'],
            'location' => $location,
        ];
    }

    /**
     * @param array<string, mixed> $location
     * @return array<string, mixed>
     */
    private function deplacement(int $ref, int $bouteille, array $location, string $date): array
    {
        return [
            'client_ref' => self::uuid($ref), 'schema_version' => 1, 'kind' => 'move', 'occurred_at' => $date,
            'bottle' => self::uuid($bouteille), 'location' => $location,
        ];
    }

    /** @return array<string, mixed> */
    private function sortie(int $ref, int $bouteille, string $motif, string $date): array
    {
        return [
            'client_ref' => self::uuid($ref), 'schema_version' => 1, 'kind' => 'exit', 'occurred_at' => $date,
            'bottle' => self::uuid($bouteille), 'exit_reason' => $motif,
        ];
    }

    /** @return array<string, int> */
    private function idsParClientRef(): array
    {
        $lignes = $this->lignes('SELECT id, client_ref FROM bouteilles');

        return array_map('intval', array_column($lignes, 'id', 'client_ref'));
    }

    private function mouvement(string $clientRef): int
    {
        return (int) $this->valeur(sprintf('SELECT id FROM mouvements WHERE client_ref = \'%s\'', $clientRef));
    }

    private function armoire(): int
    {
        return (int) $this->valeur('SELECT armoire_id FROM etageres WHERE id = ' . $this->etagere);
    }
}
