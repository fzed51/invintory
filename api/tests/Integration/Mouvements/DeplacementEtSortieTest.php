<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Mouvements;

use CaveAVin\Tests\Support\MouvementsTestCase;

/**
 * Déplacement et sortie (CdC §2.4, §3.4, §3.5 ; contrat §10.2, §10.4) : horloge logique
 * (Arch §4.5), sortie terminale (P19), redirection vers hors rangement.
 */
final class DeplacementEtSortieTest extends MouvementsTestCase
{
    private int $etagere;
    private int $carton;
    private int $bouteille;

    protected function setUp(): void
    {
        parent::setUp();
        $this->etagere = $this->etageres($this->creerArmoire('Cave', [2]))[0];
        $this->carton = $this->creerCarton('Carton', 6);
        $this->bouteille = $this->ajouter(
            [['client_ref' => self::uuid(1), 'reference' => null]],
            emplacement: ['type' => 'etagere', 'id' => $this->etagere],
            date: '2026-10-01 10:00:00.000',
        )[0]['id'];
    }

    public function testDeplacer(): void
    {
        $resultat = $this->vers(['type' => 'carton', 'id' => $this->carton], '2026-10-02 08:00:00.500', 50);

        self::assertSame(['mouvement_id' => $resultat['mouvement_id'], 'redirection' => null], $resultat);
        self::assertSame([
            'statut' => 'en_cave', 'emplacement_type' => 'carton', 'etagere_id' => null, 'carton_id' => $this->carton,
            'date_dernier_mouvement_applique' => '2026-10-02 08:00:00.500',
        ], $this->etat($this->bouteille));
        self::assertSame([
            'type_mouvement' => 'deplacement', 'motif_sortie' => null, 'emplacement_avant_type' => 'etagere',
            'emplacement_avant_id' => $this->etagere, 'emplacement_apres_type' => 'carton',
            'emplacement_apres_id' => $this->carton, 'date_mouvement' => '2026-10-02 08:00:00.500',
            'client_ref' => self::uuid(50),
        ], $this->mouvementsDe($this->bouteille)[1]);
        self::assertSame($resultat['mouvement_id'], (int) $this->valeur('SELECT MAX(id) FROM mouvements'));
    }

    public function testVersHorsRangement(): void
    {
        $this->vers(['type' => 'hors_rangement'], '2026-10-02 08:00:00.000', 50);

        self::assertSame(
            ['hors_rangement', null, null],
            array_values(array_intersect_key(
                $this->etat($this->bouteille),
                array_flip(['emplacement_type', 'etagere_id', 'carton_id']),
            )),
        );
    }

    public function testUnDeplacementPlusAncienEstConserveSansChangerLEtat(): void
    {
        // Deux appareils hors ligne : le plus récent (carton) arrive avant le plus ancien.
        $this->vers(['type' => 'carton', 'id' => $this->carton], '2026-10-03 12:00:00.000', 51);
        $this->vers(['type' => 'hors_rangement'], '2026-10-02 12:00:00.000', 50);

        self::assertSame(
            ['carton', $this->carton, '2026-10-03 12:00:00.000'],
            [$this->etat($this->bouteille)['emplacement_type'], $this->etat($this->bouteille)['carton_id'],
                $this->etat($this->bouteille)['date_dernier_mouvement_applique']],
        );
        self::assertSame(
            ['entree', 'deplacement', 'deplacement'],
            array_column($this->mouvementsDe($this->bouteille), 'type_mouvement'),
        );
        self::assertSame(
            [self::uuid(51), self::uuid(50)],
            array_slice(array_column($this->mouvementsDe($this->bouteille), 'client_ref'), 1),
        );
    }

    public function testMemeDateQueLeDernierMouvementNonAppliquee(): void
    {
        $this->vers(['type' => 'hors_rangement'], '2026-10-01 10:00:00.000', 50);

        self::assertSame('etagere', $this->etat($this->bouteille)['emplacement_type']);
    }

    public function testVersUnEmplacementCompletRedirige(): void
    {
        $autre = $this->etageres($this->creerArmoire('Autre', [1]))[0];
        $this->insererBouteille('etagere', $autre);

        $resultat = $this->vers(['type' => 'etagere', 'id' => $autre], '2026-10-02 08:00:00.000', 50);

        self::assertSame('CAPACITY_EXCEEDED', $resultat['redirection']);
        self::assertSame('hors_rangement', $this->etat($this->bouteille)['emplacement_type']);
        self::assertSame(['hors_rangement', null], [
            $this->mouvementsDe($this->bouteille)[1]['emplacement_apres_type'],
            $this->mouvementsDe($this->bouteille)[1]['emplacement_apres_id'],
        ]);
    }

    public function testRangerDansLEmplacementDejaOccupeParLaBouteilleNeRedirigePas(): void
    {
        $this->insererBouteille('etagere', $this->etagere);

        $resultat = $this->vers(['type' => 'etagere', 'id' => $this->etagere], '2026-10-02 08:00:00.000', 50);

        self::assertNull($resultat['redirection']);
        self::assertSame('etagere', $this->etat($this->bouteille)['emplacement_type']);
    }

    public function testVersUnEmplacementDisparuRedirige(): void
    {
        $resultat = $this->vers(['type' => 'carton', 'id' => 999999], '2026-10-02 08:00:00.000', 50);

        self::assertSame('LOCATION_NOT_FOUND', $resultat['redirection']);
        self::assertSame('hors_rangement', $this->etat($this->bouteille)['emplacement_type']);
    }

    public function testBouteilleInconnue(): void
    {
        $date = '2026-10-02 08:00:00.000';
        $horsRangement = ['type' => 'hors_rangement'];
        $this->rejet('BOTTLE_NOT_FOUND', fn () => $this->deplacer(self::uuid(9), $horsRangement, $date, self::uuid(5)));
        $this->rejet('BOTTLE_NOT_FOUND', fn () => $this->sortir(self::uuid(9), 'consommee', $date, self::uuid(51)));
        self::assertSame(1, (int) $this->valeur('SELECT COUNT(*) FROM mouvements'));
    }

    public function testLaBouteilleDUnAutreCompteEstInconnue(): void
    {
        $this->connecter('bob@exemple.fr');
        $this->bouteille(['user_id' => $this->idUtilisateur('bob@exemple.fr'), 'client_ref' => self::uuid(7)]);

        $this->rejet(
            'BOTTLE_NOT_FOUND',
            fn () => $this->sortir(self::uuid(7), 'consommee', '2026-10-02 08:00:00.000', self::uuid(50)),
        );
    }

    public function testSortir(): void
    {
        $resultat = $this->sortie('consommee', '2026-10-05 20:00:00.000', 60);

        self::assertSame(['mouvement_id' => (int) $this->valeur('SELECT MAX(id) FROM mouvements')], $resultat);
        self::assertSame([
            'statut' => 'sortie', 'emplacement_type' => 'hors_rangement', 'etagere_id' => null, 'carton_id' => null,
            'date_dernier_mouvement_applique' => '2026-10-05 20:00:00.000',
        ], $this->etat($this->bouteille));
        self::assertSame([
            'type_mouvement' => 'sortie', 'motif_sortie' => 'consommee', 'emplacement_avant_type' => 'etagere',
            'emplacement_avant_id' => $this->etagere, 'emplacement_apres_type' => null, 'emplacement_apres_id' => null,
            'date_mouvement' => '2026-10-05 20:00:00.000', 'client_ref' => self::uuid(60),
        ], $this->mouvementsDe($this->bouteille)[1]);
        // L'alvéole est libérée.
        self::assertSame(0, $this->reussir('GET', '/api/cellar')['cabinets'][0]['shelves'][0]['occupied'] ?? null);
    }

    public function testUneSortiePlusAncienneEstQuandMemeAppliquee(): void
    {
        $this->vers(['type' => 'carton', 'id' => $this->carton], '2026-10-04 12:00:00.000', 50);

        $this->sortie('offerte', '2026-10-03 12:00:00.000', 60);

        self::assertSame([
            'statut' => 'sortie', 'emplacement_type' => 'hors_rangement', 'etagere_id' => null, 'carton_id' => null,
            'date_dernier_mouvement_applique' => '2026-10-04 12:00:00.000',
        ], $this->etat($this->bouteille));
        self::assertSame(['carton', $this->carton], [
            $this->mouvementsDe($this->bouteille)[2]['emplacement_avant_type'],
            $this->mouvementsDe($this->bouteille)[2]['emplacement_avant_id'],
        ]);
    }

    public function testUneBouteilleSortieNAcceptePlusDeMouvement(): void
    {
        $this->sortie('perdue_cassee', '2026-10-05 20:00:00.000', 60);

        $date = '2026-10-06 08:00:00.000';
        $this->rejet('BOTTLE_EXITED', fn () => $this->vers(['type' => 'hors_rangement'], $date, 61));
        $this->rejet('BOTTLE_EXITED', fn () => $this->sortie('consommee', $date, 62));
        self::assertSame(2, (int) $this->valeur('SELECT COUNT(*) FROM mouvements'));
        self::assertSame('2026-10-05 20:00:00.000', $this->etat($this->bouteille)['date_dernier_mouvement_applique']);
    }

    /**
     * Déplace la bouteille créée par setUp (client_ref uuid(1)).
     *
     * @param array{type: string, id?: int} $emplacement
     * @return array{mouvement_id: int, redirection: ?string}
     */
    private function vers(array $emplacement, string $date, int $ref): array
    {
        return $this->deplacer(self::uuid(1), $emplacement, $date, self::uuid($ref));
    }

    /** @return array{mouvement_id: int} */
    private function sortie(string $motif, string $date, int $ref): array
    {
        return $this->sortir(self::uuid(1), $motif, $date, self::uuid($ref));
    }
}
