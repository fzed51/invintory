<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration;

use CaveAVin\Application;
use CaveAVin\Tests\Support\BaseDeTest;
use CaveAVin\Tests\Support\IntegrationTestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

/** POST /api/internal/migrate avec le bon jeton, contre la base de test. */
final class MigrationRouteTest extends IntegrationTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        BaseDeTest::supprimerTables($this->pdo);
        BaseDeTest::exporterVersApplication();
        $_ENV['DEPLOY_TOKEN'] = 'jeton-secret';
    }

    protected function tearDown(): void
    {
        BaseDeTest::oublierApplication();
        unset($_ENV['DEPLOY_TOKEN']);
    }

    public function testMigreEtListeLesFichiersExecutes(): void
    {
        $reponse = $this->migrer();

        self::assertSame(200, $reponse->getStatusCode());
        self::assertSame('application/json', $reponse->getHeaderLine('Content-Type'));
        $corps = json_decode((string) $reponse->getBody(), true);
        self::assertIsArray($corps);
        self::assertIsArray($corps['executees']);
        self::assertCount(11, $corps['executees']);
        self::assertSame('mysql/20261002-01-creer-users.sql', $corps['executees'][0]);
        self::assertSame(11, (int) $this->valeur('SELECT COUNT(*) FROM migration_story'));
    }

    public function testUneRelanceNExecuteRien(): void
    {
        $this->migrer();

        $reponse = $this->migrer();

        self::assertSame(200, $reponse->getStatusCode());
        self::assertSame(['executees' => []], json_decode((string) $reponse->getBody(), true));
    }

    private function migrer(): ResponseInterface
    {
        $requete = (new ServerRequestFactory())->createServerRequest('POST', '/api/internal/migrate')
            ->withHeader('X-Deploy-Token', 'jeton-secret');

        return Application::creer()->handle($requete);
    }
}
