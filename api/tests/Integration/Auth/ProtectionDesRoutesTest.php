<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Auth;

use CaveAVin\Tests\Support\AuthTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Middleware d'authentification : toute route exige un Bearer valide, sauf la liste
 * explicite des routes publiques. Testé sur ce qu'il refuse ET sur ce qu'il laisse passer.
 */
final class ProtectionDesRoutesTest extends AuthTestCase
{
    /** @return iterable<string, array{string, string}> */
    public static function routesProtegees(): iterable
    {
        yield 'GET appareils' => ['GET', '/api/auth/devices'];
        yield 'HEAD appareils' => ['HEAD', '/api/auth/devices'];
        yield 'DELETE appareil' => ['DELETE', '/api/auth/devices/1'];
        yield 'GET compte' => ['GET', '/api/account'];
        yield 'HEAD compte' => ['HEAD', '/api/account'];
        yield 'POST compte/email' => ['POST', '/api/account/email'];
    }

    #[DataProvider('routesProtegees')]
    public function testSansJetonRefuse(string $methode, string $chemin): void
    {
        $reponse = $this->appeler($methode, $chemin);

        self::assertSame(401, $reponse->getStatusCode());
        self::assertSame('Bearer', $reponse->getHeaderLine('WWW-Authenticate'));
        if ($methode !== 'HEAD') {
            self::assertSame(
                ['error' => ['code' => 'INVALID_ACCESS_TOKEN', 'message' => 'Jeton d’accès absent ou invalide.']],
                $this->json($reponse),
            );
        }
    }

    /** @param array<string, string> $entetes */
    #[DataProvider('jetonsRefuses')]
    public function testJetonRefuse(array $entetes): void
    {
        $this->connecter();

        self::assertSame(401, $this->appeler('GET', '/api/auth/devices', null, $entetes)->getStatusCode());
    }

    /** @return iterable<string, array{array<string, string>}> */
    public static function jetonsRefuses(): iterable
    {
        yield 'schéma autre que Bearer' => [['Authorization' => 'Basic YWxpY2U6c2VjcmV0']];
        yield 'Bearer vide' => [['Authorization' => 'Bearer ']];
        yield 'jeton illisible' => [['Authorization' => 'Bearer abc.def.ghi']];
    }

    public function testJetonExpire(): void
    {
        $this->connecter();
        $sub = $this->valeur('SELECT auth_sub FROM users');
        $jeton = $this->service->emettreJeton(['sub' => $sub, 'exp' => time() - 120]);

        $reponse = $this->appeler('GET', '/api/auth/devices', null, $this->bearer($jeton));

        self::assertSame(401, $reponse->getStatusCode());
    }

    public function testJetonValideDUnUtilisateurInconnuDeLaCave(): void
    {
        $jeton = $this->service->emettreJeton(['sub' => '11111111-1111-4111-8111-111111111111']);

        $reponse = $this->appeler('GET', '/api/account', null, $this->bearer($jeton));

        self::assertSame(401, $reponse->getStatusCode());
    }

    public function testJetonValideAccepte(): void
    {
        $jeton = $this->connecter();

        $reponse = $this->appeler('GET', '/api/auth/devices', null, $this->bearer($jeton));

        self::assertSame(200, $reponse->getStatusCode());
    }

    /** @return iterable<string, array{string, string}> */
    public static function routesPubliques(): iterable
    {
        yield 'GET santé' => ['GET', '/api/health'];
        yield 'HEAD santé' => ['HEAD', '/api/health'];
        yield 'callback' => ['GET', '/api/auth/callback?type=user_registration&status=confirmed'];
        yield 'déconnexion' => ['POST', '/api/auth/logout'];
        yield 'rafraîchir' => ['POST', '/api/auth/refresh'];
        yield 'connexion' => ['POST', '/api/auth/login'];
        yield 'inscription' => ['POST', '/api/auth/register'];
        yield 'renvoi du lien' => ['POST', '/api/auth/register/resend'];
        yield 'mot de passe oublié' => ['POST', '/api/auth/password/forgot'];
        yield 'nouveau mot de passe' => ['POST', '/api/auth/password/reset'];
        yield 'migration (jeton propre)' => ['POST', '/api/internal/migrate'];
    }

    #[DataProvider('routesPubliques')]
    public function testRoutePubliqueSansJeton(string $methode, string $chemin): void
    {
        $reponse = $this->appeler($methode, $chemin);

        $corps = json_decode((string) $reponse->getBody(), true);
        self::assertNotSame('INVALID_ACCESS_TOKEN', is_array($corps) ? ($corps['error']['code'] ?? null) : null);
        self::assertSame('', $reponse->getHeaderLine('WWW-Authenticate'));
    }

    public function testUneRouteInconnueResteUn404(): void
    {
        self::assertSame(404, $this->appeler('GET', '/api/inconnue')->getStatusCode());
    }

    /** @return iterable<string, array{string, string}> */
    public static function anciensCheminsFrancais(): iterable
    {
        yield 'connexion' => ['POST', '/api/auth/connexion'];
        yield 'rafraichir' => ['POST', '/api/auth/rafraichir'];
        yield 'deconnexion' => ['POST', '/api/auth/deconnexion'];
        yield 'inscription' => ['POST', '/api/auth/inscription'];
        yield 'renvoi' => ['POST', '/api/auth/inscription/renvoi'];
        yield 'oubli' => ['POST', '/api/auth/mot-de-passe/oubli'];
        yield 'nouveau' => ['POST', '/api/auth/mot-de-passe/nouveau'];
        yield 'appareils' => ['GET', '/api/auth/appareils'];
        yield 'compte' => ['GET', '/api/compte'];
    }

    /** Chemins d'API en anglais (P29) : les noms français de l'étape 2 n'existent plus. */
    #[DataProvider('anciensCheminsFrancais')]
    public function testLesAnciensCheminsFrancaisNExistentPlus(string $methode, string $chemin): void
    {
        $jeton = $this->connecter();

        self::assertSame(404, $this->appeler($methode, $chemin, null, $this->bearer($jeton))->getStatusCode());
    }
}
