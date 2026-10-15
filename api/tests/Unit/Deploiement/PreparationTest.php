<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Unit\Deploiement;

use Deploiement\Preparation;
use Dotenv\Dotenv;
use FilesystemIterator;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;

final class PreparationTest extends TestCase
{
    private string $dossier;

    protected function setUp(): void
    {
        $this->dossier = sys_get_temp_dir() . '/invintory-preparation-' . bin2hex(random_bytes(6));
        mkdir($this->dossier);
    }

    protected function tearDown(): void
    {
        $this->supprimer($this->dossier);
    }

    public function testNEnvoieQueLeCodeNecessaireALApi(): void
    {
        $this->ecrire('depot/api/bootstrap.php');
        $this->ecrire('depot/api/container.php');
        $this->ecrire('depot/api/router.php');
        $this->ecrire('depot/api/CaveAVin/Application.php');
        $this->ecrire('depot/api/migrations/mysql/20261002-01-creer-users.sql');
        $this->ecrire('depot/api/vendor/autoload.php');
        foreach (
            [
                'tests/Unit/UnTest.php', 'phpunit.xml', 'phpcs.xml', 'phpstan.neon',
                'composer.json', 'composer.lock', 'php_errors.log', '.phpunit.cache/test-results',
            ] as $developpement
        ) {
            $this->ecrire('depot/api/' . $developpement);
        }
        $this->ecrire('depot/dist/index.html');
        $this->ecrire('depot/dist/api/index.php');

        $this->preparation()->preparer();

        self::assertSame(
            [
                'api/CaveAVin/Application.php',
                'api/bootstrap.php',
                'api/container.php',
                'api/migrations/mysql/20261002-01-creer-users.sql',
                'api/router.php',
                'api/vendor/autoload.php',
                'dist/api/index.php',
                'dist/index.html',
            ],
            $this->fichiers($this->dossier . '/envoi'),
        );
    }

    public function testRecopieTousLesFichiersDeDistDontLesFichiersCaches(): void
    {
        $this->ecrireApi();
        $this->ecrire('depot/dist/index.html');
        $this->ecrire('depot/dist/.htaccess', 'RewriteEngine On');
        $this->ecrire('depot/dist/api/index.php');
        $this->ecrire('depot/dist/assets/index-abc.js');

        $this->preparation()->preparer();

        self::assertSame(
            ['dist/.htaccess', 'dist/api/index.php', 'dist/assets/index-abc.js', 'dist/index.html'],
            array_values(array_filter(
                $this->fichiers($this->dossier . '/envoi'),
                static fn (string $chemin): bool => str_starts_with($chemin, 'dist/'),
            )),
        );
        self::assertSame('RewriteEngine On', file_get_contents($this->dossier . '/envoi/dist/.htaccess'));
    }

    public function testVideLEnvoiDUnePreparationPrecedente(): void
    {
        $this->ecrireApi();
        $this->ecrireDist();
        $this->ecrire('envoi/dist/ancien-fichier.js');

        $this->preparation()->preparer();

        self::assertNotContains('dist/ancien-fichier.js', $this->fichiers($this->dossier . '/envoi'));
    }

    public function testRefuseUnDepotSansDistConstruit(): void
    {
        $this->ecrireApi();

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('dist/index.html introuvable');

        $this->preparation()->preparer();
    }

    public function testRefuseUnDepotSansLeCodeDeLApi(): void
    {
        $this->ecrireDist();

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('api/bootstrap.php introuvable');

        $this->preparation()->preparer();
    }

    public function testEcritLeEnvDeProductionALaRacineDeLEnvoi(): void
    {
        $this->ecrireApi();
        $this->ecrireDist();

        $this->preparation()->preparer();
        $this->preparation()->ecrireEnv($this->variables());

        self::assertFileExists($this->dossier . '/envoi/.env');
        $lu = Dotenv::parse((string) file_get_contents($this->dossier . '/envoi/.env'));
        self::assertSame('false', $lu['APP_DEBUG']);
        self::assertSame('db.exemple.fr', $lu['DB_HOST']);
        self::assertSame('https://auth.exemple.fr', $lu['AUTH_SERVICE_URL']);
    }

    public function testLeEnvRestitueExactementLesValeursSpeciales(): void
    {
        $valeurs = ['p$ss "mot" #1 \\ \'x\' ${DB_HOST} =', 'fin\\', 'a b  c', 'é€ü'];
        foreach ($valeurs as $valeur) {
            $contenu = Preparation::contenuEnv($this->variables(['DB_PASSWORD' => $valeur]));

            self::assertSame($valeur, Dotenv::parse($contenu)['DB_PASSWORD'], $valeur);
        }
    }

    public function testLePortDeLaBaseVaut3306ParDefaut(): void
    {
        $variables = $this->variables();
        unset($variables['DB_PORT']);

        self::assertSame('3306', Dotenv::parse(Preparation::contenuEnv($variables))['DB_PORT']);
    }

    public function testUnPortVideVautAussi3306(): void
    {
        // GitHub Actions transmet « vide » une variable non définie.
        $contenu = Preparation::contenuEnv($this->variables(['DB_PORT' => '']));

        self::assertSame('3306', Dotenv::parse($contenu)['DB_PORT']);
    }

    public function testRefuseUneVariableAbsenteOuVideSansDivulguerLesValeurs(): void
    {
        foreach (['absente', 'vide'] as $cas) {
            $variables = $this->variables();
            if ($cas === 'absente') {
                unset($variables['AUTH_CLIENT_SECRET']);
            } else {
                $variables['AUTH_CLIENT_SECRET'] = '';
            }

            try {
                Preparation::contenuEnv($variables);
                self::fail('Une variable ' . $cas . ' doit être refusée.');
            } catch (InvalidArgumentException $e) {
                self::assertStringContainsString('AUTH_CLIENT_SECRET', $e->getMessage());
                self::assertStringNotContainsString('mdp-de-test', $e->getMessage());
            }
        }
    }

    public function testRefuseUneValeurSurPlusieursLignes(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('DB_PASSWORD');

        Preparation::contenuEnv($this->variables(['DB_PASSWORD' => "a\nAPP_DEBUG=true"]));
    }

    public function testIgnoreLesVariablesInconnuesDeLEnvironnement(): void
    {
        $contenu = Preparation::contenuEnv($this->variables(['PATH' => '/usr/bin', 'APP_DEBUG' => 'true']));

        self::assertStringNotContainsString('PATH', $contenu);
        self::assertSame('false', Dotenv::parse($contenu)['APP_DEBUG']);
    }

    private function preparation(): Preparation
    {
        return new Preparation($this->dossier . '/depot', $this->dossier . '/envoi');
    }

    /**
     * @param array<string, string> $surcharges
     * @return array<string, string>
     */
    private function variables(array $surcharges = []): array
    {
        return $surcharges + [
            'DB_HOST' => 'db.exemple.fr',
            'DB_PORT' => '3306',
            'DB_NAME' => 'invintory',
            'DB_USER' => 'invintory',
            'DB_PASSWORD' => 'mdp-de-test',
            'DEPLOY_TOKEN' => 'jeton-de-test',
            'AUTH_SERVICE_URL' => 'https://auth.exemple.fr',
            'AUTH_CLIENT_ID' => 'invintory',
            'AUTH_CLIENT_SECRET' => 'secret-de-test',
        ];
    }

    private function ecrireApi(): void
    {
        $fichiers = [
            'bootstrap.php', 'container.php', 'router.php', 'CaveAVin/Application.php',
            'migrations/mysql/1.sql', 'vendor/autoload.php',
        ];
        foreach ($fichiers as $fichier) {
            $this->ecrire('depot/api/' . $fichier);
        }
    }

    private function ecrireDist(): void
    {
        $this->ecrire('depot/dist/index.html');
        $this->ecrire('depot/dist/api/index.php');
    }

    private function ecrire(string $chemin, string $contenu = 'x'): void
    {
        $complet = $this->dossier . '/' . $chemin;
        if (!is_dir(dirname($complet))) {
            mkdir(dirname($complet), 0777, true);
        }
        file_put_contents($complet, $contenu);
    }

    /** @return list<string> chemins relatifs triés, hors .env */
    private function fichiers(string $racine): array
    {
        $liste = [];
        $parcours = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($racine, FilesystemIterator::SKIP_DOTS),
        );
        foreach ($parcours as $fichier) {
            $chemin = str_replace('\\', '/', substr((string) $fichier, strlen($racine) + 1));
            if ($chemin !== '.env') {
                $liste[] = $chemin;
            }
        }
        sort($liste);

        return $liste;
    }

    private function supprimer(string $chemin): void
    {
        if (!is_dir($chemin)) {
            return;
        }
        foreach (scandir($chemin) ?: [] as $nom) {
            if ($nom === '.' || $nom === '..') {
                continue;
            }
            $element = $chemin . '/' . $nom;
            is_dir($element) && !is_link($element) ? $this->supprimer($element) : unlink($element);
        }
        rmdir($chemin);
    }
}
