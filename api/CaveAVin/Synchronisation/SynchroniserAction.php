<?php

declare(strict_types=1);

namespace CaveAVin\Synchronisation;

use CaveAVin\Bouteilles\LireBouteillesAction;
use CaveAVin\Emplacements\EmplacementRepository;
use CaveAVin\Mouvements\AjouterBouteillesAction;
use CaveAVin\Mouvements\DeplacerBouteilleAction;
use CaveAVin\Mouvements\MutationRejetee;
use CaveAVin\Mouvements\Placement;
use CaveAVin\Mouvements\SortirBouteilleAction;

/**
 * Lot de mutations hors ligne (contrat §10, Arch §4.2) : une transaction pour le lot,
 * mutations dans l'ordre reçu, chacune dans un point de sauvegarde (un rejet n'annule
 * qu'elle). Une mutation déjà reçue n'est pas réappliquée : sa réponse est reconstruite.
 *
 * @phpstan-import-type Champs from AjouterBouteillesAction
 * @phpstan-import-type BouteilleAjoutee from AjouterBouteillesAction
 * @phpstan-type Demande array{type: string, id?: int}
 * @phpstan-type Mutation array{
 *     client_ref: string, type: 'ajout', date: string,
 *     bouteilles: list<array{client_ref: string, reference: ?string}>, champs: Champs, emplacement: Demande
 * }|array{client_ref: string, type: 'deplacement', date: string, bouteille: string, emplacement: Demande}
 * |array{client_ref: string, type: 'sortie', date: string, bouteille: string, motif: string}
 * |array{client_ref: string, type: 'invalide', code: string, message: string}
 * @phpstan-type Resultat array{
 *     client_ref: string, statut: 'appliquee'|'deja_appliquee'|'rejetee',
 *     bouteilles?: list<BouteilleAjoutee>, mouvement_id?: int, redirection?: ?string,
 *     erreur?: array{code: string, message: string}
 * }
 */
final class SynchroniserAction
{
    public const VERSION = 1;
    private const DEJA_UTILISE = 'client_ref déjà utilisé par une autre mutation.';

    public function __construct(
        private readonly SynchronisationRepository $recues,
        private readonly AjouterBouteillesAction $ajouter,
        private readonly DeplacerBouteilleAction $deplacer,
        private readonly SortirBouteilleAction $sortir,
        private readonly EmplacementRepository $emplacements,
        private readonly LireBouteillesAction $lire,
    ) {
    }

    /**
     * @param list<Mutation> $mutations
     * @return list<Resultat> un par mutation, dans l'ordre
     */
    public function executer(int $utilisateur, array $mutations): array
    {
        return $this->recues->transaction(function () use ($utilisateur, $mutations): array {
            $resultats = [];
            foreach ($mutations as $mutation) {
                $ref = $mutation['client_ref'];
                try {
                    $resultats[] = ['client_ref' => $ref] + $this->traiter($utilisateur, $mutation);
                } catch (MutationRejetee $rejet) {
                    $resultats[] = [
                        'client_ref' => $ref,
                        'statut' => 'rejetee',
                        'erreur' => ['code' => $rejet->codeRejet, 'message' => $rejet->getMessage()],
                    ];
                }
            }

            return $resultats;
        });
    }

    /**
     * @param Mutation $mutation
     * @return array{
     *     statut: 'appliquee'|'deja_appliquee', bouteilles?: list<BouteilleAjoutee>, mouvement_id?: int,
     *     redirection?: ?string
     * }
     * @throws MutationRejetee
     */
    private function traiter(int $utilisateur, array $mutation): array
    {
        $ref = $mutation['client_ref'];
        switch ($mutation['type']) {
            case 'invalide':
                throw new MutationRejetee($mutation['code'], $mutation['message']);
            case 'ajout':
                $dejaRecu = $this->ajoutRecu($utilisateur, $mutation);
                if ($dejaRecu !== null) {
                    return ['statut' => 'deja_appliquee', 'bouteilles' => $dejaRecu];
                }

                return ['statut' => 'appliquee', 'bouteilles' => $this->ajouter->executer(
                    $utilisateur,
                    $ref,
                    $mutation['date'],
                    $mutation['bouteilles'],
                    $mutation['champs'],
                    $mutation['emplacement'],
                )];
            case 'deplacement':
                $recu = $this->mouvementRecu($utilisateur, $ref, 'deplacement');
                if ($recu !== null) {
                    return [
                        'statut' => 'deja_appliquee',
                        'mouvement_id' => $recu['id'],
                        'redirection' => $this->redirection(
                            $utilisateur,
                            $mutation['emplacement'],
                            $recu['apres_type'],
                        ),
                    ];
                }

                return ['statut' => 'appliquee'] + $this->deplacer->executer(
                    $utilisateur,
                    $ref,
                    $mutation['date'],
                    $mutation['bouteille'],
                    $mutation['emplacement'],
                );
            case 'sortie':
                $recu = $this->mouvementRecu($utilisateur, $ref, 'sortie');
                if ($recu !== null) {
                    return ['statut' => 'deja_appliquee', 'mouvement_id' => $recu['id']];
                }

                return ['statut' => 'appliquee'] + $this->sortir->executer(
                    $utilisateur,
                    $ref,
                    $mutation['date'],
                    $mutation['bouteille'],
                    $mutation['motif'],
                );
        }
    }

    /**
     * Réponse d'un ajout déjà reçu : toutes ses bouteilles existent et portent son batch_id.
     * Emplacement et redirection sont ceux du mouvement d'entrée, pas l'état actuel.
     *
     * @param array{client_ref: string, bouteilles: list<array{client_ref: string, reference: ?string}>,
     *     emplacement: Demande} $mutation
     * @return list<BouteilleAjoutee>|null null s'il n'a jamais été reçu
     * @throws MutationRejetee une partie des client_ref appartient à une autre mutation
     */
    private function ajoutRecu(int $utilisateur, array $mutation): ?array
    {
        $refs = array_column($mutation['bouteilles'], 'client_ref');
        $recues = $refs === [] ? [] : $this->recues->bouteilles($utilisateur, $refs);
        if ($recues === []) {
            return null;
        }
        $ordonnees = [];
        foreach ($refs as $ref) {
            if (!isset($recues[$ref]) || $recues[$ref]['lot_ajout_id'] !== $mutation['client_ref']) {
                throw new MutationRejetee('VALIDATION_FAILED', 'Bouteille : ' . self::DEJA_UTILISE);
            }
            $ordonnees[] = $recues[$ref];
        }
        $emplacements = $this->lire->emplacements($utilisateur, array_map(
            fn (array $bouteille): array => [
                'type' => $bouteille['apres_type'] ?? 'hors_rangement',
                'id' => $bouteille['apres_id'],
            ],
            $ordonnees,
        ));

        return array_map(fn (array $bouteille, array $emplacement): array => [
            'client_ref' => $bouteille['client_ref'],
            'id' => $bouteille['id'],
            'reference' => $bouteille['reference'],
            'emplacement' => $emplacement,
            'redirection' => $this->redirection($utilisateur, $mutation['emplacement'], $bouteille['apres_type']),
        ], $ordonnees, $emplacements);
    }

    /**
     * @return array{id: int, type_mouvement: string, apres_type: ?string, apres_id: ?int}|null
     * @throws MutationRejetee le client_ref est celui d'un mouvement d'un autre type
     */
    private function mouvementRecu(int $utilisateur, string $clientRef, string $type): ?array
    {
        $recu = $this->recues->mouvement($utilisateur, $clientRef);
        if ($recu !== null && $recu['type_mouvement'] !== $type) {
            throw new MutationRejetee('VALIDATION_FAILED', 'Mutation : ' . self::DEJA_UTILISE);
        }

        return $recu;
    }

    /**
     * Redirection d'un placement déjà reçu (contrat §10.4), déduite de sa destination
     * réelle : hors rangement au lieu de l'emplacement demandé, introuvable aujourd'hui ou
     * complet à l'époque.
     *
     * @param Demande $demande
     */
    private function redirection(int $utilisateur, array $demande, ?string $typeReel): ?string
    {
        $id = $demande['id'] ?? null;
        if ($demande['type'] === 'hors_rangement' || $typeReel !== 'hors_rangement' || $id === null) {
            return null;
        }
        $existe = $demande['type'] === 'etagere'
            ? $this->emplacements->etagere($utilisateur, $id) !== null
            : $this->emplacements->carton($utilisateur, $id) !== null;

        return $existe ? Placement::CAPACITE_DEPASSEE : Placement::EMPLACEMENT_INTROUVABLE;
    }
}
