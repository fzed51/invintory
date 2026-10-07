<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Bouteilles;

use CaveAVin\Tests\Support\CaveTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/** Lecture des bouteilles (contrat §7.1, §7.2, §8) : représentation, filtres, tris, fiche. */
final class LectureBouteillesTest extends CaveTestCase
{
    /** 2026-10-07 18:42:05 UTC. */
    private const MOMENT = 1791398525;

    public function testRepresentationComplete(): void
    {
        $armoire = $this->creerArmoire('Cave du bas', [12]);
        $etagere = $this->etageres($armoire)[0];
        $region = $this->referentiel('regions', 'Bordeaux');
        $id = $this->bouteille([
            'reference' => 'a7',
            'client_ref' => '7b0e3c1a-0000-4000-8000-000000000001',
            'region_id' => $region,
            'domaine' => 'Château Exemple',
            'millesime' => 2018,
            'date_entree' => '2026-10-01',
            'origine' => 'achetee',
            'note' => 'Offert par Paul',
            'emplacement_type' => 'etagere',
            'etagere_id' => $etagere,
            'date_limite_consommation' => '2026-12-31',
            'lot_ajout_id' => '1f3c0000-0000-4000-8000-000000000002',
            'photo_path' => '1/a7.jpg',
            'created_at' => '2026-10-07 18:42:05',
            'updated_at' => '2026-10-07 18:42:06',
        ]);

        $reponse = $this->api('GET', '/api/bottles');

        self::assertSame(200, $reponse->getStatusCode());
        self::assertSame('no-store', $reponse->getHeaderLine('Cache-Control'));
        self::assertSame(['bottles' => [[
            'id' => $id,
            'client_ref' => '7b0e3c1a-0000-4000-8000-000000000001',
            'reference' => 'a7',
            'type' => 'rouge',
            'region' => ['id' => $region, 'name' => 'Bordeaux'],
            'grape' => null,
            'domain' => 'Château Exemple',
            'vintage' => 2018,
            'entry_date' => '2026-10',
            'origin' => 'achetee',
            'note' => 'Offert par Paul',
            'souvenir' => false,
            'location' => [
                'type' => 'etagere',
                'id' => $etagere,
                'cabinet_id' => $armoire['id'],
                'label' => 'Cave du bas · Étagère 1',
            ],
            'status' => 'en_cave',
            'drink_by' => '2026-12-31',
            'urgent' => false,
            'age_year' => 2018,
            'batch_id' => '1f3c0000-0000-4000-8000-000000000002',
            'has_photo' => true,
            'created_at' => '2026-10-07T18:42:05.000Z',
            'updated_at' => '2026-10-07T18:42:06.000Z',
        ]]], $this->json($reponse));
    }

    public function testRepresentationMinimale(): void
    {
        $carton = $this->creerCarton('Carton Loire', 6);
        $cepage = $this->referentiel('cepages', 'Chenin');
        $this->bouteille([
            'type' => 'blanc',
            'cepage_id' => $cepage,
            'date_entree' => '2025-03-01',
            'origine' => 'offerte',
            'tag_souvenir' => 1,
            'emplacement_type' => 'carton',
            'carton_id' => $carton,
        ]);
        $this->bouteille();

        $bouteilles = $this->reussir('GET', '/api/bottles')['bottles'];

        self::assertIsArray($bouteilles);
        $champs = ['client_ref', 'region', 'grape', 'domain', 'vintage', 'entry_date', 'origin', 'note', 'souvenir',
            'location', 'drink_by', 'age_year', 'batch_id', 'has_photo'];
        self::assertSame([
            [
                'client_ref' => null, 'region' => null, 'grape' => ['id' => $cepage, 'name' => 'Chenin'],
                'domain' => null,
                'vintage' => null, 'entry_date' => '2025-03', 'origin' => 'offerte', 'note' => null,
                'souvenir' => true, 'location' => ['type' => 'carton', 'id' => $carton, 'label' => 'Carton Loire'],
                'drink_by' => null, 'age_year' => 2025, 'batch_id' => null, 'has_photo' => false,
            ],
            [
                'client_ref' => null, 'region' => null, 'grape' => null, 'domain' => null, 'vintage' => null,
                'entry_date' => '2026-10', 'origin' => 'achetee', 'note' => null, 'souvenir' => false,
                'location' => ['type' => 'hors_rangement'], 'drink_by' => null, 'age_year' => 2026,
                'batch_id' => null, 'has_photo' => false,
            ],
        ], array_map(fn (array $b): array => array_intersect_key($b, array_flip($champs)), $bouteilles));
    }

    /** @return iterable<string, array{string, bool}> */
    public static function urgences(): iterable
    {
        yield 'dépassée hier' => ['2026-10-06', true];
        yield 'limite aujourd’hui' => ['2026-10-07', false];
        yield 'à venir' => ['2027-01-01', false];
    }

    #[DataProvider('urgences')]
    public function testUrgente(string $dateLimite, bool $urgente): void
    {
        $this->bouteille(['date_limite_consommation' => $dateLimite]);
        $this->maintenant = self::MOMENT;

        self::assertSame($urgente, $this->reussir('GET', '/api/bottles')['bottles'][0]['urgent'] ?? null);
    }

    public function testTriParDefautDansLOrdreDeGeneration(): void
    {
        foreach (['a00', 'b0', 'a1', 'zz'] as $reference) {
            $this->bouteille(['reference' => $reference]);
        }

        self::assertSame(['a1', 'b0', 'zz', 'a00'], $this->references(''));
    }

    public function testFiltres(): void
    {
        $a = $this->creerArmoire('A', [6]);
        $b = $this->creerArmoire('B', [6]);
        $carton = $this->creerCarton('C', 6);
        $bordeaux = $this->referentiel('regions', 'Bordeaux');
        $loire = $this->referentiel('regions', 'Loire');
        $merlot = $this->referentiel('cepages', 'Merlot');
        $this->bouteille(['reference' => 'a1', 'emplacement_type' => 'etagere', 'etagere_id' => $this->etageres($a)[0],
            'region_id' => $bordeaux, 'cepage_id' => $merlot]);
        $this->bouteille(['reference' => 'a2', 'type' => 'blanc', 'emplacement_type' => 'etagere',
            'etagere_id' => $this->etageres($b)[0]]);
        $this->bouteille(['reference' => 'a3', 'emplacement_type' => 'carton', 'carton_id' => $carton,
            'region_id' => $loire]);
        $this->bouteille(['reference' => 'a4', 'type' => 'rose']);
        $this->bouteille(['reference' => 'a5', 'statut' => 'sortie']);

        self::assertSame(['a1', 'a2', 'a3', 'a4'], $this->references(''));
        self::assertSame(['a5'], $this->references('status=sortie'));
        self::assertSame(['a1', 'a2', 'a3', 'a4', 'a5'], $this->references('status=all'));
        self::assertSame(['a4'], $this->references('location=hors_rangement'));
        self::assertSame(['a1'], $this->references('location=etagere:' . $this->etageres($a)[0]));
        self::assertSame(['a3'], $this->references('location=carton:' . $carton));
        self::assertSame(['a2'], $this->references('location=cabinet:' . $b['id']));
        self::assertSame(['a1', 'a3'], $this->references('type=rouge'));
        self::assertSame(['a1'], $this->references('region_id=' . $bordeaux));
        self::assertSame(['a1'], $this->references('grape_id=' . $merlot));
        self::assertSame(['a3'], $this->references('type=rouge&region_id=' . $loire));
        self::assertSame(['a5'], $this->references('type=rouge&status=sortie'));
        self::assertSame(['a1', 'a2'], $this->references('limit=2'));
        self::assertSame([], $this->references('location=carton:999999'));
    }

    public function testTriADoireEnPriorite(): void
    {
        $this->bouteille(['reference' => 'a1', 'date_limite_consommation' => '2030-12-31', 'millesime' => 2020]);
        $this->bouteille(['reference' => 'a2', 'date_limite_consommation' => '2020-12-31', 'millesime' => 2010]);
        $this->bouteille(['reference' => 'a3', 'date_limite_consommation' => '2026-12-31', 'millesime' => 2019]);
        $this->bouteille(['reference' => 'a4', 'date_limite_consommation' => '2026-12-31', 'millesime' => 2015]);
        $this->bouteille(['reference' => 'a5', 'date_limite_consommation' => '2026-12-31', 'millesime' => 2015]);

        self::assertSame(['a2', 'a4', 'a5', 'a3', 'a1'], $this->references('sort=priority'));
        self::assertSame(['a2', 'a4'], $this->references('sort=priority&limit=2'));
    }

    public function testTriParAge(): void
    {
        $this->bouteille(['reference' => 'a1', 'millesime' => 2020]);
        $this->bouteille(['reference' => 'a2', 'date_entree' => '2012-05-01']);
        $this->bouteille(['reference' => 'a3', 'millesime' => 2005]);
        $this->bouteille(['reference' => 'a4', 'millesime' => 2012]);

        self::assertSame(['a3', 'a2', 'a4', 'a1'], $this->references('sort=age'));
    }

    /** @return iterable<string, array{string}> */
    public static function parametresInvalides(): iterable
    {
        yield 'statut inconnu' => ['status=bue'];
        yield 'emplacement sans id' => ['location=etagere'];
        yield 'emplacement à id textuel' => ['location=etagere:x'];
        yield 'type d’emplacement inconnu' => ['location=placard:1'];
        yield 'type inconnu' => ['type=bleu'];
        yield 'région nulle' => ['region_id=0'];
        yield 'cépage textuel' => ['grape_id=abc'];
        yield 'tri inconnu' => ['sort=prix'];
        yield 'limite nulle' => ['limit=0'];
        yield 'filtre en tableau' => ['type[]=rouge'];
    }

    #[DataProvider('parametresInvalides')]
    public function testParametreInvalide(string $parametres): void
    {
        $reponse = $this->api('GET', '/api/bottles?' . $parametres);

        self::assertSame(400, $reponse->getStatusCode());
        self::assertSame('VALIDATION_FAILED', $this->codeErreur($reponse));
    }

    public function testFicheAvecSesMouvements(): void
    {
        $armoire = $this->creerArmoire('Cave', [6]);
        $etagere = $this->etageres($armoire)[0];
        $id = $this->bouteille([
            'reference' => 'a7',
            'statut' => 'sortie',
            'date_dernier_mouvement_applique' => '2026-10-05 20:00:00.000',
        ]);
        $mouvement = function (array $colonnes) use ($id): int {
            $colonnes += ['bouteille_id' => $id, 'user_id' => $this->idUtilisateur(), 'client_ref' => null];
            $this->pdo->prepare(sprintf(
                'INSERT INTO mouvements (%s) VALUES (%s)',
                implode(', ', array_keys($colonnes)),
                implode(', ', array_fill(0, count($colonnes), '?')),
            ))->execute(array_values($colonnes));

            return (int) $this->pdo->lastInsertId();
        };
        // Insérés dans le désordre : la fiche les rend du plus ancien au plus récent.
        $sortie = $mouvement(['type_mouvement' => 'sortie', 'motif_sortie' => 'consommee',
            'emplacement_avant_type' => 'hors_rangement', 'date_mouvement' => '2026-10-05 20:00:00.000']);
        $entree = $mouvement(['type_mouvement' => 'entree', 'emplacement_apres_type' => 'carton',
            'emplacement_apres_id' => 999999, 'date_mouvement' => '2026-10-01 10:00:00.123',
            'client_ref' => 'c41a0000-0000-4000-8000-000000000003']);
        $rangement = $mouvement(['type_mouvement' => 'deplacement', 'emplacement_avant_type' => 'carton',
            'emplacement_avant_id' => 999999, 'emplacement_apres_type' => 'etagere',
            'emplacement_apres_id' => $etagere, 'date_mouvement' => '2026-10-02 08:00:00.000']);
        $repas = $mouvement(['type_mouvement' => 'deplacement', 'emplacement_avant_type' => 'etagere',
            'emplacement_avant_id' => $etagere, 'emplacement_apres_type' => 'hors_rangement',
            'date_mouvement' => '2026-10-05 19:00:00.000']);

        $fiche = $this->reussir('GET', '/api/bottles/' . $id);

        $supprime = ['type' => 'carton', 'id' => 999999, 'label' => 'Emplacement supprimé'];
        $etagereActuelle = ['type' => 'etagere', 'id' => $etagere, 'cabinet_id' => $armoire['id'],
            'label' => 'Cave · Étagère 1'];
        self::assertSame(['a7', 'sortie'], [$fiche['reference'], $fiche['status']]);
        self::assertSame([
            ['id' => $entree, 'client_ref' => 'c41a0000-0000-4000-8000-000000000003', 'type' => 'entree',
                'exit_reason' => null, 'from' => null, 'to' => $supprime,
                'occurred_at' => '2026-10-01T10:00:00.123Z'],
            ['id' => $rangement, 'client_ref' => null, 'type' => 'deplacement', 'exit_reason' => null,
                'from' => $supprime, 'to' => $etagereActuelle, 'occurred_at' => '2026-10-02T08:00:00.000Z'],
            ['id' => $repas, 'client_ref' => null, 'type' => 'deplacement', 'exit_reason' => null,
                'from' => $etagereActuelle, 'to' => ['type' => 'hors_rangement'],
                'occurred_at' => '2026-10-05T19:00:00.000Z'],
            ['id' => $sortie, 'client_ref' => null, 'type' => 'sortie', 'exit_reason' => 'consommee',
                'from' => ['type' => 'hors_rangement'], 'to' => null, 'occurred_at' => '2026-10-05T20:00:00.000Z'],
        ], $fiche['movements']);
        self::assertSame(
            $this->reussir('GET', '/api/bottles?status=all')['bottles'][0] ?? null,
            array_diff_key($fiche, ['movements' => true]),
        );
    }

    /** @return iterable<string, array{string}> */
    public static function saisiesDeReference(): iterable
    {
        yield 'exacte' => ['a7'];
        yield 'majuscules' => ['A7'];
        yield 'avec espaces' => ['%20a%207%20'];
    }

    #[DataProvider('saisiesDeReference')]
    public function testRechercheParReference(string $saisie): void
    {
        $id = $this->bouteille(['reference' => 'a7', 'statut' => 'sortie']);
        $this->bouteille(['reference' => 'a8']);

        $fiche = $this->reussir('GET', '/api/bottles/by-reference/' . $saisie);

        self::assertSame([$id, []], [$fiche['id'], $fiche['movements']]);
    }

    public function testReferenceInconnue(): void
    {
        $reponse = $this->api('GET', '/api/bottles/by-reference/zz');

        self::assertSame(404, $reponse->getStatusCode());
        self::assertSame('NOT_FOUND', $this->codeErreur($reponse));
    }

    public function testIsolation(): void
    {
        $bob = $this->connecter('bob@exemple.fr');
        $deBob = $this->bouteille(['user_id' => $this->idUtilisateur('bob@exemple.fr'), 'reference' => 'a7']);
        $this->bouteille(['reference' => 'b1']);

        self::assertSame(404, $this->api('GET', '/api/bottles/' . $deBob)->getStatusCode());
        self::assertSame(404, $this->api('GET', '/api/bottles/by-reference/a7')->getStatusCode());
        self::assertSame(['b1'], $this->references(''));
        $vuesParBob = $this->json($this->api('GET', '/api/bottles', null, $bob))['bottles'];
        self::assertIsArray($vuesParBob);
        self::assertSame(['a7'], array_column($vuesParBob, 'reference'));
    }

    public function testFicheInexistante(): void
    {
        self::assertSame(404, $this->api('GET', '/api/bottles/999999')->getStatusCode());
        self::assertSame(404, $this->api('GET', '/api/bottles/abc')->getStatusCode());
    }

    /** @return iterable<string, array{string, string}> */
    public static function routesDeLEtape(): iterable
    {
        yield 'réserve de références' => ['POST', '/api/references/reservations'];
        yield 'régions' => ['GET', '/api/regions'];
        yield 'cépages' => ['GET', '/api/grapes'];
        yield 'liste' => ['GET', '/api/bottles'];
        yield 'fiche' => ['GET', '/api/bottles/1'];
        yield 'par référence' => ['GET', '/api/bottles/by-reference/a0'];
        yield 'édition' => ['PATCH', '/api/bottles/1'];
    }

    #[DataProvider('routesDeLEtape')]
    public function testSansJetonRefuse(string $methode, string $chemin): void
    {
        self::assertSame(401, $this->appeler($methode, $chemin)->getStatusCode());
    }

    /** @return list<string> références renvoyées par GET /api/bottles?$parametres */
    private function references(string $parametres): array
    {
        $bouteilles = $this->reussir('GET', '/api/bottles?' . $parametres)['bottles'];
        self::assertIsArray($bouteilles);

        /** @var list<string> */
        return array_column($bouteilles, 'reference');
    }
}
