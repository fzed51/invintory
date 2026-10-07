<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Emplacements;

use CaveAVin\Tests\Support\CaveTestCase;

/**
 * Suppression d'un emplacement non vide (CdC §3.1, P20) : jamais bloquée, les bouteilles en
 * cave passent en hors rangement avec un mouvement « deplacement » daté de la suppression.
 */
final class SuppressionTest extends CaveTestCase
{
    /** 2026-10-07 18:42:05 UTC. */
    private const MOMENT = 1791398525;

    public function testSupprimerUneEtagereVide(): void
    {
        [$e1, $e2] = $this->etageres($this->creerArmoire('Cave', [6, 6]));

        self::assertSame(['moved_to_unplaced' => 0], $this->reussir('DELETE', '/api/shelves/' . $e1));

        self::assertSame([['id' => $e2]], $this->lignes('SELECT id FROM etageres'));
        self::assertSame(0, (int) $this->valeur('SELECT COUNT(*) FROM mouvements'));
    }

    public function testSupprimerUneEtagereNonVideBasculeSesBouteilles(): void
    {
        [$e1, $e2] = $this->etageres($this->creerArmoire('Cave', [6, 6]));
        $b1 = $this->insererBouteille('etagere', $e1);
        $b2 = $this->insererBouteille('etagere', $e1, dernierMouvement: '2026-01-01 10:00:00.250');
        $autre = $this->insererBouteille('etagere', $e2);
        $this->maintenant = self::MOMENT;

        self::assertSame(['moved_to_unplaced' => 2], $this->reussir('DELETE', '/api/shelves/' . $e1));

        self::assertSame(0, (int) $this->valeur('SELECT COUNT(*) FROM etageres WHERE id = ' . $e1));
        self::assertSame([
            ['id' => $b1, 'emplacement_type' => 'hors_rangement', 'etagere_id' => null, 'carton_id' => null,
                'date_dernier_mouvement_applique' => '2026-10-07 18:42:05.000'],
            ['id' => $b2, 'emplacement_type' => 'hors_rangement', 'etagere_id' => null, 'carton_id' => null,
                'date_dernier_mouvement_applique' => '2026-10-07 18:42:05.000'],
            ['id' => $autre, 'emplacement_type' => 'etagere', 'etagere_id' => $e2, 'carton_id' => null,
                'date_dernier_mouvement_applique' => null],
        ], $this->lignes(
            'SELECT id, emplacement_type, etagere_id, carton_id, date_dernier_mouvement_applique'
            . ' FROM bouteilles ORDER BY id'
        ));
        $utilisateur = $this->idUtilisateur();
        self::assertSame([
            $this->mouvementAttendu($b1, $utilisateur, 'etagere', $e1),
            $this->mouvementAttendu($b2, $utilisateur, 'etagere', $e1),
        ], $this->mouvements());
    }

    public function testLHorlogeLogiqueNeReculeJamais(): void
    {
        $carton = $this->creerCarton('Carton', 6);
        $bouteille = $this->insererBouteille('carton', $carton, dernierMouvement: '2030-01-01 00:00:00.500');
        $this->maintenant = self::MOMENT;

        $this->reussir('DELETE', '/api/boxes/' . $carton);

        self::assertSame(
            '2030-01-01 00:00:00.500',
            $this->valeur('SELECT date_dernier_mouvement_applique FROM bouteilles WHERE id = ' . $bouteille),
        );
    }

    public function testSupprimerUnCartonNonVide(): void
    {
        $carton = $this->creerCarton('Carton', 6);
        $bouteille = $this->insererBouteille('carton', $carton);
        $this->maintenant = self::MOMENT;

        self::assertSame(['moved_to_unplaced' => 1], $this->reussir('DELETE', '/api/boxes/' . $carton));

        self::assertSame(0, (int) $this->valeur('SELECT COUNT(*) FROM cartons'));
        self::assertSame(
            ['emplacement_type' => 'hors_rangement', 'carton_id' => null],
            $this->ligne('SELECT emplacement_type, carton_id FROM bouteilles'),
        );
        self::assertSame(
            [$this->mouvementAttendu($bouteille, $this->idUtilisateur(), 'carton', $carton)],
            $this->mouvements(),
        );
    }

    public function testSupprimerUneArmoireBasculeLesBouteillesDeToutesSesEtageres(): void
    {
        [$e1, $e2] = $this->etageres($this->creerArmoire('Cave', [6, 6]));
        $autre = $this->etageres($this->creerArmoire('Autre', [6]))[0];
        $this->insererBouteille('etagere', $e1);
        $this->insererBouteille('etagere', $e2);
        $this->insererBouteille('etagere', $e2);
        $this->insererBouteille('etagere', $autre);

        $armoire = (int) $this->valeur('SELECT MIN(id) FROM armoires');
        self::assertSame(['moved_to_unplaced' => 3], $this->reussir('DELETE', '/api/cabinets/' . $armoire));

        self::assertSame([['id' => $autre]], $this->lignes('SELECT id FROM etageres'));
        self::assertSame(1, (int) $this->valeur('SELECT COUNT(*) FROM armoires'));
        self::assertSame([3, 3, 3], [
            (int) $this->valeur("SELECT COUNT(*) FROM bouteilles WHERE emplacement_type = 'hors_rangement'"),
            (int) $this->valeur("SELECT COUNT(*) FROM mouvements WHERE type_mouvement = 'deplacement'"),
            $this->reussir('GET', '/api/cellar')['unplaced'],
        ]);
    }

    public function testLesBouteillesSortiesNeSontNiBasculeesNiComptees(): void
    {
        $carton = $this->creerCarton('Carton', 6);
        $this->insererBouteille('hors_rangement', statut: 'sortie');

        self::assertSame(['moved_to_unplaced' => 0], $this->reussir('DELETE', '/api/boxes/' . $carton));
        self::assertSame(0, (int) $this->valeur('SELECT COUNT(*) FROM mouvements'));
    }

    /** @return array<string, mixed> */
    private function mouvementAttendu(int $bouteille, int $utilisateur, string $type, int $id): array
    {
        return [
            'bouteille_id' => $bouteille,
            'user_id' => $utilisateur,
            'type_mouvement' => 'deplacement',
            'motif_sortie' => null,
            'emplacement_avant_type' => $type,
            'emplacement_avant_id' => $id,
            'emplacement_apres_type' => 'hors_rangement',
            'emplacement_apres_id' => null,
            'date_mouvement' => '2026-10-07 18:42:05.000',
            'client_ref' => null,
        ];
    }

    /** @return list<array<string, mixed>> */
    private function mouvements(): array
    {
        return $this->lignes(
            'SELECT bouteille_id, user_id, type_mouvement, motif_sortie, emplacement_avant_type,'
            . ' emplacement_avant_id, emplacement_apres_type, emplacement_apres_id, date_mouvement, client_ref'
            . ' FROM mouvements ORDER BY bouteille_id'
        );
    }
}
