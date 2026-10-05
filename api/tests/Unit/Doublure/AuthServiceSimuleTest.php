<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Unit\Doublure;

use CaveAVin\Tests\Doublure\AuthServiceSimule;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use GuzzleHttp\Psr7\Request;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use stdClass;

/**
 * La doublure d'auth-service respecte le contrat de docs/ressources/auth-service-integration.md
 * (§2 à §4) : c'est elle qui remplace le vrai service tant que les identifiants manquent.
 */
final class AuthServiceSimuleTest extends TestCase
{
    private const EMAIL = 'alice@exemple.fr';
    private const MOT_DE_PASSE = 'motdepasse-solide';

    private string $dossier;
    private int $maintenant;
    private AuthServiceSimule $service;

    protected function setUp(): void
    {
        $this->dossier = sys_get_temp_dir() . '/auth-simule-' . bin2hex(random_bytes(6));
        $this->maintenant = 1_800_000_000;
        $this->service = $this->instance();
    }

    protected function tearDown(): void
    {
        AuthServiceSimule::effacer($this->dossier);
    }

    public function testSanteEtJwksSontPublics(): void
    {
        self::assertSame(200, $this->appeler('GET', '/health', client: false)->getStatusCode());

        $jwks = $this->json($this->appeler('GET', '/.well-known/jwks.json', client: false));
        self::assertIsArray($jwks['keys']);
        self::assertSame(['kty' => 'RSA', 'use' => 'sig', 'alg' => 'RS256'], array_intersect_key(
            $jwks['keys'][0],
            ['kty' => 0, 'use' => 0, 'alg' => 0],
        ));
        self::assertNotEmpty($jwks['keys'][0]['kid']);
    }

    /** @param array<string, string> $entetes */
    #[DataProvider('identificationsDeLApplicationRefusees')]
    public function testLesRoutesDApiExigentLIdentificationDeLApplication(array $entetes): void
    {
        $reponse = $this->service->traiter(new Request('POST', '/sessions', $entetes, '{}'));

        self::assertSame(401, $reponse->getStatusCode());
        self::assertSame('UNAUTHORIZED', $this->code($reponse));
    }

    /** @return iterable<string, array{array<string, string>}> */
    public static function identificationsDeLApplicationRefusees(): iterable
    {
        yield 'aucun en-tête' => [[]];
        yield 'secret faux' => [['X-Client-Id' => 'invintory-test', 'X-Client-Secret' => 'faux']];
        yield 'client inconnu' => [['X-Client-Id' => 'autre', 'X-Client-Secret' => 'secret-de-test']];
    }

    public function testInscriptionPuisConfirmationParLeLien(): void
    {
        $reponse = $this->appeler('POST', '/users', ['email' => self::EMAIL, 'password' => self::MOT_DE_PASSE]);

        self::assertSame(202, $reponse->getStatusCode());
        self::assertSame(['status' => 'confirmation_pending'], $this->json($reponse));
        self::assertSame(
            'https://invintory.test/api/auth/callback?type=user_registration&status=confirmed',
            $this->suivre($this->dernierLien(self::EMAIL))->getHeaderLine('Location'),
        );
        self::assertSame(
            'https://invintory.test/api/auth/callback?type=user_registration&status=already_confirmed',
            $this->suivre($this->dernierLien(self::EMAIL))->getHeaderLine('Location'),
        );
    }

    public function testUnLienDInscriptionExpireApres24Heures(): void
    {
        $this->appeler('POST', '/users', ['email' => self::EMAIL, 'password' => self::MOT_DE_PASSE]);
        $this->maintenant += 24 * 3600 + 1;

        self::assertStringEndsWith(
            '?type=user_registration&status=expired',
            $this->suivre($this->dernierLien(self::EMAIL))->getHeaderLine('Location'),
        );
    }

    public function testUnLienInconnuRepond404SansRediriger(): void
    {
        $reponse = $this->appeler('GET', '/users/confirm/inconnu', client: false);

        self::assertSame(404, $reponse->getStatusCode());
        self::assertSame('', $reponse->getHeaderLine('Location'));
    }

    /** @param array<string, string> $corps */
    #[DataProvider('inscriptionsInvalides')]
    public function testUneInscriptionInvalideEstRefusee(array $corps): void
    {
        $reponse = $this->appeler('POST', '/users', $corps);

        self::assertSame(400, $reponse->getStatusCode());
        self::assertSame('VALIDATION_FAILED', $this->code($reponse));
    }

    /** @return iterable<string, array{array<string, string>}> */
    public static function inscriptionsInvalides(): iterable
    {
        yield 'email invalide' => [['email' => 'pas-un-email', 'password' => self::MOT_DE_PASSE]];
        yield 'mot de passe de 7 octets' => [['email' => self::EMAIL, 'password' => '1234567']];
        yield 'mot de passe de 73 octets' => [['email' => self::EMAIL, 'password' => str_repeat('a', 73)]];
        yield 'mot de passe absent' => [['email' => self::EMAIL]];
    }

    public function testUneAdresseDejaInscriteEstRefusee(): void
    {
        $this->creerCompte();

        $reponse = $this->appeler('POST', '/users', ['email' => self::EMAIL, 'password' => self::MOT_DE_PASSE]);

        self::assertSame(409, $reponse->getStatusCode());
        self::assertSame('EMAIL_ALREADY_USED', $this->code($reponse));
    }

    public function testRenvoyerLeLienSansDemandeEnCours(): void
    {
        $reponse = $this->appeler('POST', '/users/confirm/resend', ['email' => self::EMAIL]);

        self::assertSame(404, $reponse->getStatusCode());
        self::assertSame('NO_PENDING_REGISTRATION', $this->code($reponse));
    }

    public function testRenvoyerLeLienNInvalidePasLePrecedent(): void
    {
        $this->appeler('POST', '/users', ['email' => self::EMAIL, 'password' => self::MOT_DE_PASSE]);
        $premier = $this->dernierLien(self::EMAIL);

        $renvoi = $this->appeler('POST', '/users/confirm/resend', ['email' => self::EMAIL]);
        self::assertSame(202, $renvoi->getStatusCode());

        self::assertNotSame($premier, $this->dernierLien(self::EMAIL));
        self::assertStringEndsWith('status=confirmed', $this->suivre($premier)->getHeaderLine('Location'));
    }

    public function testAuPlusTroisEmailsParQuartDHeurePourUneAdresse(): void
    {
        for ($i = 0; $i < 3; $i++) {
            $this->appeler('POST', '/users', ['email' => self::EMAIL, 'password' => self::MOT_DE_PASSE]);
        }

        $reponse = $this->appeler('POST', '/users/confirm/resend', ['email' => self::EMAIL]);

        self::assertSame(429, $reponse->getStatusCode());
        self::assertSame('RATE_LIMITED', $this->code($reponse));
        self::assertGreaterThan(0, (int) $reponse->getHeaderLine('Retry-After'));
    }

    public function testConnexionDonneUnJetonSigneVerifiableParLeJwks(): void
    {
        $this->creerCompte();

        $reponse = $this->appeler('POST', '/sessions', ['email' => self::EMAIL, 'password' => self::MOT_DE_PASSE]);

        self::assertSame(201, $reponse->getStatusCode());
        $paire = $this->json($reponse);
        self::assertSame(900, $paire['expires_in']);
        self::assertIsString($paire['refresh_token']);
        self::assertIsString($paire['access_token']);

        JWT::$timestamp = $this->maintenant;
        try {
            $entetes = new stdClass();
            $claims = JWT::decode($paire['access_token'], JWK::parseKeySet($this->jwks()), $entetes);
        } finally {
            JWT::$timestamp = null;
        }
        self::assertSame('https://auth.test', $claims->iss);
        self::assertSame('invintory-test', $claims->aud);
        self::assertSame($this->maintenant + 900, $claims->exp);
        self::assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', $claims->sub);
        self::assertSame($this->jwks()['keys'][0]['kid'], $entetes?->kid);
    }

    public function testConnexionAvecUnMauvaisMotDePasse(): void
    {
        $this->creerCompte();

        $reponse = $this->appeler('POST', '/sessions', ['email' => self::EMAIL, 'password' => 'autre-mot-de-passe']);

        self::assertSame(401, $reponse->getStatusCode());
        self::assertSame('INVALID_CREDENTIALS', $this->code($reponse));
    }

    public function testConnexionDUnAccesRevoque(): void
    {
        $this->creerCompte();
        $this->service->revoquerAcces(self::EMAIL);

        $reponse = $this->appeler('POST', '/sessions', ['email' => self::EMAIL, 'password' => self::MOT_DE_PASSE]);

        self::assertSame(403, $reponse->getStatusCode());
        self::assertSame('ACCESS_REVOKED', $this->code($reponse));
    }

    public function testLaRotationRemplaceLaPaireEtCompteLesAppels(): void
    {
        $paire = $this->connecter();

        $reponse = $this->rafraichir($paire['refresh_token']);

        self::assertSame(200, $reponse->getStatusCode());
        self::assertNotSame($paire['refresh_token'], $this->json($reponse)['refresh_token']);
        self::assertSame(1, $this->service->nombreDeRotations());
    }

    public function testRejouerUnRefreshTokenRevoqueToutesLesSessions(): void
    {
        $paire = $this->connecter();
        $autreAppareil = $this->connecter();
        $nouvelle = $this->json($this->rafraichir($paire['refresh_token']));

        $rejeu = $this->rafraichir($paire['refresh_token']);

        self::assertSame(401, $rejeu->getStatusCode());
        self::assertSame('REFRESH_TOKEN_INVALID', $this->code($rejeu));
        foreach ([$nouvelle['refresh_token'], $autreAppareil['refresh_token']] as $jeton) {
            self::assertSame(401, $this->rafraichir($jeton)->getStatusCode());
        }
    }

    public function testUnRefreshTokenInutilise30JoursExpire(): void
    {
        $paire = $this->connecter();
        $this->maintenant += 30 * 24 * 3600 + 1;

        $reponse = $this->rafraichir($paire['refresh_token']);

        self::assertSame(401, $reponse->getStatusCode());
        self::assertSame('REFRESH_TOKEN_INVALID', $this->code($reponse));
    }

    public function testProfilAvecLeJetonDAcces(): void
    {
        $paire = $this->connecter();

        $profil = $this->json($this->appeler('GET', '/users/me', jeton: $paire['access_token']));

        self::assertSame(self::EMAIL, $profil['email']);
        self::assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', $profil['id']);
    }

    public function testProfilAvecUnJetonInvalide(): void
    {
        $reponse = $this->appeler('GET', '/users/me', jeton: 'abc.def.ghi');

        self::assertSame(401, $reponse->getStatusCode());
        self::assertSame('INVALID_ACCESS_TOKEN', $this->code($reponse));
    }

    public function testListerEtRevoquerLesSessions(): void
    {
        $paire = $this->connecter();
        $sessions = $this->json($this->appeler('GET', '/sessions', jeton: $paire['access_token']))['sessions'];
        self::assertIsArray($sessions);
        self::assertCount(1, $sessions);

        $chemin = '/sessions/' . $sessions[0]['id'];
        $premiere = $this->appeler('DELETE', $chemin, jeton: $paire['access_token']);
        $seconde = $this->appeler('DELETE', $chemin, jeton: $paire['access_token']);
        self::assertSame([204, 204], [$premiere->getStatusCode(), $seconde->getStatusCode()], 'idempotente');
        self::assertSame(
            'SESSION_NOT_FOUND',
            $this->code($this->appeler('DELETE', '/sessions/inconnue', jeton: $paire['access_token'])),
        );
        self::assertSame(401, $this->rafraichir($paire['refresh_token'])->getStatusCode());
    }

    public function testMotDePasseOublieRepondToujours202(): void
    {
        $this->creerCompte();

        foreach ([self::EMAIL, 'inconnu@exemple.fr'] as $email) {
            $reponse = $this->appeler('POST', '/users/password/forgot', ['email' => $email]);
            self::assertSame(202, $reponse->getStatusCode());
            self::assertSame(['status' => 'reset_pending'], $this->json($reponse));
        }
        self::assertSame([], $this->service->emails('inconnu@exemple.fr'));
    }

    public function testReinitialisationDuMotDePasse(): void
    {
        $paire = $this->connecter();
        $this->appeler('POST', '/users/password/forgot', ['email' => self::EMAIL]);
        $lien = $this->dernierLien(self::EMAIL);

        $page = $this->suivre($lien);
        self::assertSame(200, $page->getStatusCode());
        self::assertStringContainsString('<form method="post"', (string) $page->getBody());

        $redirection = $this->suivre($lien, 'POST')->getHeaderLine('Location');
        self::assertMatchesRegularExpression(
            '#^https://invintory\.test/api/auth/callback\?type=password_reset&status=confirmed'
            . '&reset_token=[A-Za-z0-9_-]+$#',
            $redirection,
        );
        self::assertStringEndsWith('status=already_confirmed', $this->suivre($lien, 'POST')->getHeaderLine('Location'));

        parse_str((string) parse_url($redirection, PHP_URL_QUERY), $parametres);
        $corps = ['reset_token' => $parametres['reset_token'], 'password' => 'nouveau-mot-de-passe'];
        self::assertSame(204, $this->appeler('POST', '/users/password/reset', $corps)->getStatusCode());

        $reutilise = $this->appeler('POST', '/users/password/reset', $corps);
        self::assertSame(400, $reutilise->getStatusCode());
        self::assertSame('RESET_TOKEN_INVALID', $this->code($reutilise));
        self::assertSame(401, $this->rafraichir($paire['refresh_token'])->getStatusCode());
        $identifiants = ['email' => self::EMAIL, 'password' => 'nouveau-mot-de-passe'];
        $connexion = $this->appeler('POST', '/sessions', $identifiants);
        self::assertSame(201, $connexion->getStatusCode());
    }

    public function testUnJetonDeReinitialisationExpireApres15Minutes(): void
    {
        $this->creerCompte();
        $this->appeler('POST', '/users/password/forgot', ['email' => self::EMAIL]);
        parse_str((string) parse_url(
            $this->suivre($this->dernierLien(self::EMAIL), 'POST')->getHeaderLine('Location'),
            PHP_URL_QUERY,
        ), $parametres);
        $this->maintenant += 15 * 60 + 1;

        $reponse = $this->appeler('POST', '/users/password/reset', [
            'reset_token' => $parametres['reset_token'],
            'password' => 'nouveau-mot-de-passe',
        ]);

        self::assertSame('RESET_TOKEN_INVALID', $this->code($reponse));
    }

    public function testChangementDEmail(): void
    {
        $paire = $this->connecter();
        $nouvelle = 'alice.nouvelle@exemple.fr';

        $demande = ['email' => $nouvelle, 'password' => self::MOT_DE_PASSE];
        $reponse = $this->appeler('POST', '/users/me/email', $demande, jeton: $paire['access_token']);

        self::assertSame(202, $reponse->getStatusCode());
        $avis = $this->service->emails(self::EMAIL)[1] ?? [];
        self::assertSame(['a' => self::EMAIL, 'type' => 'email_change_avis', 'lien' => null], $avis, 'avis sans lien');
        self::assertSame(self::EMAIL, $this->emailDuProfil($paire['access_token']));
        $retour = $this->suivre($this->dernierLien($nouvelle))->getHeaderLine('Location');
        self::assertStringEndsWith('?type=email_change&status=confirmed', $retour);
        self::assertSame($nouvelle, $this->emailDuProfil($paire['access_token']));
    }

    public function testChangementDEmailVersUneAdressePriseEntreTemps(): void
    {
        $paire = $this->connecter();
        $demande = ['email' => 'bob@exemple.fr', 'password' => self::MOT_DE_PASSE];
        $this->appeler('POST', '/users/me/email', $demande, jeton: $paire['access_token']);
        $this->creerCompte('bob@exemple.fr');

        $retour = $this->suivre($this->dernierLien('bob@exemple.fr', 0))->getHeaderLine('Location');
        self::assertStringEndsWith('status=email_taken', $retour);
    }

    /**
     * @param array<string, string> $corps
     */
    #[DataProvider('changementsDEmailRefuses')]
    public function testChangementDEmailRefuse(array $corps, int $statut, string $code): void
    {
        $paire = $this->connecter();
        $this->creerCompte('bob@exemple.fr');

        $reponse = $this->appeler('POST', '/users/me/email', $corps, jeton: $paire['access_token']);

        self::assertSame($statut, $reponse->getStatusCode());
        self::assertSame($code, $this->code($reponse));
    }

    /** @return iterable<string, array{array<string, string>, int, string}> */
    public static function changementsDEmailRefuses(): iterable
    {
        yield 'même adresse' => [['email' => self::EMAIL, 'password' => self::MOT_DE_PASSE], 400, 'VALIDATION_FAILED'];
        yield 'mauvais mot de passe' => [
            ['email' => 'x@exemple.fr', 'password' => 'mauvais-mdp'],
            401,
            'INVALID_CREDENTIALS',
        ];
        yield 'adresse d’un autre compte' => [
            ['email' => 'bob@exemple.fr', 'password' => self::MOT_DE_PASSE],
            409,
            'EMAIL_ALREADY_USED',
        ];
    }

    public function testLEtatEstPartageEntreDeuxInstances(): void
    {
        $paire = $this->connecter();
        $autre = $this->instance();

        $reponse = $autre->traiter($this->requeteDeRotation($paire['refresh_token']));

        self::assertSame(200, $reponse->getStatusCode());
        self::assertSame(1, $this->service->nombreDeRotations());
    }

    /** @return array{access_token: string, refresh_token: string} */
    private function connecter(string $email = self::EMAIL): array
    {
        if ($this->service->emails($email) === []) {
            $this->creerCompte($email);
        }
        $identifiants = ['email' => $email, 'password' => self::MOT_DE_PASSE];
        $paire = $this->json($this->appeler('POST', '/sessions', $identifiants));
        self::assertIsString($paire['access_token']);
        self::assertIsString($paire['refresh_token']);

        return ['access_token' => $paire['access_token'], 'refresh_token' => $paire['refresh_token']];
    }

    private function instance(): AuthServiceSimule
    {
        return new AuthServiceSimule(
            $this->dossier,
            AuthServiceSimule::configurationDeTest(),
            fn (): int => $this->maintenant,
        );
    }

    private function rafraichir(string $jeton): ResponseInterface
    {
        return $this->service->traiter($this->requeteDeRotation($jeton));
    }

    private function requeteDeRotation(string $jeton): Request
    {
        return $this->requete('POST', '/sessions/refresh', ['refresh_token' => $jeton]);
    }

    private function emailDuProfil(string $jeton): mixed
    {
        return $this->json($this->appeler('GET', '/users/me', jeton: $jeton))['email'];
    }

    private function creerCompte(string $email = self::EMAIL): void
    {
        $this->appeler('POST', '/users', ['email' => $email, 'password' => self::MOT_DE_PASSE]);
        $this->suivre($this->dernierLien($email));
    }

    private function dernierLien(string $email, ?int $rang = null): string
    {
        $liens = array_values(array_filter(array_column($this->service->emails($email), 'lien')));
        self::assertNotEmpty($liens, 'aucun lien envoyé à ' . $email);

        return $liens[$rang ?? count($liens) - 1];
    }

    private function suivre(string $lien, string $methode = 'GET'): ResponseInterface
    {
        return $this->service->traiter(new Request($methode, (string) parse_url($lien, PHP_URL_PATH)));
    }

    /** @return array<string, mixed> */
    private function jwks(): array
    {
        return $this->json($this->appeler('GET', '/.well-known/jwks.json', client: false));
    }

    /** @param array<string, mixed>|null $corps */
    private function appeler(
        string $methode,
        string $chemin,
        ?array $corps = null,
        bool $client = true,
        ?string $jeton = null,
    ): ResponseInterface {
        return $this->service->traiter($this->requete($methode, $chemin, $corps, $client, $jeton));
    }

    /** @param array<string, mixed>|null $corps */
    private function requete(
        string $methode,
        string $chemin,
        ?array $corps = null,
        bool $client = true,
        ?string $jeton = null,
    ): Request {
        $entetes = $client ? ['X-Client-Id' => 'invintory-test', 'X-Client-Secret' => 'secret-de-test'] : [];
        if ($jeton !== null) {
            $entetes['Authorization'] = 'Bearer ' . $jeton;
        }
        if ($corps !== null) {
            $entetes['Content-Type'] = 'application/json';
        }

        $contenu = $corps === null ? null : json_encode($corps, JSON_THROW_ON_ERROR);

        return new Request($methode, $chemin, $entetes, $contenu);
    }

    /** @return array<string, mixed> */
    private function json(ResponseInterface $reponse): array
    {
        $donnees = json_decode((string) $reponse->getBody(), true);
        self::assertIsArray($donnees, (string) $reponse->getBody());

        /** @var array<string, mixed> $donnees */
        return $donnees;
    }

    private function code(ResponseInterface $reponse): mixed
    {
        return $this->json($reponse)['error']['code'] ?? null;
    }
}
