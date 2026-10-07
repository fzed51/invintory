<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Support;

use CaveAVin\Application;
use CaveAVin\Auth\ClientAuthService;
use CaveAVin\Horloge;
use CaveAVin\Tests\Doublure\AuthServiceSimule;
use CaveAVin\Tests\Doublure\GestionnaireSimule;
use Psr\Container\ContainerInterface;
use Psr\Http\Message\ResponseInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * Application complète contre la base de test et la doublure d'auth-service (en processus),
 * avec une horloge pilotable. Les cookies reçus sont conservés et renvoyés, comme un navigateur.
 */
abstract class AuthTestCase extends IntegrationTestCase
{
    protected const MOT_DE_PASSE = 'motdepasse-solide';

    protected AuthServiceSimule $service;
    protected GestionnaireSimule $gestionnaire;
    protected int $maintenant;
    protected string $dossier;

    /** @var array<string, string> cookies du « navigateur » */
    protected array $cookies = [];

    /** @var array<string, true> comptes créés dans la doublure */
    private array $comptes = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->dossier = sys_get_temp_dir() . '/invintory-auth-' . bin2hex(random_bytes(6));
        $this->maintenant = time();
        $this->service = new AuthServiceSimule(
            $this->dossier . '/service',
            AuthServiceSimule::configurationDeTest(),
            fn (): int => $this->maintenant,
        );
        $this->gestionnaire = new GestionnaireSimule($this->service);
        $this->cookies = [];
        $this->comptes = [];

        BaseDeTest::exporterVersApplication();
        $_ENV['AUTH_SERVICE_URL'] = 'https://auth.test';
        $_ENV['AUTH_CLIENT_ID'] = 'invintory-test';
        $_ENV['AUTH_CLIENT_SECRET'] = 'secret-de-test';
        $_ENV['APP_CACHE_DIR'] = $this->dossier . '/cache';
        $_ENV['APP_LOG_FILE'] = $this->dossier . '/api.log';
    }

    protected function tearDown(): void
    {
        BaseDeTest::oublierApplication();
        unset(
            $_ENV['AUTH_SERVICE_URL'],
            $_ENV['AUTH_CLIENT_ID'],
            $_ENV['AUTH_CLIENT_SECRET'],
            $_ENV['APP_CACHE_DIR'],
            $_ENV['APP_LOG_FILE'],
        );
        foreach (glob($this->dossier . '/cache/*') ?: [] as $fichier) {
            unlink($fichier);
        }
        @rmdir($this->dossier . '/cache');
        @unlink($this->dossier . '/api.log');
        AuthServiceSimule::effacer($this->dossier . '/service');
        @rmdir($this->dossier);
    }

    /** @return App<ContainerInterface|null> */
    protected function application(): App
    {
        return Application::creer([
            ClientAuthService::class => ClientAuthService::creer(
                'https://auth.test',
                'invintory-test',
                $_ENV['AUTH_CLIENT_SECRET'] ?? '',
                $this->gestionnaire,
            ),
            Horloge::class => new Horloge(fn (): int => $this->maintenant),
        ]);
    }

    /**
     * @param array<string, mixed>|null $corps
     * @param array<string, string> $entetes
     */
    protected function appeler(
        string $methode,
        string $chemin,
        ?array $corps = null,
        array $entetes = [],
    ): ResponseInterface {
        $requete = (new ServerRequestFactory())->createServerRequest($methode, $chemin)
            ->withCookieParams($this->cookies);
        foreach ($entetes as $nom => $valeur) {
            $requete = $requete->withHeader($nom, $valeur);
        }
        if ($corps !== null) {
            $requete = $requete->withHeader('Content-Type', 'application/json');
            $requete->getBody()->write(json_encode($corps, JSON_THROW_ON_ERROR));
        }

        $reponse = $this->application()->handle($requete);
        foreach ($reponse->getHeader('Set-Cookie') as $cookie) {
            [$nom, $valeur] = explode('=', explode(';', $cookie)[0], 2);
            if (str_contains($cookie, 'Max-Age=0')) {
                unset($this->cookies[$nom]);
            } else {
                $this->cookies[$nom] = $valeur;
            }
        }

        return $reponse;
    }

    /** Crée le compte côté service et se connecte : renvoie le jeton d'accès. */
    protected function connecter(string $email = 'alice@exemple.fr', ?string $appareil = null): string
    {
        if (!isset($this->comptes[$email])) {
            $this->service->creerCompte($email, self::MOT_DE_PASSE);
            $this->comptes[$email] = true;
        }
        $corps = ['email' => $email, 'password' => self::MOT_DE_PASSE];
        if ($appareil !== null) {
            $corps['device'] = $appareil;
        }
        $reponse = $this->appeler('POST', '/api/auth/login', $corps);
        self::assertSame(200, $reponse->getStatusCode(), (string) $reponse->getBody());
        $jeton = $this->json($reponse)['access_token'] ?? null;
        self::assertIsString($jeton);

        return $jeton;
    }

    protected function ticket(): string
    {
        self::assertArrayHasKey('ivt_session', $this->cookies, 'cookie de session absent');

        return $this->cookies['ivt_session'];
    }

    protected function cookie(ResponseInterface $reponse, string $nom): ?string
    {
        foreach ($reponse->getHeader('Set-Cookie') as $cookie) {
            if (str_starts_with($cookie, $nom . '=')) {
                return $cookie;
            }
        }

        return null;
    }

    /** @return array<string, mixed> */
    protected function json(ResponseInterface $reponse): array
    {
        $donnees = json_decode((string) $reponse->getBody(), true);
        self::assertIsArray($donnees, (string) $reponse->getBody());

        /** @var array<string, mixed> $donnees */
        return $donnees;
    }

    protected function codeErreur(ResponseInterface $reponse): mixed
    {
        $erreur = $this->json($reponse)['error'] ?? null;

        return is_array($erreur) ? ($erreur['code'] ?? null) : null;
    }

    /** @return array<string, mixed> première ligne d'une requête sans paramètre */
    protected function ligne(string $sql): array
    {
        $requete = $this->pdo->query($sql);
        self::assertNotFalse($requete);
        $ligne = $requete->fetch();
        self::assertIsArray($ligne, $sql);

        /** @var array<string, mixed> $ligne */
        return $ligne;
    }

    /** @return array<string, string> */
    protected function bearer(string $jeton): array
    {
        return ['Authorization' => 'Bearer ' . $jeton];
    }

    protected function nombreDeSessions(): int
    {
        return (int) $this->valeur('SELECT COUNT(*) FROM user_sessions');
    }
}
