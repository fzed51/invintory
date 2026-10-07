<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Bouteilles;

use CaveAVin\Tests\Support\CaveTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Édition de la fiche (contrat §7.3) : champs facultatifs, régions et cépages créés à la
 * volée (§6), date limite recalculée à chaque édition (P17, §7.1).
 */
final class EditionBouteilleTest extends CaveTestCase
{
    public function testModifierTousLesChamps(): void
    {
        $id = $this->bouteille(['reference' => 'a7']);

        $bouteille = $this->reussir('PATCH', '/api/bottles/' . $id, [
            'type' => 'blanc',
            'region' => 'Loire',
            'grape' => 'Chenin',
            'domain' => 'Domaine Huet',
            'vintage' => 2019,
            'entry_date' => '2024-03',
            'origin' => 'offerte',
            'note' => 'Pour les 40 ans',
            'souvenir' => true,
        ]);

        $region = (int) $this->valeur("SELECT id FROM regions WHERE nom = 'Loire'");
        $cepage = (int) $this->valeur("SELECT id FROM cepages WHERE nom = 'Chenin'");
        self::assertSame([
            'type' => 'blanc',
            'region' => ['id' => $region, 'name' => 'Loire'],
            'grape' => ['id' => $cepage, 'name' => 'Chenin'],
            'domain' => 'Domaine Huet',
            'vintage' => 2019,
            'entry_date' => '2024-03',
            'origin' => 'offerte',
            'note' => 'Pour les 40 ans',
            'souvenir' => true,
            'drink_by' => '2023-12-31',
            'age_year' => 2019,
        ], array_intersect_key($bouteille, array_flip([
            'type', 'region', 'grape', 'domain', 'vintage', 'entry_date', 'origin', 'note', 'souvenir',
            'drink_by', 'age_year',
        ])));
        self::assertSame([$id, 'a7'], [$bouteille['id'], $bouteille['reference']]);
        self::assertArrayNotHasKey('movements', $bouteille);
        self::assertSame(
            ['user_id' => $this->idUtilisateur(), 'date_entree' => '2024-03-01'],
            $this->ligne('SELECT r.user_id, b.date_entree FROM bouteilles b JOIN regions r ON r.id = b.region_id'),
        );
    }

    public function testLesChampsAbsentsNeChangentPas(): void
    {
        $region = $this->referentiel('regions', 'Bordeaux');
        $id = $this->bouteille(['region_id' => $region, 'domaine' => 'Château A', 'millesime' => 2015,
            'note' => 'Note', 'tag_souvenir' => 1]);

        $bouteille = $this->reussir('PATCH', '/api/bottles/' . $id, ['origin' => 'offerte']);

        self::assertSame(
            [['id' => $region, 'name' => 'Bordeaux'], 'Château A', 2015, 'Note', true, 'offerte'],
            [$bouteille['region'], $bouteille['domain'], $bouteille['vintage'], $bouteille['note'],
                $bouteille['souvenir'], $bouteille['origin']],
        );
    }

    public function testNullEffaceLesChampsFacultatifs(): void
    {
        $id = $this->bouteille([
            'region_id' => $this->referentiel('regions', 'Bordeaux'),
            'cepage_id' => $this->referentiel('cepages', 'Merlot'),
            'domaine' => 'Château A',
            'millesime' => 2015,
            'note' => 'Note',
        ]);

        $bouteille = $this->reussir('PATCH', '/api/bottles/' . $id, [
            'region' => null, 'grape' => null, 'domain' => null, 'vintage' => null, 'note' => null,
        ]);

        self::assertSame(
            [null, null, null, null, null, 2026],
            [$bouteille['region'], $bouteille['grape'], $bouteille['domain'], $bouteille['vintage'],
                $bouteille['note'], $bouteille['age_year']],
        );
        // Le référentiel garde ses valeurs.
        self::assertSame(1, (int) $this->valeur('SELECT COUNT(*) FROM regions'));
    }

    public function testUneRegionExistanteEstReutiliseeSansDistinctionDeCasse(): void
    {
        $region = $this->referentiel('regions', 'Bordeaux');
        $id = $this->bouteille();

        $bouteille = $this->reussir('PATCH', '/api/bottles/' . $id, ['region' => 'BORDEAUX']);

        self::assertSame(['id' => $region, 'name' => 'Bordeaux'], $bouteille['region']);
        self::assertSame(1, (int) $this->valeur('SELECT COUNT(*) FROM regions'));
    }

    public function testLaRegionDUnAutreCompteNEstPasReutilisee(): void
    {
        $this->connecter('bob@exemple.fr');
        $deBob = $this->referentiel('regions', 'Bordeaux', 'bob@exemple.fr');
        $id = $this->bouteille();

        $bouteille = $this->reussir('PATCH', '/api/bottles/' . $id, ['region' => 'Bordeaux']);

        self::assertIsArray($bouteille['region']);
        self::assertNotSame($deBob, $bouteille['region']['id']);
        self::assertSame(2, (int) $this->valeur('SELECT COUNT(*) FROM regions'));
    }

    /** @return iterable<string, array{array<string, mixed>, string}> */
    public static function datesLimites(): iterable
    {
        yield 'défaut du type, millésime' => [['vintage' => 2018], '2026-12-31'];
        yield 'défaut du type, sans millésime' => [['vintage' => null, 'entry_date' => '2025-06'], '2033-06-01'];
        yield 'générique du type' => [['type' => 'blanc', 'vintage' => 2020], '2026-12-31'];
        yield 'spécifique type + région' => [['type' => 'blanc', 'vintage' => 2020, 'region' => 'Loire'], '2035-12-31'];
        yield 'spécifique sans garde : générique' => [
            ['type' => 'blanc', 'vintage' => 2020, 'region' => 'Alsace'],
            '2026-12-31',
        ];
        yield 'générique sans garde : défaut' => [['type' => 'rose', 'vintage' => 2024], '2026-12-31'];
        yield 'spécifique d’un autre type' => [
            ['type' => 'rouge', 'vintage' => 2020, 'region' => 'Loire'],
            '2028-12-31',
        ];
    }

    /** @param array<string, mixed> $modifications */
    #[DataProvider('datesLimites')]
    public function testDateLimiteRecalculee(array $modifications, string $attendue): void
    {
        $utilisateur = $this->idUtilisateur();
        $loire = $this->referentiel('regions', 'Loire');
        $alsace = $this->referentiel('regions', 'Alsace');
        $categorie = $this->pdo->prepare(
            'INSERT INTO categories (user_id, type, region_id, duree_garde_annees) VALUES (?, ?, ?, ?)'
        );
        $categorie->execute([$utilisateur, 'blanc', null, 6]);
        $categorie->execute([$utilisateur, 'blanc', $loire, 15]);
        $categorie->execute([$utilisateur, 'blanc', $alsace, null]);
        $categorie->execute([$utilisateur, 'rose', null, null]);
        $id = $this->bouteille(['millesime' => 1990, 'date_limite_consommation' => '1998-12-31']);

        $bouteille = $this->reussir('PATCH', '/api/bottles/' . $id, $modifications);

        self::assertSame($attendue, $bouteille['drink_by']);
        self::assertSame($attendue, $this->valeur('SELECT date_limite_consommation FROM bouteilles'));
    }

    public function testUneBouteilleSortieResteEditable(): void
    {
        $id = $this->bouteille(['statut' => 'sortie']);

        $bouteille = $this->reussir('PATCH', '/api/bottles/' . $id, ['note' => 'Bue au mariage']);

        self::assertSame(['Bue au mariage', 'sortie'], [$bouteille['note'], $bouteille['status']]);
    }

    public function testLEmplacementEtLeStatutNeChangentPasParLaFiche(): void
    {
        $id = $this->bouteille();

        $bouteille = $this->reussir('PATCH', '/api/bottles/' . $id, [
            'status' => 'sortie', 'location' => ['type' => 'carton', 'id' => 1], 'reference' => 'zz',
        ]);

        self::assertSame(['en_cave', ['type' => 'hors_rangement']], [$bouteille['status'], $bouteille['location']]);
        self::assertNotSame('zz', $bouteille['reference']);
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function corpsInvalides(): iterable
    {
        yield 'type inconnu' => [['type' => 'bleu']];
        yield 'type nul' => [['type' => null]];
        yield 'région vide' => [['region' => '']];
        yield 'région trop longue' => [['region' => str_repeat('a', 151)]];
        yield 'cépage non textuel' => [['grape' => 5]];
        yield 'domaine trop long' => [['domain' => str_repeat('a', 256)]];
        yield 'domaine vide' => [['domain' => '']];
        yield 'millésime textuel' => [['vintage' => '2018']];
        yield 'millésime trop ancien' => [['vintage' => 999]];
        yield 'millésime trop grand' => [['vintage' => 10000]];
        yield 'date d’entrée complète' => [['entry_date' => '2024-03-01']];
        yield 'mois 13' => [['entry_date' => '2024-13']];
        yield 'mois 00' => [['entry_date' => '2024-00']];
        yield 'date d’entrée nulle' => [['entry_date' => null]];
        yield 'origine inconnue' => [['origin' => 'volee']];
        yield 'note non textuelle' => [['note' => 12]];
        yield 'souvenir non booléen' => [['souvenir' => 1]];
        yield 'souvenir nul' => [['souvenir' => null]];
    }

    /** @param array<string, mixed> $corps */
    #[DataProvider('corpsInvalides')]
    public function testCorpsInvalide(array $corps): void
    {
        $id = $this->bouteille(['note' => 'Inchangée']);

        $reponse = $this->api('PATCH', '/api/bottles/' . $id, $corps + ['note' => 'Modifiée']);

        self::assertSame(400, $reponse->getStatusCode());
        self::assertSame('VALIDATION_FAILED', $this->codeErreur($reponse));
        self::assertSame('Inchangée', $this->valeur('SELECT note FROM bouteilles'));
        self::assertSame(
            0,
            (int) $this->valeur('SELECT (SELECT COUNT(*) FROM regions) + (SELECT COUNT(*) FROM cepages)'),
        );
    }

    public function testBouteilleDUnAutreCompte(): void
    {
        $this->connecter('bob@exemple.fr');
        $deBob = $this->bouteille(['user_id' => $this->idUtilisateur('bob@exemple.fr'), 'note' => 'De Bob']);

        $reponse = $this->api('PATCH', '/api/bottles/' . $deBob, ['note' => 'Prise', 'region' => 'Bordeaux']);

        self::assertSame(404, $reponse->getStatusCode());
        self::assertSame('NOT_FOUND', $this->codeErreur($reponse));
        self::assertSame('De Bob', $this->valeur('SELECT note FROM bouteilles'));
        self::assertSame(0, (int) $this->valeur('SELECT COUNT(*) FROM regions'));
    }
}
