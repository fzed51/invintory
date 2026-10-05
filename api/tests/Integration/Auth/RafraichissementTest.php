<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Auth;

use CaveAVin\Tests\Support\AuthTestCase;
use Psr\Http\Message\ResponseInterface;

/**
 * POST /api/auth/rafraichir : rotation du ticket à chaque usage, détection du rejeu,
 * 30 jours glissants (décision P3, schéma v1.2).
 */
final class RafraichissementTest extends AuthTestCase
{
    public function testDonneUnNouveauJetonEtRenouvelleLeTicket(): void
    {
        $this->connecter();
        $ancien = $this->ticket();
        $refreshAvant = $this->valeur('SELECT auth_refresh_token FROM user_sessions');

        $reponse = $this->rafraichir();

        self::assertSame(200, $reponse->getStatusCode());
        self::assertSame(900, $this->json($reponse)['expire_dans']);
        self::assertIsString($this->json($reponse)['jeton_acces']);
        self::assertNotSame($ancien, $this->ticket());
        self::assertSame(
            [
                'refresh_session_hash' => hash('sha256', $this->ticket()),
                'previous_refresh_session_hash' => hash('sha256', $ancien),
            ],
            $this->ligne('SELECT refresh_session_hash, previous_refresh_session_hash FROM user_sessions'),
        );
        self::assertNotSame($refreshAvant, $this->valeur('SELECT auth_refresh_token FROM user_sessions'));
        self::assertSame(1, $this->service->nombreDeRotations());
    }

    public function testLeNouveauJetonDonneAccesAuxRoutesProtegees(): void
    {
        $this->connecter();
        $jeton = $this->json($this->rafraichir())['jeton_acces'];
        self::assertIsString($jeton);

        $reponse = $this->appeler('GET', '/api/auth/appareils', null, ['Authorization' => 'Bearer ' . $jeton]);

        self::assertSame(200, $reponse->getStatusCode());
    }

    public function testFenetreGlissante(): void
    {
        $this->connecter();
        $statuts = [];
        foreach ([1, 2] as $_) {
            $this->maintenant += 29 * 86400;
            $statuts[] = $this->rafraichir()->getStatusCode();
        }

        self::assertSame([200, 200], $statuts, 'chaque usage repousse l’échéance de 30 jours');
    }

    public function testApres30JoursSansUsageLaSessionEstSupprimeeSansAppelerLeService(): void
    {
        $this->connecter();
        $this->maintenant += 30 * 86400 + 1;

        $reponse = $this->rafraichir();

        $this->assertSessionInvalide($reponse);
        self::assertSame(0, $this->nombreDeSessions());
        self::assertSame(0, $this->service->nombreDeRotations());
    }

    public function testAncienTicketDansLes10SecondesRefuseSansRevoquer(): void
    {
        $this->connecter();
        $ancien = $this->ticket();
        $this->rafraichir();
        $nouveau = $this->ticket();
        $this->maintenant += 10;

        $reponse = $this->rafraichir($ancien);

        self::assertSame(409, $reponse->getStatusCode());
        self::assertSame('SESSION_ALREADY_REFRESHED', $this->codeErreur($reponse));
        self::assertNull($this->cookie($reponse, 'ivt_session'), 'le cookie courant n’est pas touché');
        self::assertSame(1, $this->service->nombreDeRotations());
        self::assertSame(200, $this->rafraichir($nouveau)->getStatusCode());
    }

    public function testAncienTicketApres10SecondesEstUnRejeuQuiSupprimeLaSession(): void
    {
        $this->connecter();
        $ancien = $this->ticket();
        $this->rafraichir();
        $nouveau = $this->ticket();
        $this->maintenant += 11;

        $this->assertSessionInvalide($this->rafraichir($ancien));

        self::assertSame(0, $this->nombreDeSessions());
        $this->assertSessionInvalide($this->rafraichir($nouveau));
        self::assertStringContainsString('rejeu', (string) file_get_contents($this->dossier . '/api.log'));
    }

    public function testLeRejeuNeTouchePasLesAutresAppareils(): void
    {
        $this->connecter();
        $voleur = $this->ticket();
        $this->connecter(appareil: 'second');
        $second = $this->ticket();
        $this->rafraichir($voleur);
        $this->maintenant += 11;

        $this->rafraichir($voleur);

        self::assertSame(1, $this->nombreDeSessions());
        self::assertSame(200, $this->rafraichir($second)->getStatusCode());
    }

    public function testTicketInconnuOuAbsent(): void
    {
        $this->assertSessionInvalide($this->rafraichir('inconnu'));
        $this->cookies = [];
        $this->assertSessionInvalide($this->appeler('POST', '/api/auth/rafraichir'));
    }

    public function testRefreshTokenRefuseParLeServiceSupprimeLaSession(): void
    {
        $this->connecter();
        // Comme après un reset de mot de passe, fait sur un autre appareil (§2.5).
        $this->service->revoquerSessions('alice@exemple.fr');

        $this->assertSessionInvalide($this->rafraichir());

        self::assertSame(0, $this->nombreDeSessions());
    }

    public function testAccesSuspenduSupprimeLaSession(): void
    {
        $this->connecter();
        $this->service->revoquerAcces('alice@exemple.fr');

        $reponse = $this->rafraichir();

        self::assertSame(403, $reponse->getStatusCode());
        self::assertSame('ACCESS_REVOKED', $this->codeErreur($reponse));
        self::assertStringContainsString('Max-Age=0', (string) $this->cookie($reponse, 'ivt_session'));
        self::assertSame(0, $this->nombreDeSessions());
    }

    public function testServiceIndisponibleGardeLaSessionIntacte(): void
    {
        $this->connecter();
        $ticket = $this->ticket();
        $this->gestionnaire->panne = true;

        $reponse = $this->rafraichir();

        self::assertSame(503, $reponse->getStatusCode());
        self::assertNull($this->cookie($reponse, 'ivt_session'));
        $this->gestionnaire->panne = false;
        self::assertSame(200, $this->rafraichir($ticket)->getStatusCode());
    }

    private function rafraichir(?string $ticket = null): ResponseInterface
    {
        if ($ticket !== null) {
            $this->cookies['ivt_session'] = $ticket;
        }

        return $this->appeler('POST', '/api/auth/rafraichir');
    }

    private function assertSessionInvalide(ResponseInterface $reponse): void
    {
        self::assertSame(401, $reponse->getStatusCode());
        self::assertSame('SESSION_INVALID', $this->codeErreur($reponse));
        self::assertSame(
            'ivt_session=; Path=/api/auth; Max-Age=0; Secure; HttpOnly; SameSite=Strict',
            $this->cookie($reponse, 'ivt_session'),
        );
    }
}
