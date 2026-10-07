<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Bouteilles;

use CaveAVin\Tests\Support\CaveTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Référentiels régions et cépages (contrat §6) : sans q, tout le référentiel ; avec q,
 * « contient », insensible à la casse, sensible aux accents ; tri alphabétique.
 */
final class ReferentielsTest extends CaveTestCase
{
    /** @return iterable<string, array{string, string, string}> */
    public static function referentiels(): iterable
    {
        yield 'régions' => ['regions', '/api/regions', 'regions'];
        yield 'cépages' => ['cepages', '/api/grapes', 'grapes'];
    }

    #[DataProvider('referentiels')]
    public function testReferentielVide(string $table, string $chemin, string $cle): void
    {
        $reponse = $this->api('GET', $chemin);

        self::assertSame(200, $reponse->getStatusCode());
        self::assertSame('no-store', $reponse->getHeaderLine('Cache-Control'));
        self::assertSame([$cle => []], $this->json($reponse));
    }

    #[DataProvider('referentiels')]
    public function testToutLeReferentielParOrdreAlphabetique(string $table, string $chemin, string $cle): void
    {
        $loire = $this->referentiel($table, 'Loire');
        $bordeaux = $this->referentiel($table, 'Bordeaux');
        $alsace = $this->referentiel($table, 'Alsace');
        $this->connecter('bob@exemple.fr');
        $this->referentiel($table, 'Bourgogne', 'bob@exemple.fr');

        self::assertSame([$cle => [
            ['id' => $alsace, 'name' => 'Alsace'],
            ['id' => $bordeaux, 'name' => 'Bordeaux'],
            ['id' => $loire, 'name' => 'Loire'],
        ]], $this->reussir('GET', $chemin));
    }

    /** @return iterable<string, array{string, list<string>}> */
    public static function recherches(): iterable
    {
        yield 'contient' => ['or', ['Bordeaux', 'Côtes du Nord']];
        yield 'insensible à la casse' => ['BOR', ['Bordeaux']];
        yield 'sensible aux accents' => ['rhone', ['Rhone sans accent']];
        yield 'accentué' => ['rhône', ['Rhône']];
        yield 'joker % pris littéralement' => ['%', ['100 % Syrah']];
        yield 'joker _ pris littéralement' => ['_', ['Clos_A']];
        yield 'aucun résultat' => ['zzz', []];
    }

    /** @param list<string> $attendus */
    #[DataProvider('recherches')]
    public function testRecherche(string $q, array $attendus): void
    {
        foreach (['Bordeaux', 'Rhône', 'Rhone sans accent', 'Côtes du Nord', '100 % Syrah', 'Clos_A'] as $nom) {
            $this->referentiel('regions', $nom);
        }

        $regions = $this->reussir('GET', '/api/regions?q=' . rawurlencode($q))['regions'];

        self::assertIsArray($regions);
        self::assertSame($attendus, array_column($regions, 'name'));
    }

    #[DataProvider('referentiels')]
    public function testQEnTableauRefuse(string $table, string $chemin, string $cle): void
    {
        $reponse = $this->api('GET', $chemin . '?q[]=a');

        self::assertSame(400, $reponse->getStatusCode());
        self::assertSame('VALIDATION_FAILED', $this->codeErreur($reponse));
    }
}
