<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Mouvements;

use CaveAVin\Tests\Support\MouvementsTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Entrée de bouteilles, unitaire ou en masse (CdC §3.3, contrat §10.1, §10.4) : N
 * bouteilles, un mouvement « entree » chacune, références réservées vérifiées (P1).
 */
final class AjoutTest extends MouvementsTestCase
{
    public function testAjoutEnMasse(): void
    {
        [$a0, $a1] = $this->reserver(2);
        $armoire = $this->creerArmoire('Cave du bas', [12]);
        $etagere = $this->etageres($armoire)[0];

        $resultats = $this->ajouter(
            [['client_ref' => self::uuid(1), 'reference' => $a0], ['client_ref' => self::uuid(2), 'reference' => $a1]],
            ['region' => 'Bordeaux', 'cepage' => 'Merlot', 'domaine' => 'Château Exemple', 'millesime' => 2018,
                'note' => 'Offert par Paul', 'souvenir' => true, 'date_entree' => '2026-09-01', 'origine' => 'offerte'],
            ['type' => 'etagere', 'id' => $etagere],
        );

        $ids = array_column($resultats, 'id');
        $emplacement = ['type' => 'etagere', 'id' => $etagere, 'armoire_id' => $armoire['id'],
            'libelle' => 'Cave du bas · Étagère 1'];
        self::assertSame([
            ['client_ref' => self::uuid(1), 'id' => $ids[0], 'reference' => 'a0', 'emplacement' => $emplacement,
                'redirection' => null],
            ['client_ref' => self::uuid(2), 'id' => $ids[1], 'reference' => 'a1', 'emplacement' => $emplacement,
                'redirection' => null],
        ], $resultats);
        $region = (int) $this->valeur("SELECT id FROM regions WHERE nom = 'Bordeaux'");
        $cepage = (int) $this->valeur("SELECT id FROM cepages WHERE nom = 'Merlot'");
        foreach ([[$ids[0], 'a0', self::uuid(1)], [$ids[1], 'a1', self::uuid(2)]] as [$id, $reference, $ref]) {
            self::assertSame([
                'reference' => $reference, 'client_ref' => $ref, 'lot_ajout_id' => self::LOT, 'type' => 'rouge',
                'region_id' => $region, 'cepage_id' => $cepage, 'domaine' => 'Château Exemple', 'millesime' => 2018,
                'date_entree' => '2026-09-01', 'origine' => 'offerte', 'note' => 'Offert par Paul',
                'tag_souvenir' => 1, 'statut' => 'en_cave', 'emplacement_type' => 'etagere', 'etagere_id' => $etagere,
                'carton_id' => null, 'date_limite_consommation' => '2026-12-31',
                'date_dernier_mouvement_applique' => '2026-10-07 18:40:00.000',
            ], $this->ligne(
                'SELECT reference, client_ref, lot_ajout_id, type, region_id, cepage_id, domaine, millesime,'
                . ' date_entree, origine, note, tag_souvenir, statut, emplacement_type, etagere_id, carton_id,'
                . ' date_limite_consommation, date_dernier_mouvement_applique FROM bouteilles WHERE id = ' . $id
            ));
            self::assertSame([[
                'type_mouvement' => 'entree', 'motif_sortie' => null, 'emplacement_avant_type' => null,
                'emplacement_avant_id' => null, 'emplacement_apres_type' => 'etagere',
                'emplacement_apres_id' => $etagere, 'date_mouvement' => '2026-10-07 18:40:00.000', 'client_ref' => null,
            ]], $this->mouvementsDe($id));
        }
    }

    public function testSansReferenceLeServeurEnGenere(): void
    {
        $this->reserver(3);

        $resultats = $this->ajouter([
            ['client_ref' => self::uuid(1), 'reference' => null],
            ['client_ref' => self::uuid(2), 'reference' => 'a1'],
            ['client_ref' => self::uuid(3), 'reference' => null],
        ]);

        self::assertSame(['a3', 'a1', 'a4'], array_column($resultats, 'reference'));
        self::assertSame(5, (int) $this->valeur('SELECT dernier_index FROM reference_sequences'));
    }

    public function testDateLimiteDeLaCategorie(): void
    {
        $this->pdo->prepare(
            "INSERT INTO categories (user_id, type, region_id, duree_garde_annees) VALUES (?, 'blanc', NULL, 6)"
        )->execute([$this->idUtilisateur()]);

        $this->ajouter([['client_ref' => self::uuid(1), 'reference' => null]], ['type' => 'blanc']);

        self::assertSame('2032-10-01', $this->valeur('SELECT date_limite_consommation FROM bouteilles'));
    }

    /** @return iterable<string, array{string}> */
    public static function referencesNonReservees(): iterable
    {
        yield 'pas encore distribuée' => ['a2'];
        yield 'longueur pas encore atteinte' => ['a00'];
        yield 'mal formée' => ['A1'];
        yield 'avec o' => ['ao'];
    }

    #[DataProvider('referencesNonReservees')]
    public function testReferenceNonReservee(string $reference): void
    {
        $this->reserver(2);

        $message = $this->rejet('REFERENCE_NOT_RESERVED', fn () => $this->ajouter([
            ['client_ref' => self::uuid(1), 'reference' => 'a0'],
            ['client_ref' => self::uuid(2), 'reference' => $reference],
        ], ['region' => 'Bordeaux']));

        self::assertStringContainsString($reference, $message);
        self::assertRienNEstEcrit();
    }

    public function testReferenceDejaPortee(): void
    {
        $this->reserver(2);
        $this->bouteille(['reference' => 'a0']);

        $this->rejet(
            'REFERENCE_TAKEN',
            fn () => $this->ajouter([['client_ref' => self::uuid(1), 'reference' => 'a0']]),
        );
    }

    public function testReferenceEnDoubleDansLeMemeAjout(): void
    {
        $this->reserver(2);

        $this->rejet('REFERENCE_TAKEN', fn () => $this->ajouter([
            ['client_ref' => self::uuid(1), 'reference' => 'a1'],
            ['client_ref' => self::uuid(2), 'reference' => 'a1'],
        ], ['region' => 'Bordeaux']));
        self::assertRienNEstEcrit();
    }

    public function testLaReferenceDUnAutreCompteNeGenePas(): void
    {
        $this->reserver(1);
        $this->connecter('bob@exemple.fr');
        $this->bouteille(['user_id' => $this->idUtilisateur('bob@exemple.fr'), 'reference' => 'a0']);

        self::assertSame('a0', $this->ajouter([['client_ref' => self::uuid(1), 'reference' => 'a0']])[0]['reference']);
    }

    public function testLaPlaceRestanteEstRemplieAvantLaRedirection(): void
    {
        $etagere = $this->etageres($this->creerArmoire('Cave', [3]))[0];
        $this->insererBouteille('etagere', $etagere);
        $this->insererBouteille('hors_rangement', statut: 'sortie');

        $resultats = $this->ajouter(
            array_map(fn (int $n): array => ['client_ref' => self::uuid($n), 'reference' => null], range(1, 4)),
            emplacement: ['type' => 'etagere', 'id' => $etagere],
        );

        self::assertSame(
            [['etagere', null], ['etagere', null], ['hors_rangement', 'CAPACITY_EXCEEDED'],
                ['hors_rangement', 'CAPACITY_EXCEEDED']],
            array_map(fn (array $r): array => [$r['emplacement']['type'], $r['redirection']], $resultats),
        );
        self::assertSame(
            ['hors_rangement'],
            array_column($this->mouvementsDe($resultats[3]['id']), 'emplacement_apres_type'),
        );
        self::assertSame(
            ['emplacement_type' => 'hors_rangement', 'etagere_id' => null],
            $this->ligne('SELECT emplacement_type, etagere_id FROM bouteilles WHERE id = ' . $resultats[3]['id']),
        );
    }

    public function testDansUnCarton(): void
    {
        $carton = $this->creerCarton('Carton Loire', 6);

        $resultat = $this->ajouter([['client_ref' => self::uuid(1), 'reference' => null]], emplacement: [
            'type' => 'carton', 'id' => $carton,
        ])[0];

        self::assertSame(
            [['type' => 'carton', 'id' => $carton, 'libelle' => 'Carton Loire'], null],
            [$resultat['emplacement'], $resultat['redirection']],
        );
    }

    /** @return iterable<string, array{string}> */
    public static function emplacementsDisparus(): iterable
    {
        yield 'étagère' => ['etagere'];
        yield 'carton' => ['carton'];
    }

    #[DataProvider('emplacementsDisparus')]
    public function testEmplacementDisparu(string $type): void
    {
        $resultat = $this->ajouter(
            [['client_ref' => self::uuid(1), 'reference' => null]],
            emplacement: ['type' => $type, 'id' => 999999],
        )[0];

        self::assertSame(
            [['type' => 'hors_rangement'], 'LOCATION_NOT_FOUND'],
            [$resultat['emplacement'], $resultat['redirection']],
        );
    }

    public function testLEmplacementDUnAutreCompteEstIntrouvable(): void
    {
        $bob = $this->connecter('bob@exemple.fr');
        $carton = $this->json($this->api('POST', '/api/boxes', ['label' => 'De Bob', 'capacity' => 6], $bob))['id'];
        self::assertIsInt($carton);

        $resultat = $this->ajouter(
            [['client_ref' => self::uuid(1), 'reference' => null]],
            emplacement: ['type' => 'carton', 'id' => $carton],
        )[0];

        self::assertSame('LOCATION_NOT_FOUND', $resultat['redirection']);
        self::assertSame(0, (int) $this->valeur("SELECT COUNT(*) FROM bouteilles WHERE carton_id IS NOT NULL"));
    }

    private function assertRienNEstEcrit(): void
    {
        self::assertSame(0, (int) $this->valeur(
            'SELECT (SELECT COUNT(*) FROM bouteilles) + (SELECT COUNT(*) FROM mouvements)'
            . ' + (SELECT COUNT(*) FROM regions)'
        ));
    }
}
