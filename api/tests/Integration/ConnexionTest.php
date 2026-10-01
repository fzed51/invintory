<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration;

use CaveAVin\Tests\Support\IntegrationTestCase;

/** Réglages de session posés par CaveAVin\Donnees\Connexion (partagée avec les tests). */
final class ConnexionTest extends IntegrationTestCase
{
    public function testLaSessionEstEnUtc(): void
    {
        self::assertSame('+00:00', $this->valeur('SELECT @@session.time_zone'));
    }

    public function testCurrentTimestampEstEnUtc(): void
    {
        $ecart = (int) $this->valeur('SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), CURRENT_TIMESTAMP)');

        self::assertSame(0, $ecart);
    }

    public function testLaConnexionEstEnUtf8mb4(): void
    {
        self::assertSame('utf8mb4', $this->valeur('SELECT @@session.character_set_client'));
        self::assertSame('utf8mb4', $this->valeur('SELECT @@session.character_set_results'));
    }
}
