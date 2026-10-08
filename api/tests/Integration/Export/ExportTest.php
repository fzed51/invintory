<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Export;

use CaveAVin\Tests\Support\Jpeg;
use CaveAVin\Tests\Support\MouvementsTestCase;
use Psr\Http\Message\ResponseInterface;
use ZipArchive;

/**
 * GET /api/export (contrat §12, Arch §7) : archive ZIP de toute la cave du compte,
 * `data.json` aux noms de l'API sans aucun id interne, et les photos (sans miniatures).
 */
final class ExportTest extends MouvementsTestCase
{
    private const MOMENT = 1_791_475_200; // 2026-10-08T16:00:00Z

    /** @var list<string> archives reçues, effacées après le test */
    private array $archives = [];

    public function testArchiveComplete(): void
    {
        $etagere = $this->etageres($this->creerArmoire('Cave du bas', [6, 2]))[1];
        $this->reussir('PATCH', '/api/shelves/' . $etagere, ['name' => 'Haut']);
        $this->creerCarton('Carton Bordeaux', 12);
        $this->reussir('POST', '/api/categories', ['type' => 'rouge', 'region' => 'Bordeaux', 'threshold' => 3], 201);
        $this->referentiel('cepages', 'Syrah');
        [$a, $b] = $this->ajouter(
            [
                ['client_ref' => self::uuid(10), 'reference' => null],
                ['client_ref' => self::uuid(11), 'reference' => null],
            ],
            ['region' => 'Bordeaux', 'cepage' => 'Merlot', 'millesime' => 2018, 'note' => 'Offert'],
            ['type' => 'etagere', 'id' => $etagere],
        );
        $this->sortir(self::uuid(11), 'consommee', '2026-10-08 09:00:00.000', self::uuid(30));
        $this->envoyer('PUT', '/api/photos/' . self::uuid(10), Jpeg::quadrants(120, 80));
        $this->maintenant = self::MOMENT;

        $reponse = $this->api('GET', '/api/export');

        self::assertSame(200, $reponse->getStatusCode(), (string) $reponse->getBody());
        self::assertSame('application/zip', $reponse->getHeaderLine('Content-Type'));
        self::assertSame(
            'attachment; filename="invintory-2026-10-08.zip"',
            $reponse->getHeaderLine('Content-Disposition'),
        );
        self::assertSame('no-store', $reponse->getHeaderLine('Cache-Control'));
        $archive = $this->ouvrir($reponse);
        self::assertSame(['data.json', 'photos/' . $a['reference'] . '.jpg'], $this->noms($archive));
        $photo = (string) $archive->getFromName('photos/' . $a['reference'] . '.jpg');
        self::assertSame([120, 80], Jpeg::dimensions($photo));

        $donnees = json_decode((string) $archive->getFromName('data.json'), true, flags: JSON_THROW_ON_ERROR);
        self::assertIsArray($donnees);
        self::assertSame('2026-10-08T16:00:00.000Z', $donnees['exported_at']);
        self::assertSame([[
            'name' => 'Cave du bas',
            'shelves' => [
                ['name' => null, 'position' => 1, 'capacity' => 6, 'occupied' => 0],
                ['name' => 'Haut', 'position' => 2, 'capacity' => 2, 'occupied' => 1],
            ],
        ]], $donnees['cabinets']);
        self::assertSame([['label' => 'Carton Bordeaux', 'capacity' => 12, 'occupied' => 0]], $donnees['boxes']);
        self::assertSame([['name' => 'Bordeaux']], $donnees['regions']);
        self::assertSame([['name' => 'Merlot'], ['name' => 'Syrah']], $donnees['grapes']);
        self::assertSame([[
            'type' => 'rouge', 'region' => ['name' => 'Bordeaux'], 'threshold' => 3, 'ageing_years' => null,
            'count' => 1,
        ]], $donnees['categories']);

        self::assertIsArray($donnees['bottles']);
        self::assertSame([$a['reference'], $b['reference']], array_column($donnees['bottles'], 'reference'));
        [$premiere, $seconde] = $donnees['bottles'];
        self::assertIsArray($premiere);
        self::assertIsArray($seconde);
        self::assertSame([
            'client_ref' => self::uuid(10), 'reference' => $a['reference'], 'type' => 'rouge',
            'region' => ['name' => 'Bordeaux'], 'grape' => ['name' => 'Merlot'], 'domain' => null, 'vintage' => 2018,
            'entry_date' => '2026-10', 'origin' => 'achetee', 'note' => 'Offert', 'souvenir' => false,
            'location' => ['type' => 'etagere', 'label' => 'Cave du bas · Haut'], 'status' => 'en_cave',
            'drink_by' => '2026-12-31', 'urgent' => false, 'age_year' => 2018, 'batch_id' => self::LOT,
            'has_photo' => true,
        ], array_diff_key($premiere, array_flip(['created_at', 'updated_at', 'movements'])));
        self::assertSame([[
            'client_ref' => null, 'type' => 'entree', 'exit_reason' => null, 'from' => null,
            'to' => ['type' => 'etagere', 'label' => 'Cave du bas · Haut'], 'occurred_at' => '2026-10-07T18:40:00.000Z',
        ]], $premiere['movements']);
        self::assertSame('sortie', $seconde['status']);
        self::assertSame(['entree', 'sortie'], array_column((array) $seconde['movements'], 'type'));
        $json = (string) $archive->getFromName('data.json');
        self::assertStringNotContainsString('"id"', $json);
        self::assertStringNotContainsString('_id"', str_replace('"batch_id"', '', $json));
    }

    public function testCaveVide(): void
    {
        $this->maintenant = self::MOMENT;
        $archive = $this->ouvrir($this->api('GET', '/api/export'));

        self::assertSame(['data.json'], $this->noms($archive));
        self::assertSame([
            'exported_at' => '2026-10-08T16:00:00.000Z', 'cabinets' => [], 'boxes' => [], 'regions' => [],
            'grapes' => [], 'categories' => [], 'bottles' => [],
        ], json_decode((string) $archive->getFromName('data.json'), true, flags: JSON_THROW_ON_ERROR));
    }

    public function testIsolation(): void
    {
        $this->creerArmoire('Cave', [2]);
        $this->ajouter([['client_ref' => self::uuid(10), 'reference' => null]]);
        $this->envoyer('PUT', '/api/photos/' . self::uuid(10), Jpeg::quadrants(120, 80));
        $bob = $this->connecter('bob@exemple.fr');

        $archive = $this->ouvrir($this->api('GET', '/api/export', jeton: $bob));

        self::assertSame(['data.json'], $this->noms($archive));
        $donnees = json_decode((string) $archive->getFromName('data.json'), true, flags: JSON_THROW_ON_ERROR);
        self::assertIsArray($donnees);
        self::assertSame([[], []], [$donnees['cabinets'], $donnees['bottles']]);
    }

    public function testFichierTemporaireSupprime(): void
    {
        $avant = glob(sys_get_temp_dir() . '/invintory-export-*') ?: [];

        $this->ouvrir($this->api('GET', '/api/export'));

        self::assertSame($avant, glob(sys_get_temp_dir() . '/invintory-export-*') ?: []);
    }

    protected function tearDown(): void
    {
        foreach ($this->archives as $fichier) {
            @unlink($fichier);
        }
        parent::tearDown();
    }

    private function ouvrir(ResponseInterface $reponse): ZipArchive
    {
        self::assertSame(200, $reponse->getStatusCode(), (string) $reponse->getBody());
        $fichier = tempnam(sys_get_temp_dir(), 'zip');
        self::assertIsString($fichier);
        $this->archives[] = $fichier;
        file_put_contents($fichier, (string) $reponse->getBody());
        $archive = new ZipArchive();
        self::assertTrue($archive->open($fichier, ZipArchive::RDONLY));

        return $archive;
    }

    /** @return list<string> */
    private function noms(ZipArchive $archive): array
    {
        $noms = [];
        for ($i = 0; $i < $archive->numFiles; $i++) {
            $noms[] = (string) $archive->getNameIndex($i);
        }

        return $noms;
    }
}
