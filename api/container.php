<?php

declare(strict_types=1);

use CaveAVin\Auth\ClientAuthService;
use CaveAVin\Auth\VerificateurDeJeton;
use CaveAVin\Cache\CacheFichier;
use CaveAVin\Donnees\Connexion;
use CaveAVin\Environnement;
use CaveAVin\Horloge;
use CaveAVin\Journal;
use CaveAVin\Migration\Migrateur;
use DI\Container;
use DI\ContainerBuilder;
use Psr\SimpleCache\CacheInterface;

$construire = /** @param array<string, mixed> $surcharges définitions remplacées (tests) */ function (
    array $surcharges = [],
): Container {
    $constructeur = new ContainerBuilder();
    // Hors webroot : api/ et dist/ sont frères, ces dossiers vivent à la racine du projet.
    $racine = dirname(__DIR__);

    $constructeur->addDefinitions([
        // Connexion MySQL, résolue à la demande : GET /health ne touche pas la base.
        PDO::class => fn (): PDO => Connexion::ouvrir(
            Environnement::lire('DB_HOST', 'localhost'),
            Environnement::lire('DB_PORT', '3306'),
            Environnement::lire('DB_NAME'),
            Environnement::lire('DB_USER'),
            Environnement::lire('DB_PASSWORD'),
        ),
        Migrateur::class => fn (PDO $pdo): Migrateur => new Migrateur($pdo, __DIR__ . '/migrations'),
        Horloge::class => fn (): Horloge => new Horloge(),
        Journal::class => fn (): Journal => new Journal(Environnement::lire('APP_LOG_FILE', $racine . '/logs/api.log')),
        // Cache du JWKS : fichiers, pas d'APCu sur le mutualisé.
        CacheInterface::class => fn (): CacheInterface => new CacheFichier(
            Environnement::lire('APP_CACHE_DIR', $racine . '/cache'),
        ),
        ClientAuthService::class => fn (): ClientAuthService => ClientAuthService::creer(
            Environnement::lire('AUTH_SERVICE_URL'),
            Environnement::lire('AUTH_CLIENT_ID'),
            Environnement::lire('AUTH_CLIENT_SECRET'),
        ),
        // iss attendu = URL du service, aud attendu = notre client_id (Arch §2.3).
        VerificateurDeJeton::class => fn (ClientAuthService $client, CacheInterface $cache): VerificateurDeJeton
            => new VerificateurDeJeton(
                $client,
                $cache,
                Environnement::lire('AUTH_SERVICE_URL'),
                Environnement::lire('AUTH_CLIENT_ID'),
            ),
    ]);
    $constructeur->addDefinitions($surcharges);

    return $constructeur->build();
};

return $construire;
