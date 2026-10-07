<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Auth;

use CaveAVin\Tests\Support\AuthTestCase;
use GuzzleHttp\Psr7\Request;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * GET /api/auth/callback (= redirect_uri) et nouveau mot de passe (intégration §2.1, §2.5,
 * §2.6, §3.5) : le reset_token est consommé côté serveur et retiré de l'URL.
 */
final class CallbackTest extends AuthTestCase
{
    /** @return iterable<string, array{string, string}> */
    public static function couplesConnus(): iterable
    {
        foreach (['user_registration', 'password_reset', 'email_change'] as $type) {
            foreach (['confirmed', 'already_confirmed', 'expired'] as $statut) {
                yield "$type / $statut" => [$type, $statut];
            }
        }
        yield 'email_change / email_taken' => ['email_change', 'email_taken'];
    }

    #[DataProvider('couplesConnus')]
    public function testRedirigeVersLaPageDeRetourDeLaPwa(string $type, string $statut): void
    {
        $reponse = $this->appeler('GET', "/api/auth/callback?type=$type&status=$statut");

        self::assertSame(302, $reponse->getStatusCode());
        self::assertSame("/auth/return?type=$type&status=$statut", $reponse->getHeaderLine('Location'));
        self::assertSame('no-referrer', $reponse->getHeaderLine('Referrer-Policy'));
        self::assertSame('no-store', $reponse->getHeaderLine('Cache-Control'));
        self::assertSame('', (string) $reponse->getBody(), 'aucune page, donc aucune ressource tierce');
    }

    /** @return iterable<string, array{string}> */
    public static function requetesInconnues(): iterable
    {
        yield 'sans paramètre' => [''];
        yield 'type inconnu' => ['?type=autre&status=confirmed'];
        yield 'statut propre à un autre type' => ['?type=user_registration&status=email_taken'];
        yield 'injection' => ['?type=user_registration&status=confirmed%26x%3D1'];
    }

    #[DataProvider('requetesInconnues')]
    public function testCoupleInconnu(string $requete): void
    {
        $reponse = $this->appeler('GET', '/api/auth/callback' . $requete);

        self::assertSame('/auth/return?type=unknown', $reponse->getHeaderLine('Location'));
    }

    public function testLeResetTokenPasseEnCookieEtQuitteLUrl(): void
    {
        $requete = '?type=password_reset&status=confirmed&reset_token=jeton-secret';
        $reponse = $this->appeler('GET', '/api/auth/callback' . $requete);

        self::assertSame('/auth/return?type=password_reset&status=confirmed', $reponse->getHeaderLine('Location'));
        self::assertSame(
            'ivt_reinit=jeton-secret; Path=/api/auth/password; Max-Age=900; Secure; HttpOnly; SameSite=Strict',
            $this->cookie($reponse, 'ivt_reinit'),
        );
    }

    public function testUnResetTokenHorsDuCoupleConfirmeEstIgnore(): void
    {
        $reponse = $this->appeler('GET', '/api/auth/callback?type=user_registration&status=confirmed&reset_token=x');

        self::assertNull($this->cookie($reponse, 'ivt_reinit'));
        self::assertSame('/auth/return?type=user_registration&status=confirmed', $reponse->getHeaderLine('Location'));
    }

    public function testParcoursCompletDeReinitialisation(): void
    {
        $this->connecter();
        $this->appeler('POST', '/api/auth/password/forgot', ['email' => 'alice@exemple.fr']);
        $emails = $this->service->emails('alice@exemple.fr');
        $lien = (string) ($emails[count($emails) - 1]['lien'] ?? '');
        // Le navigateur suit le lien, clique le bouton, puis auth-service le renvoie chez nous.
        $clic = $this->service->traiter(new Request('POST', (string) parse_url($lien, PHP_URL_PATH)));
        $retour = $clic->getHeaderLine('Location');
        $this->appeler('GET', '/api/auth/callback?' . parse_url($retour, PHP_URL_QUERY));

        $reponse = $this->appeler('POST', '/api/auth/password/reset', ['password' => 'nouveau-mot-de-passe']);

        self::assertSame(204, $reponse->getStatusCode());
        $cookie = (string) $this->cookie($reponse, 'ivt_reinit');
        self::assertStringContainsString('ivt_reinit=; Path=/api/auth/password; Max-Age=0', $cookie);
        self::assertSame(200, $this->appeler('POST', '/api/auth/login', [
            'email' => 'alice@exemple.fr',
            'password' => 'nouveau-mot-de-passe',
        ])->getStatusCode());
    }

    public function testNouveauMotDePasseSansCookie(): void
    {
        $reponse = $this->appeler('POST', '/api/auth/password/reset', ['password' => 'nouveau-mot-de-passe']);

        self::assertSame(400, $reponse->getStatusCode());
        self::assertSame('RESET_TOKEN_INVALID', $this->codeErreur($reponse));
        self::assertSame([], $this->gestionnaire->requetes);
    }

    public function testNouveauMotDePasseAvecUnJetonRefuseEffaceLeCookie(): void
    {
        $this->cookies['ivt_reinit'] = 'jeton-inconnu';

        $reponse = $this->appeler('POST', '/api/auth/password/reset', ['password' => 'nouveau-mot-de-passe']);

        self::assertSame('RESET_TOKEN_INVALID', $this->codeErreur($reponse));
        self::assertStringContainsString('Max-Age=0', (string) $this->cookie($reponse, 'ivt_reinit'));
    }

    public function testNouveauMotDePasseSansMotDePasse(): void
    {
        $this->cookies['ivt_reinit'] = 'jeton';

        $reponse = $this->appeler('POST', '/api/auth/password/reset', []);

        self::assertSame('VALIDATION_FAILED', $this->codeErreur($reponse));
    }
}
