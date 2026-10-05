<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Auth;

use CaveAVin\Tests\Support\AuthTestCase;
use RuntimeException;

/**
 * Deux rafraîchissements réellement concurrents (deux processus PHP, deux connexions MySQL)
 * avec le même ticket : le verrou sérialise, auth-service ne voit qu'une rotation, donc
 * aucune révocation en cascade (intégration §2.4, Arch §2.3).
 */
final class RafraichissementConcurrentTest extends AuthTestCase
{
    /** Rotation ralentie dans la doublure : le second processus arrive pendant le premier. */
    private const DELAI_DE_ROTATION_MS = 800;

    public function testUnSeulAppelAuServiceEtLAutreRequeteDoitReessayer(): void
    {
        $this->connecter();
        $ticket = $this->ticket();

        $sorties = $this->enParallele(2, $ticket);

        $statuts = array_map(static fn (string $sortie): int => (int) strtok($sortie, ' '), $sorties);
        sort($statuts);
        self::assertSame([200, 409], $statuts, implode("\n", $sorties));
        self::assertSame(1, $this->service->nombreDeRotations(), 'une seule rotation chez auth-service');
        self::assertSame(1, $this->nombreDeSessions());
    }

    /** @return list<string> sortie de chaque processus, « statut corps » */
    private function enParallele(int $nombre, string $ticket): array
    {
        $script = __DIR__ . '/../../Support/scripts/rafraichir.php';
        $environnement = array_merge(getenv(), array_filter($_ENV, 'is_string'));
        $processus = [];
        for ($i = 0; $i < $nombre; $i++) {
            $tubes = [];
            $p = proc_open(
                [PHP_BINARY, $script, $this->dossier . '/service', $ticket, (string) self::DELAI_DE_ROTATION_MS],
                [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
                $tubes,
                null,
                $environnement,
            );
            if ($p === false) {
                throw new RuntimeException('Processus impossible à lancer.');
            }
            $processus[] = [$p, $tubes];
        }

        $sorties = [];
        foreach ($processus as [$p, $tubes]) {
            $sortie = (string) stream_get_contents($tubes[1]);
            $erreurs = (string) stream_get_contents($tubes[2]);
            fclose($tubes[1]);
            fclose($tubes[2]);
            proc_close($p);
            $sorties[] = $sortie !== '' ? $sortie : 'ERREUR ' . $erreurs;
        }

        return $sorties;
    }
}
