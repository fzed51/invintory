<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Http;

use CaveAVin\Application;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

/** POST /api/internal/migrate refusé sans le bon X-Deploy-Token (aucun accès à la base). */
final class MigrationRouteTest extends TestCase
{
    protected function tearDown(): void
    {
        unset($_ENV['DEPLOY_TOKEN']);
    }

    /** @param array<string, string> $entetes */
    #[DataProvider('appelsRefuses')]
    public function testRefuseSansLeBonJeton(?string $jetonConfigure, array $entetes): void
    {
        if ($jetonConfigure !== null) {
            $_ENV['DEPLOY_TOKEN'] = $jetonConfigure;
        }
        $requete = (new ServerRequestFactory())->createServerRequest('POST', '/api/internal/migrate');
        foreach ($entetes as $nom => $valeur) {
            $requete = $requete->withHeader($nom, $valeur);
        }

        $reponse = Application::creer()->handle($requete);

        self::assertSame(401, $reponse->getStatusCode());
        self::assertSame('application/json', $reponse->getHeaderLine('Content-Type'));
        self::assertSame(
            ['error' => ['code' => 'INVALID_DEPLOY_TOKEN', 'message' => 'Jeton de déploiement absent ou invalide.']],
            json_decode((string) $reponse->getBody(), true),
        );
    }

    /** @return iterable<string, array{?string, array<string, string>}> */
    public static function appelsRefuses(): iterable
    {
        yield 'sans en-tête' => ['jeton-secret', []];
        yield 'en-tête vide' => ['jeton-secret', ['X-Deploy-Token' => '']];
        yield 'mauvais jeton' => ['jeton-secret', ['X-Deploy-Token' => 'jeton-faux']];
        yield 'préfixe du bon jeton' => ['jeton-secret', ['X-Deploy-Token' => 'jeton']];
        yield 'jeton non configuré, en-tête vide' => [null, ['X-Deploy-Token' => '']];
        yield 'jeton non configuré, en-tête quelconque' => [null, ['X-Deploy-Token' => 'x']];
    }

    public function testGetNEstPasAutorise(): void
    {
        $_ENV['DEPLOY_TOKEN'] = 'jeton-secret';
        $requete = (new ServerRequestFactory())->createServerRequest('GET', '/api/internal/migrate')
            ->withHeader('X-Deploy-Token', 'jeton-secret');

        self::assertSame(405, Application::creer()->handle($requete)->getStatusCode());
    }
}
