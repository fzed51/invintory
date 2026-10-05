<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Unit\Auth;

use CaveAVin\Auth\ClientAuthService;
use CaveAVin\Auth\ErreurAuthService;
use CaveAVin\Tests\Doublure\AuthServiceSimule;
use CaveAVin\Tests\Doublure\GestionnaireSimule;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\Psr7\Request;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\TestCase;

final class ClientAuthServiceTest extends TestCase
{
    private string $dossier;
    private AuthServiceSimule $service;
    private GestionnaireSimule $gestionnaire;
    private ClientAuthService $client;

    protected function setUp(): void
    {
        $this->dossier = sys_get_temp_dir() . '/auth-simule-' . bin2hex(random_bytes(6));
        $this->service = new AuthServiceSimule($this->dossier, AuthServiceSimule::configurationDeTest());
        $this->gestionnaire = new GestionnaireSimule($this->service);
        $this->client = $this->client($this->gestionnaire);
    }

    protected function tearDown(): void
    {
        AuthServiceSimule::effacer($this->dossier);
    }

    public function testPoseLesEnTetesDeLApplicationSurChaqueAppel(): void
    {
        $this->client->inscrire('alice@exemple.fr', 'motdepasse-solide');

        $requete = $this->gestionnaire->requetes[0];
        self::assertSame('https://auth.test/users', (string) $requete->getUri());
        self::assertSame('invintory-test', $requete->getHeaderLine('X-Client-Id'));
        self::assertSame('secret-de-test', $requete->getHeaderLine('X-Client-Secret'));
        self::assertSame('application/json', $requete->getHeaderLine('Accept'));
    }

    public function testConnecterRenvoieLaPaire(): void
    {
        $this->service->creerCompte('alice@exemple.fr', 'motdepasse-solide');

        $paire = $this->client->connecter('alice@exemple.fr', 'motdepasse-solide');

        self::assertSame(900, $paire->expireDans);
        self::assertNotSame('', $paire->jetonDAcces);
        self::assertNotSame('', $paire->jetonDeRafraichissement);
    }

    public function testRafraichirPuisProfil(): void
    {
        $this->service->creerCompte('alice@exemple.fr', 'motdepasse-solide');
        $paire = $this->client->rafraichir(
            $this->client->connecter('alice@exemple.fr', 'motdepasse-solide')->jetonDeRafraichissement,
        );

        $profil = $this->client->profil($paire->jetonDAcces);

        self::assertSame('alice@exemple.fr', $profil['email']);
        $autorisation = $this->gestionnaire->requetes[2]->getHeaderLine('Authorization');
        self::assertSame('Bearer ' . $paire->jetonDAcces, $autorisation);
    }

    public function testUnRefusMetierDevientUneErreurAvecSonCode(): void
    {
        try {
            $this->client->connecter('inconnu@exemple.fr', 'motdepasse-solide');
            self::fail('Erreur attendue');
        } catch (ErreurAuthService $erreur) {
            self::assertSame('INVALID_CREDENTIALS', $erreur->codeErreur);
            self::assertSame(401, $erreur->statut);
        }
    }

    public function testLePlafondTransmetRetryAfter(): void
    {
        for ($i = 0; $i < 3; $i++) {
            $this->client->inscrire('alice@exemple.fr', 'motdepasse-solide');
        }

        try {
            $this->client->renvoyerConfirmation('alice@exemple.fr');
            self::fail('Erreur attendue');
        } catch (ErreurAuthService $erreur) {
            self::assertSame('RATE_LIMITED', $erreur->codeErreur);
            self::assertSame('900', $erreur->reessayerApres);
        }
    }

    public function testParcoursSecondairesSansErreur(): void
    {
        $this->service->creerCompte('alice@exemple.fr', 'motdepasse-solide');
        $acces = $this->client->connecter('alice@exemple.fr', 'motdepasse-solide')->jetonDAcces;

        $this->client->oublierMotDePasse('alice@exemple.fr');
        $this->client->changerEmail($acces, 'alice.nouvelle@exemple.fr', 'motdepasse-solide');

        self::assertSame(
            ['password_reset', 'email_change_avis'],
            array_column($this->service->emails('alice@exemple.fr'), 'type'),
        );
        $this->attendreErreur('RESET_TOKEN_INVALID', 400, fn () => $this->client->reinitialiserMotDePasse(
            'jeton-inconnu',
            'nouveau-mot-de-passe',
        ));
    }

    public function testJwks(): void
    {
        self::assertSame('RSA', $this->client->jwks()['keys'][0]['kty'] ?? null);
    }

    public function testUnePanneReseauEstUnServiceIndisponible(): void
    {
        $client = $this->client((new MockHandler([
            new ConnectException('Connexion refusée', new Request('POST', 'sessions')),
        ])));

        $this->attendreErreur('AUTH_SERVICE_UNAVAILABLE', 503, fn () => $client->connecter('a@ex.fr', 'mdp-solide'));
    }

    public function testUneErreur5xxEstUnServiceIndisponible(): void
    {
        $client = $this->client((new MockHandler([new Response(502)])));

        $this->attendreErreur('AUTH_SERVICE_UNAVAILABLE', 503, fn () => $client->connecter('a@ex.fr', 'mdp-solide'));
    }

    public function testUn4xxSansEnveloppeEstInconnu(): void
    {
        $client = $this->client((new MockHandler([new Response(418, [], 'théière')])));

        try {
            $client->connecter('alice@exemple.fr', 'motdepasse-solide');
            self::fail('Erreur attendue');
        } catch (ErreurAuthService $erreur) {
            self::assertSame(['UNKNOWN', 418], [$erreur->codeErreur, $erreur->statut]);
        }
    }

    /** @param callable(): mixed $appel */
    private function attendreErreur(string $code, int $statut, callable $appel): void
    {
        try {
            $appel();
            self::fail('ErreurAuthService attendue');
        } catch (ErreurAuthService $erreur) {
            self::assertSame([$code, $statut], [$erreur->codeErreur, $erreur->statut]);
        }
    }

    private function client(callable $gestionnaire): ClientAuthService
    {
        return ClientAuthService::creer('https://auth.test', 'invintory-test', 'secret-de-test', $gestionnaire);
    }
}
