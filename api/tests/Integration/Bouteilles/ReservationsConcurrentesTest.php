<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Bouteilles;

use CaveAVin\Tests\Support\IntegrationTestCase;
use RuntimeException;

/**
 * Réservations réellement concurrentes (plusieurs processus PHP, une connexion MySQL
 * chacun) pour le même compte : le verrou sur reference_sequences (schéma §7) garantit
 * qu'aucun code n'est distribué deux fois et qu'aucun n'est sauté.
 */
final class ReservationsConcurrentesTest extends IntegrationTestCase
{
    private const PROCESSUS = 4;
    private const RESERVATIONS = 20;
    private const CODES = 5;

    public function testAucunCodeDistribueDeuxFois(): void
    {
        $this->pdo->exec("INSERT INTO users (auth_sub, email) VALUES ('sub-concurrence', 'c@exemple.fr')");
        $utilisateur = (int) $this->pdo->lastInsertId();

        $codes = $this->enParallele($utilisateur);

        $total = self::PROCESSUS * self::RESERVATIONS * self::CODES;
        self::assertCount($total, $codes);
        self::assertCount($total, array_unique($codes), 'codes distribués deux fois');
        self::assertSame(2, (int) $this->valeur('SELECT longueur_courante FROM reference_sequences'));
        self::assertSame($total, (int) $this->valeur('SELECT dernier_index FROM reference_sequences'));
    }

    /** @return list<string> codes obtenus par l'ensemble des processus */
    private function enParallele(int $utilisateur): array
    {
        $script = __DIR__ . '/../../Support/scripts/reserver.php';
        $environnement = array_merge(getenv(), array_filter($_ENV, 'is_string'));
        $processus = [];
        for ($i = 0; $i < self::PROCESSUS; $i++) {
            $tubes = [];
            $p = proc_open(
                [PHP_BINARY, $script, (string) $utilisateur, (string) self::RESERVATIONS, (string) self::CODES],
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

        $codes = [];
        foreach ($processus as [$p, $tubes]) {
            $sortie = (string) stream_get_contents($tubes[1]);
            $erreurs = (string) stream_get_contents($tubes[2]);
            fclose($tubes[1]);
            fclose($tubes[2]);
            self::assertSame(0, proc_close($p), $erreurs . $sortie);
            array_push($codes, ...array_filter(explode("\n", $sortie)));
        }

        return $codes;
    }
}
