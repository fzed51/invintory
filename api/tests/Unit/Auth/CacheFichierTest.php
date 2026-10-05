<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Unit\Auth;

use CaveAVin\Cache\CacheFichier;
use DateInterval;
use PHPUnit\Framework\TestCase;
use Psr\SimpleCache\InvalidArgumentException;

final class CacheFichierTest extends TestCase
{
    private string $dossier;
    private int $maintenant = 1_800_000_000;
    private CacheFichier $cache;

    protected function setUp(): void
    {
        $this->dossier = sys_get_temp_dir() . '/cache-' . bin2hex(random_bytes(6)) . '/sous-dossier';
        $this->cache = new CacheFichier($this->dossier, fn (): int => $this->maintenant);
    }

    protected function tearDown(): void
    {
        $this->cache->clear();
        @rmdir($this->dossier);
        @rmdir(dirname($this->dossier));
    }

    public function testRestitueUneValeurEtCreeLeDossier(): void
    {
        self::assertTrue($this->cache->set('auth-service.jwks', ['keys' => [['kid' => 'k1']]]));

        self::assertSame(['keys' => [['kid' => 'k1']]], $this->cache->get('auth-service.jwks'));
        self::assertTrue($this->cache->has('auth-service.jwks'));
        self::assertDirectoryExists($this->dossier);
    }

    public function testValeurParDefautSiAbsente(): void
    {
        self::assertSame('défaut', $this->cache->get('absente', 'défaut'));
        self::assertFalse($this->cache->has('absente'));
    }

    public function testUneValeurExpireApresSaDureeDeVie(): void
    {
        $this->cache->set('a', 1, 3600);
        $this->cache->set('b', 2, new DateInterval('PT10S'));
        $this->maintenant += 3599;

        self::assertSame(1, $this->cache->get('a'));
        self::assertNull($this->cache->get('b'));

        $this->maintenant += 1;
        self::assertNull($this->cache->get('a'));
    }

    public function testUneDureeNulleOuNegativeSupprime(): void
    {
        $this->cache->set('a', 1);
        $this->cache->set('a', 2, 0);

        self::assertFalse($this->cache->has('a'));
    }

    public function testSupprimerEtVider(): void
    {
        $this->cache->setMultiple(['a' => 1, 'b' => 2, 'c' => 3]);

        $this->cache->delete('a');
        self::assertSame(['a' => null, 'b' => 2], $this->cache->getMultiple(['a', 'b']));

        $this->cache->deleteMultiple(['b']);
        self::assertFalse($this->cache->has('b'));

        $this->cache->clear();
        self::assertFalse($this->cache->has('c'));
    }

    public function testUnFichierCorrompuEstUneAbsence(): void
    {
        $this->cache->set('a', 1);
        foreach (glob($this->dossier . '/*') ?: [] as $fichier) {
            file_put_contents($fichier, 'pas du php sérialisé');
        }

        self::assertSame('défaut', $this->cache->get('a', 'défaut'));
    }

    public function testRefuseUneCleInvalide(): void
    {
        $this->expectException(InvalidArgumentException::class);

        $this->cache->get('a/b');
    }
}
