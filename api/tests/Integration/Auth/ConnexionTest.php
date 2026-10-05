<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Auth;

use CaveAVin\Tests\Support\AuthTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/** POST /api/auth/connexion (Arch §2.2, décision P3). */
final class ConnexionTest extends AuthTestCase
{
    private const IDENTIFIANTS = ['email' => 'alice@exemple.fr', 'password' => self::MOT_DE_PASSE];

    public function testRenvoieLeJetonDAccesEtPoseLeTicketEnCookieHttpOnly(): void
    {
        $this->service->creerCompte('alice@exemple.fr', self::MOT_DE_PASSE);

        $reponse = $this->appeler('POST', '/api/auth/connexion', [
            'email' => 'alice@exemple.fr',
            'password' => self::MOT_DE_PASSE,
        ]);

        self::assertSame(200, $reponse->getStatusCode());
        self::assertSame('no-store', $reponse->getHeaderLine('Cache-Control'));
        $corps = $this->json($reponse);
        self::assertSame(['jeton_acces', 'expire_dans'], array_keys($corps));
        self::assertSame(900, $corps['expire_dans']);
        self::assertMatchesRegularExpression(
            '#^ivt_session=[A-Za-z0-9_-]{43}; Path=/api/auth; Max-Age=2592000; Secure; HttpOnly; SameSite=Strict$#',
            (string) $this->cookie($reponse, 'ivt_session'),
        );
    }

    public function testLeTicketEtLeRefreshTokenNeDescendentPasDansLeCorps(): void
    {
        $this->service->creerCompte('alice@exemple.fr', self::MOT_DE_PASSE);

        $reponse = $this->appeler('POST', '/api/auth/connexion', [
            'email' => 'alice@exemple.fr',
            'password' => self::MOT_DE_PASSE,
        ]);

        $refresh = $this->valeur('SELECT auth_refresh_token FROM user_sessions');
        self::assertIsString($refresh);
        self::assertStringNotContainsString($refresh, (string) $reponse->getBody());
        self::assertStringNotContainsString($this->ticket(), (string) $reponse->getBody());
    }

    public function testCreeLUtilisateurEtUneSessionQuiNeGardeQueLEmpreinteDuTicket(): void
    {
        $sub = $this->service->creerCompte('alice@exemple.fr', self::MOT_DE_PASSE);

        $this->appeler('POST', '/api/auth/connexion', [
            'email' => 'alice@exemple.fr',
            'password' => self::MOT_DE_PASSE,
            'appareil' => 'iPhone de test',
        ]);

        $utilisateur = $this->ligne('SELECT auth_sub, email FROM users');
        self::assertSame(['auth_sub' => $sub, 'email' => 'alice@exemple.fr'], $utilisateur);
        $session = $this->ligne(
            'SELECT refresh_session_hash, previous_refresh_session_hash, device_label FROM user_sessions'
        );
        self::assertSame(hash('sha256', $this->ticket()), $session['refresh_session_hash']);
        self::assertNull($session['previous_refresh_session_hash']);
        self::assertSame('iPhone de test', $session['device_label']);
    }

    public function testUneSessionParConnexionEtUnSeulUtilisateurParCompte(): void
    {
        $this->connecter();
        $this->connecter();

        self::assertSame(1, (int) $this->valeur('SELECT COUNT(*) FROM users'));
        self::assertSame(2, $this->nombreDeSessions());
    }

    public function testResynchroniseLEmailALaConnexion(): void
    {
        $this->connecter();
        $this->pdo->exec("UPDATE users SET email = 'ancienne@exemple.fr'");

        $this->connecter();

        self::assertSame('alice@exemple.fr', $this->valeur('SELECT email FROM users'));
    }

    public function testIdentifiantsIncorrects(): void
    {
        $this->service->creerCompte('alice@exemple.fr', self::MOT_DE_PASSE);

        $identifiants = ['email' => 'alice@exemple.fr', 'password' => 'mauvais-mdp'];
        $reponse = $this->appeler('POST', '/api/auth/connexion', $identifiants);

        self::assertSame(401, $reponse->getStatusCode());
        self::assertSame(
            ['error' => ['code' => 'INVALID_CREDENTIALS', 'message' => 'Identifiants incorrects.']],
            $this->json($reponse),
        );
        self::assertNull($this->cookie($reponse, 'ivt_session'));
        self::assertSame(0, $this->nombreDeSessions());
    }

    public function testAccesSuspendu(): void
    {
        $this->service->creerCompte('alice@exemple.fr', self::MOT_DE_PASSE);
        $this->service->revoquerAcces('alice@exemple.fr');

        $reponse = $this->appeler('POST', '/api/auth/connexion', self::IDENTIFIANTS);

        self::assertSame(403, $reponse->getStatusCode());
        self::assertSame(['code' => 'ACCESS_REVOKED', 'message' => 'Accès suspendu.'], $this->json($reponse)['error']);
    }

    /** @param array<string, mixed> $corps */
    #[DataProvider('corpsInvalides')]
    public function testCorpsInvalideSansAppelerLeService(array $corps): void
    {
        $reponse = $this->appeler('POST', '/api/auth/connexion', $corps);

        self::assertSame(400, $reponse->getStatusCode());
        self::assertSame('VALIDATION_FAILED', $this->codeErreur($reponse));
        self::assertSame([], $this->gestionnaire->requetes);
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function corpsInvalides(): iterable
    {
        yield 'vide' => [[]];
        yield 'sans mot de passe' => [['email' => 'alice@exemple.fr']];
        yield 'email non textuel' => [['email' => ['a'], 'password' => 'motdepasse-solide']];
        yield 'appareil non textuel' => [self::IDENTIFIANTS + ['appareil' => 3]];
    }

    public function testUnLibelleDAppareilTropLongEstTronque(): void
    {
        $this->connecter(appareil: str_repeat('é', 300));

        self::assertSame(255, (int) $this->valeur('SELECT CHAR_LENGTH(device_label) FROM user_sessions'));
    }

    public function testServiceIndisponible(): void
    {
        $this->service->creerCompte('alice@exemple.fr', self::MOT_DE_PASSE);
        $this->gestionnaire->panne = true;

        $reponse = $this->appeler('POST', '/api/auth/connexion', self::IDENTIFIANTS);

        self::assertSame(503, $reponse->getStatusCode());
        self::assertSame('AUTH_SERVICE_UNAVAILABLE', $this->codeErreur($reponse));
    }

    public function testMauvaiseConfigurationDeLApplicationEstUneErreurInterneJournalisee(): void
    {
        $this->service->creerCompte('alice@exemple.fr', self::MOT_DE_PASSE);
        $_ENV['AUTH_CLIENT_SECRET'] = 'secret-faux';

        $reponse = $this->appeler('POST', '/api/auth/connexion', self::IDENTIFIANTS);

        self::assertSame(500, $reponse->getStatusCode());
        self::assertSame('INTERNAL_ERROR', $this->codeErreur($reponse));
        self::assertStringContainsString('UNAUTHORIZED', (string) file_get_contents($this->dossier . '/api.log'));
    }
}
