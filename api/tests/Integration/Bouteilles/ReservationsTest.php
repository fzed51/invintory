<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Bouteilles;

use CaveAVin\Tests\Support\CaveTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Réserve de références (P1, contrat §4) : les count codes suivants de la séquence de
 * l'utilisateur, dans l'ordre ; la longueur augmente quand son espace est épuisé.
 */
final class ReservationsTest extends CaveTestCase
{
    public function testReserverDesCodesALaSuite(): void
    {
        self::assertSame(
            ['references' => ['a0', 'a1', 'a2']],
            $this->reussir('POST', '/api/references/reservations', ['count' => 3], 201),
        );
        self::assertSame(
            ['references' => ['a3']],
            $this->reussir('POST', '/api/references/reservations', ['count' => 1], 201),
        );

        self::assertSame(
            ['longueur_courante' => 2, 'dernier_index' => 4],
            $this->ligne('SELECT longueur_courante, dernier_index FROM reference_sequences'),
        );
    }

    public function testChaqueCompteASaSequence(): void
    {
        $this->reussir('POST', '/api/references/reservations', ['count' => 2], 201);
        $bob = $this->connecter('bob@exemple.fr');

        $reponse = $this->api('POST', '/api/references/reservations', ['count' => 2], $bob);

        self::assertSame(['references' => ['a0', 'a1']], $this->json($reponse));
    }

    public function testLaLongueurAugmenteQuandLEspaceEstEpuise(): void
    {
        $this->pdo->prepare(
            'INSERT INTO reference_sequences (user_id, longueur_courante, dernier_index) VALUES (?, 2, 814)'
        )
            ->execute([$this->idUtilisateur()]);

        self::assertSame(
            ['references' => ['zy', 'zz', 'a00', 'a01']],
            $this->reussir('POST', '/api/references/reservations', ['count' => 4], 201),
        );
        self::assertSame(
            ['longueur_courante' => 3, 'dernier_index' => 2],
            $this->ligne('SELECT longueur_courante, dernier_index FROM reference_sequences'),
        );
    }

    public function testCentCodesAuPlus(): void
    {
        $references = $this->reussir('POST', '/api/references/reservations', ['count' => 100], 201)['references'];

        self::assertIsArray($references);
        self::assertCount(100, array_unique($references));
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function corpsInvalides(): iterable
    {
        yield 'sans count' => [[]];
        yield 'count nul' => [['count' => 0]];
        yield 'count trop grand' => [['count' => 101]];
        yield 'count en texte' => [['count' => '3']];
    }

    /** @param array<string, mixed> $corps */
    #[DataProvider('corpsInvalides')]
    public function testCorpsInvalide(array $corps): void
    {
        $reponse = $this->api('POST', '/api/references/reservations', $corps);

        self::assertSame(400, $reponse->getStatusCode());
        self::assertSame('VALIDATION_FAILED', $this->codeErreur($reponse));
        self::assertSame(0, (int) $this->valeur('SELECT COUNT(*) FROM reference_sequences'));
    }
}
