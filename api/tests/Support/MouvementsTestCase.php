<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Support;

use CaveAVin\Mouvements\AjouterBouteillesAction;
use CaveAVin\Mouvements\DeplacerBouteilleAction;
use CaveAVin\Mouvements\MutationRejetee;
use CaveAVin\Mouvements\SortirBouteilleAction;

/**
 * Actions de mouvement appelées directement (sans HTTP : seul POST /api/sync, étape 3d, les
 * expose), avec le conteneur de l'application et la base de test.
 */
abstract class MouvementsTestCase extends CaveTestCase
{
    protected const LOT = '1f3c0000-0000-4000-8000-000000000000';

    /** @var array{type: string, region: ?string, cepage: ?string, domaine: ?string, millesime: ?int, date_entree: string, origine: string, note: ?string, souvenir: bool} */
    protected const CHAMPS = [
        'type' => 'rouge',
        'region' => null,
        'cepage' => null,
        'domaine' => null,
        'millesime' => null,
        'date_entree' => '2026-10-01',
        'origine' => 'achetee',
        'note' => null,
        'souvenir' => false,
    ];

    /**
     * @template T of object
     * @param class-string<T> $classe
     * @return T
     */
    protected function action(string $classe): object
    {
        $action = $this->application()->getContainer()?->get($classe);
        self::assertInstanceOf($classe, $action);

        return $action;
    }

    /**
     * @param list<array{client_ref: string, reference: ?string}> $bouteilles
     * @param array<string, mixed> $champs remplacent CHAMPS
     * @param array{type: string, id?: int} $emplacement
     * @return list<array<string, mixed>>
     */
    protected function ajouter(
        array $bouteilles,
        array $champs = [],
        array $emplacement = ['type' => 'hors_rangement'],
        string $date = '2026-10-07 18:40:00.000',
        string $lot = self::LOT,
    ): array {
        /** @var array{type: string, region: ?string, cepage: ?string, domaine: ?string, millesime: ?int, date_entree: string, origine: string, note: ?string, souvenir: bool} $tous */
        $tous = $champs + self::CHAMPS;

        return $this->action(AjouterBouteillesAction::class)
            ->executer($this->idUtilisateur(), $lot, $date, $bouteilles, $tous, $emplacement);
    }

    /**
     * @param array{type: string, id?: int} $emplacement
     * @return array{mouvement_id: int, redirection: ?string}
     */
    protected function deplacer(string $bouteille, array $emplacement, string $date, string $ref): array
    {
        return $this->action(DeplacerBouteilleAction::class)
            ->executer($this->idUtilisateur(), $ref, $date, $bouteille, $emplacement);
    }

    /** @return array{mouvement_id: int} */
    protected function sortir(string $bouteille, string $motif, string $date, string $ref): array
    {
        return $this->action(SortirBouteilleAction::class)
            ->executer($this->idUtilisateur(), $ref, $date, $bouteille, $motif);
    }

    /**
     * Réserve $nombre codes à alice par l'API.
     *
     * @return list<string>
     */
    protected function reserver(int $nombre): array
    {
        $codes = $this->reussir('POST', '/api/references/reservations', ['count' => $nombre], 201)['references'];
        self::assertIsArray($codes);

        return array_values(array_map('strval', $codes));
    }

    /** Uuid de test lisible : uuid(7) = 00000000-0000-4000-8000-000000000007. */
    protected static function uuid(int $n): string
    {
        return sprintf('00000000-0000-4000-8000-%012d', $n);
    }

    /** Exécute $appel en attendant un rejet $code ; renvoie le message. */
    protected function rejet(string $code, callable $appel): string
    {
        try {
            $appel();
        } catch (MutationRejetee $rejet) {
            self::assertSame($code, $rejet->codeRejet, $rejet->getMessage());

            return $rejet->getMessage();
        }
        self::fail('rejet ' . $code . ' attendu');
    }

    /** @return array<string, mixed> état courant d'une bouteille */
    protected function etat(int $id): array
    {
        return $this->ligne(
            'SELECT statut, emplacement_type, etagere_id, carton_id, date_dernier_mouvement_applique'
            . ' FROM bouteilles WHERE id = ' . $id
        );
    }

    /** @return list<array<string, mixed>> mouvements d'une bouteille, par id */
    protected function mouvementsDe(int $id): array
    {
        return $this->lignes(
            'SELECT type_mouvement, motif_sortie, emplacement_avant_type, emplacement_avant_id,'
            . ' emplacement_apres_type, emplacement_apres_id, date_mouvement, client_ref'
            . ' FROM mouvements WHERE bouteille_id = ' . $id . ' ORDER BY id'
        );
    }
}
