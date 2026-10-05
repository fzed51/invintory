<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Unit\Auth;

use CaveAVin\Auth\ClientAuthService;
use CaveAVin\Auth\JetonInvalide;
use CaveAVin\Auth\VerificateurDeJeton;
use CaveAVin\Cache\CacheFichier;
use CaveAVin\Tests\Doublure\AuthServiceSimule;
use CaveAVin\Tests\Doublure\GestionnaireSimule;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Vérification locale de l'access token (intégration §3.3, Arch §2.3). */
final class VerificateurDeJetonTest extends TestCase
{
    private const SUB = '0b6f1c2e-8a4d-4c39-9b1e-5f2a7d3c9e10';

    private string $dossier;
    private AuthServiceSimule $service;
    private GestionnaireSimule $gestionnaire;
    private CacheFichier $cache;

    protected function setUp(): void
    {
        $this->dossier = sys_get_temp_dir() . '/auth-simule-' . bin2hex(random_bytes(6));
        $this->service = new AuthServiceSimule($this->dossier, AuthServiceSimule::configurationDeTest());
        $this->gestionnaire = new GestionnaireSimule($this->service);
        $this->cache = new CacheFichier($this->dossier . '/cache');
    }

    protected function tearDown(): void
    {
        $this->cache->clear();
        @rmdir($this->dossier . '/cache');
        AuthServiceSimule::effacer($this->dossier);
    }

    public function testUnJetonValideDonneLeSub(): void
    {
        $jeton = $this->service->emettreJeton(['sub' => self::SUB]);

        self::assertSame(self::SUB, $this->verificateur()->verifier($jeton));
    }

    public function testLeJwksEstMisEnCache(): void
    {
        $verificateur = $this->verificateur();
        $verificateur->verifier($this->service->emettreJeton());
        $verificateur->verifier($this->service->emettreJeton());

        self::assertCount(1, $this->appelsJwks());
    }

    /** @param array<string, mixed> $claims */
    #[DataProvider('jetonsRefuses')]
    public function testRefuse(array $claims): void
    {
        $this->expectException(JetonInvalide::class);

        $this->verificateur()->verifier($this->service->emettreJeton($claims));
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function jetonsRefuses(): iterable
    {
        yield 'expiré au-delà de la tolérance de 60 s' => [['exp' => time() - 61]];
        yield 'émis pour une autre application (aud)' => [['aud' => 'autre-application']];
        yield 'émetteur inattendu (iss)' => [['iss' => 'https://pirate.test']];
        yield 'sub absent' => [['sub' => null]];
    }

    public function testToleranceDHorlogeDe60Secondes(): void
    {
        $jeton = $this->service->emettreJeton(['exp' => time() - 30, 'iat' => time() + 30]);

        self::assertSame('00000000-0000-4000-8000-000000000000', $this->verificateur()->verifier($jeton));
    }

    public function testSignatureFalsifiee(): void
    {
        [$entete, , $signature] = explode('.', $this->service->emettreJeton());
        $charge = rtrim(strtr(base64_encode((string) json_encode([
            'iss' => 'https://auth.test',
            'sub' => self::SUB,
            'aud' => 'invintory-test',
            'iat' => time(),
            'exp' => time() + 900,
        ])), '+/', '-_'), '=');

        $this->expectException(JetonInvalide::class);
        $this->verificateur()->verifier("$entete.$charge.$signature");
    }

    public function testJetonMalForme(): void
    {
        $this->expectException(JetonInvalide::class);

        $this->verificateur()->verifier('pas-un-jwt');
    }

    public function testKidInconnuRetelechargeLeJwksUneFois(): void
    {
        $verificateur = $this->verificateur();
        $verificateur->verifier($this->service->emettreJeton());
        $this->service->tournerCle();

        self::assertSame(self::SUB, $verificateur->verifier($this->service->emettreJeton(['sub' => self::SUB])));
        self::assertCount(2, $this->appelsJwks());
    }

    public function testKidToujoursInconnuApresRetelechargement(): void
    {
        $verificateur = $this->verificateur();
        $verificateur->verifier($this->service->emettreJeton());

        try {
            $verificateur->verifier($this->service->emettreJeton([], 'kid-inconnu'));
            self::fail('JetonInvalide attendu');
        } catch (JetonInvalide) {
            self::assertCount(2, $this->appelsJwks());
        }
    }

    public function testJwksInjoignable(): void
    {
        $verificateur = $this->verificateur(new MockHandler([new Response(503)]));

        $this->expectException(JetonInvalide::class);
        $verificateur->verifier($this->service->emettreJeton());
    }

    /** @return list<mixed> */
    private function appelsJwks(): array
    {
        return array_values(array_filter(
            $this->gestionnaire->requetes,
            static fn ($requete): bool => $requete->getUri()->getPath() === '/.well-known/jwks.json',
        ));
    }

    private function verificateur(?callable $gestionnaire = null): VerificateurDeJeton
    {
        $client = ClientAuthService::creer(
            'https://auth.test',
            'invintory-test',
            'secret-de-test',
            $gestionnaire ?? $this->gestionnaire,
        );

        return new VerificateurDeJeton($client, $this->cache, 'https://auth.test', 'invintory-test');
    }
}
