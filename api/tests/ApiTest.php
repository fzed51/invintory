<?php

declare(strict_types=1);

namespace CaveAVin\Tests;

use CaveAVin\Application;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use Psr\Http\Message\ResponseInterface;
use RuntimeException;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;

final class ApiTest extends TestCase
{
    private string $fichierLog;

    protected function setUp(): void
    {
        $this->fichierLog = sys_get_temp_dir() . '/invintory-test-' . uniqid('', true) . '.log';
        $_ENV['APP_LOG_FILE'] = $this->fichierLog;
        unset($_ENV['APP_DEBUG']);
    }

    protected function tearDown(): void
    {
        unset($_ENV['APP_LOG_FILE'], $_ENV['APP_DEBUG']);
        if (is_file($this->fichierLog)) {
            unlink($this->fichierLog);
        }
    }

    public function testGetHealthRepondOk(): void
    {
        $reponse = $this->appeler(Application::creer(), 'GET', '/api/health');

        self::assertSame(200, $reponse->getStatusCode());
        self::assertSame('application/json', $reponse->getHeaderLine('Content-Type'));
        self::assertSame(['status' => 'ok'], $this->corps($reponse));
    }

    public function testHeadHealthRepondSansCorps(): void
    {
        $reponse = $this->appeler(Application::creer(), 'HEAD', '/api/health');

        self::assertSame(200, $reponse->getStatusCode());
        self::assertSame('', (string) $reponse->getBody());
    }

    public function testUrlInconnueRenvoieEnveloppe404(): void
    {
        $reponse = $this->appeler(Application::creer(), 'GET', '/api/inconnue');

        self::assertSame(404, $reponse->getStatusCode());
        self::assertSame('application/json', $reponse->getHeaderLine('Content-Type'));
        self::assertSame('NOT_FOUND', $this->corps($reponse)['error']['code'] ?? null);
    }

    public function testMethodeNonAutoriseeRenvoieEnveloppe405(): void
    {
        $reponse = $this->appeler(Application::creer(), 'POST', '/api/health');

        self::assertSame(405, $reponse->getStatusCode());
        self::assertSame('GET', $reponse->getHeaderLine('Allow'));
        self::assertSame('METHOD_NOT_ALLOWED', $this->corps($reponse)['error']['code'] ?? null);
    }

    public function testErreurInterneCacheLeDetailEtLeJournalise(): void
    {
        $app = Application::creer();
        $app->get('/boom', function (): never {
            throw new RuntimeException('detail-secret');
        });

        $reponse = $this->appeler($app, 'GET', '/api/boom');

        self::assertSame(500, $reponse->getStatusCode());
        self::assertSame('INTERNAL_ERROR', $this->corps($reponse)['error']['code'] ?? null);
        self::assertStringNotContainsString('detail-secret', (string) $reponse->getBody());
        self::assertStringContainsString('detail-secret', (string) file_get_contents($this->fichierLog));
    }

    public function testErreurInterneExposeLeDetailEnDebug(): void
    {
        $_ENV['APP_DEBUG'] = 'true';
        $app = Application::creer();
        $app->get('/boom', function (): never {
            throw new RuntimeException('detail-secret');
        });

        $reponse = $this->appeler($app, 'GET', '/api/boom');

        self::assertSame('detail-secret', $this->corps($reponse)['error']['message'] ?? null);
    }

    /** @param App<ContainerInterface|null> $app */
    private function appeler(App $app, string $methode, string $chemin): ResponseInterface
    {
        return $app->handle((new ServerRequestFactory())->createServerRequest($methode, $chemin));
    }

    /** @return array<string, mixed> */
    private function corps(ResponseInterface $reponse): array
    {
        $donnees = json_decode((string) $reponse->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($donnees);

        /** @var array<string, mixed> $donnees */
        return $donnees;
    }
}
