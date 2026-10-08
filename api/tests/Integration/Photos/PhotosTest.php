<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Photos;

use CaveAVin\Tests\Support\Jpeg;
use CaveAVin\Tests\Support\MouvementsTestCase;

/**
 * Photos (contrat §11, Arch §5) : envoi par client_ref de la bouteille ou du lot (copie
 * distincte par bouteille), rejouable, stockage hors docroot, lecture authentifiée.
 */
final class PhotosTest extends MouvementsTestCase
{
    private const BOUTEILLE = '00000000-0000-4000-8000-000000000010';

    private int $id;
    private string $reference;

    protected function setUp(): void
    {
        parent::setUp();
        $ajoutee = $this->ajouter([['client_ref' => self::BOUTEILLE, 'reference' => null]])[0];
        $this->id = $ajoutee['id'];
        $this->reference = $ajoutee['reference'];
    }

    public function testEnvoiParLaBouteille(): void
    {
        $reponse = $this->envoyer('PUT', '/api/photos/' . self::BOUTEILLE, Jpeg::quadrants(120, 80));

        self::assertSame(204, $reponse->getStatusCode(), (string) $reponse->getBody());
        $chemin = $this->idUtilisateur() . '/' . $this->reference . '.jpg';
        self::assertSame($chemin, $this->valeur('SELECT photo_path FROM bouteilles WHERE id = ' . $this->id));
        self::assertSame([120, 80], Jpeg::dimensions($this->fichier($chemin)));
        self::assertSame([120, 80], Jpeg::dimensions($this->fichier(
            $this->idUtilisateur() . '/' . $this->reference . '_thumb.jpg',
        )));
        self::assertTrue($this->reussir('GET', '/api/bottles/' . $this->id)['has_photo']);
    }

    public function testEnvoiParLeLotCopieUnFichierParBouteille(): void
    {
        $lot = self::uuid(500);
        $ajoutees = $this->ajouter(
            [
                ['client_ref' => self::uuid(21), 'reference' => null],
                ['client_ref' => self::uuid(22), 'reference' => null],
            ],
            lot: $lot,
        );

        self::assertSame(204, $this->envoyer('PUT', '/api/photos/' . $lot, Jpeg::quadrants(120, 80))->getStatusCode());

        $u = $this->idUtilisateur();
        foreach ($ajoutees as $bouteille) {
            self::assertSame(
                $u . '/' . $bouteille['reference'] . '.jpg',
                $this->valeur('SELECT photo_path FROM bouteilles WHERE id = ' . $bouteille['id']),
            );
            self::assertFileExists($this->dossier . '/photos/' . $u . '/' . $bouteille['reference'] . '.jpg');
            self::assertFileExists($this->dossier . '/photos/' . $u . '/' . $bouteille['reference'] . '_thumb.jpg');
        }
        // La bouteille hors du lot n'est pas touchée.
        self::assertNull($this->valeur('SELECT photo_path FROM bouteilles WHERE id = ' . $this->id));
        // Fichiers distincts : supprimer la photo de l'une laisse celle de l'autre.
        self::assertSame(204, $this->api('DELETE', '/api/bottles/' . $ajoutees[0]['id'] . '/photo')->getStatusCode());
        self::assertSame(200, $this->api('GET', '/api/bottles/' . $ajoutees[1]['id'] . '/photo')->getStatusCode());
    }

    public function testOrientationAppliqueeAuStockage(): void
    {
        $this->envoyer('PUT', '/api/photos/' . self::BOUTEILLE, Jpeg::quadrants(120, 80, 6));

        $photo = (string) $this->api('GET', '/api/bottles/' . $this->id . '/photo')->getBody();
        self::assertSame([80, 120], Jpeg::dimensions($photo));
        self::assertSame(['bleu', 'rouge', 'blanc', 'vert'], Jpeg::quarts($photo));
    }

    public function testRejouableRemplaceLeFichier(): void
    {
        $this->envoyer('PUT', '/api/photos/' . self::BOUTEILLE, Jpeg::quadrants(120, 80));

        $reponse = $this->envoyer('PUT', '/api/photos/' . self::BOUTEILLE, Jpeg::quadrants(60, 90));

        self::assertSame(204, $reponse->getStatusCode());
        self::assertSame([60, 90], Jpeg::dimensions($this->photo()));
        self::assertCount(2, glob($this->dossier . '/photos/' . $this->idUtilisateur() . '/*') ?: []);
    }

    public function testLecture(): void
    {
        $this->envoyer('PUT', '/api/photos/' . self::BOUTEILLE, Jpeg::quadrants(1000, 500));

        $photo = $this->api('GET', '/api/bottles/' . $this->id . '/photo');
        $miniature = $this->api('GET', '/api/bottles/' . $this->id . '/photo/thumbnail');

        self::assertSame(200, $photo->getStatusCode());
        self::assertSame('image/jpeg', $photo->getHeaderLine('Content-Type'));
        self::assertSame('no-store', $photo->getHeaderLine('Cache-Control'));
        self::assertSame([1000, 500], Jpeg::dimensions((string) $photo->getBody()));
        self::assertSame(200, $miniature->getStatusCode());
        self::assertSame('image/jpeg', $miniature->getHeaderLine('Content-Type'));
        self::assertSame([400, 200], Jpeg::dimensions((string) $miniature->getBody()));
    }

    public function testSansPhoto(): void
    {
        foreach (['/photo', '/photo/thumbnail'] as $suffixe) {
            $reponse = $this->api('GET', '/api/bottles/' . $this->id . $suffixe);
            self::assertSame(404, $reponse->getStatusCode());
            self::assertSame('NOT_FOUND', $this->codeErreur($reponse));
        }
    }

    public function testSuppression(): void
    {
        $this->envoyer('PUT', '/api/photos/' . self::BOUTEILLE, Jpeg::quadrants(120, 80));

        self::assertSame(204, $this->api('DELETE', '/api/bottles/' . $this->id . '/photo')->getStatusCode());

        self::assertNull($this->valeur('SELECT photo_path FROM bouteilles WHERE id = ' . $this->id));
        self::assertSame([], glob($this->dossier . '/photos/' . $this->idUtilisateur() . '/*') ?: []);
        self::assertSame(404, $this->api('GET', '/api/bottles/' . $this->id . '/photo')->getStatusCode());
        self::assertFalse($this->reussir('GET', '/api/bottles/' . $this->id)['has_photo']);
        // Sans photo : rien à faire, toujours 204.
        self::assertSame(204, $this->api('DELETE', '/api/bottles/' . $this->id . '/photo')->getStatusCode());
        self::assertSame(404, $this->api('DELETE', '/api/bottles/999999/photo')->getStatusCode());
    }

    public function testAvantLaSynchronisationDeLaBouteille(): void
    {
        $reponse = $this->envoyer('PUT', '/api/photos/' . self::uuid(99), Jpeg::quadrants(120, 80));

        self::assertSame(404, $reponse->getStatusCode());
        self::assertSame('NOT_FOUND', $this->codeErreur($reponse));
    }

    public function testClientRefMalForme(): void
    {
        $reponse = $this->envoyer('PUT', '/api/photos/pas-un-uuid', Jpeg::quadrants(120, 80));

        self::assertSame(404, $reponse->getStatusCode());
    }

    public function testAutreTypeDeContenu(): void
    {
        $reponse = $this->envoyer('PUT', '/api/photos/' . self::BOUTEILLE, Jpeg::quadrants(120, 80), 'image/png');

        self::assertSame(415, $reponse->getStatusCode());
        self::assertSame('UNSUPPORTED_MEDIA_TYPE', $this->codeErreur($reponse));
    }

    public function testTypeAvecParametreAccepte(): void
    {
        $reponse = $this->envoyer('PUT', '/api/photos/' . self::BOUTEILLE, Jpeg::quadrants(120, 80), 'Image/JPEG; q=1');

        self::assertSame(204, $reponse->getStatusCode());
    }

    public function testTropGrosse(): void
    {
        $reponse = $this->envoyer('PUT', '/api/photos/' . self::BOUTEILLE, str_repeat('x', 10 * 1024 * 1024 + 1));

        self::assertSame(413, $reponse->getStatusCode());
        self::assertSame('PAYLOAD_TOO_LARGE', $this->codeErreur($reponse));
    }

    public function testIllisible(): void
    {
        $reponse = $this->envoyer('PUT', '/api/photos/' . self::BOUTEILLE, 'pas une image');

        self::assertSame(400, $reponse->getStatusCode());
        self::assertSame('VALIDATION_FAILED', $this->codeErreur($reponse));
        self::assertNull($this->valeur('SELECT photo_path FROM bouteilles WHERE id = ' . $this->id));
    }

    public function testIsolation(): void
    {
        $this->envoyer('PUT', '/api/photos/' . self::BOUTEILLE, Jpeg::quadrants(120, 80));
        $bob = $this->connecter('bob@exemple.fr');

        $chemin = '/api/bottles/' . $this->id . '/photo';

        $envoi = $this->envoyer('PUT', '/api/photos/' . self::BOUTEILLE, Jpeg::quadrants(60, 90), jeton: $bob);
        self::assertSame(404, $envoi->getStatusCode());
        self::assertSame(404, $this->api('GET', $chemin, jeton: $bob)->getStatusCode());
        self::assertSame(404, $this->api('GET', $chemin . '/thumbnail', jeton: $bob)->getStatusCode());
        self::assertSame(404, $this->api('DELETE', $chemin, jeton: $bob)->getStatusCode());

        self::assertSame([120, 80], Jpeg::dimensions($this->photo()));
    }

    public function testSansJeton(): void
    {
        self::assertSame(401, $this->appeler('GET', '/api/bottles/' . $this->id . '/photo')->getStatusCode());
        self::assertSame(401, $this->appeler('PUT', '/api/photos/' . self::BOUTEILLE)->getStatusCode());
    }

    private function photo(): string
    {
        return (string) $this->api('GET', '/api/bottles/' . $this->id . '/photo')->getBody();
    }

    private function fichier(string $chemin): string
    {
        $contenu = file_get_contents($this->dossier . '/photos/' . $chemin);
        self::assertIsString($contenu);

        return $contenu;
    }
}
