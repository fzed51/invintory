<?php

declare(strict_types=1);

namespace CaveAVin\Mouvements;

use CaveAVin\Bouteilles\BouteilleRepository;
use CaveAVin\Bouteilles\CodeReference;
use CaveAVin\Bouteilles\DateLimite;
use CaveAVin\Bouteilles\LireBouteillesAction;
use CaveAVin\Bouteilles\ReferentielRepository;
use CaveAVin\Bouteilles\ReserverReferencesAction;
use CaveAVin\Bouteilles\SequenceRepository;
use LogicException;

/**
 * Entrée de N bouteilles identiques (CdC §3.3, contrat §10.1) : chacune sa référence, son
 * client_ref et un mouvement « entree » ; lot_ajout_id = client_ref de la mutation, note
 * copiée, régions et cépages créés à la volée, date limite calculée (P17).
 *
 * Une référence fournie doit avoir été distribuée à ce compte et n'être portée par aucune
 * bouteille (P1) ; sans référence, le serveur en génère une. Tout est vérifié avant la
 * première écriture : une mutation rejetée n'enregistre rien.
 *
 * @phpstan-import-type Emplacement from LireBouteillesAction
 * @phpstan-type Champs array{
 *     type: string, region: ?string, cepage: ?string, domaine: ?string, millesime: ?int,
 *     date_entree: string, origine: string, note: ?string, souvenir: bool
 * }
 * @phpstan-type BouteilleAjoutee array{
 *     client_ref: string, id: int, reference: string, emplacement: Emplacement, redirection: ?string
 * }
 */
final class AjouterBouteillesAction
{
    public function __construct(
        private readonly MouvementRepository $mouvements,
        private readonly BouteilleRepository $bouteilles,
        private readonly ReferentielRepository $referentiels,
        private readonly SequenceRepository $sequences,
        private readonly ReserverReferencesAction $reserver,
        private readonly Placement $placement,
        private readonly LireBouteillesAction $lire,
    ) {
    }

    /**
     * @param string $lot client_ref de la mutation
     * @param string $date date du mouvement, UTC, Y-m-d H:i:s.v
     * @param list<array{client_ref: string, reference: ?string}> $bouteilles
     * @param Champs $champs date_entree au format Y-m-d
     * @param array{type: string, id?: int} $emplacement
     * @return list<BouteilleAjoutee>
     * @throws MutationRejetee
     */
    public function executer(
        int $utilisateur,
        string $lot,
        string $date,
        array $bouteilles,
        array $champs,
        array $emplacement,
    ): array {
        return $this->mouvements->transaction(function () use (
            $utilisateur,
            $lot,
            $date,
            $bouteilles,
            $champs,
            $emplacement,
        ): array {
            $this->verifierReferences($utilisateur, array_column($bouteilles, 'reference'));

            $region = $champs['region'] === null
                ? null
                : $this->referentiels->trouverOuCreer($utilisateur, 'regions', $champs['region']);
            $cepage = $champs['cepage'] === null
                ? null
                : $this->referentiels->trouverOuCreer($utilisateur, 'cepages', $champs['cepage']);
            $commun = [
                'lot_ajout_id' => $lot,
                'type' => $champs['type'],
                'region_id' => $region,
                'cepage_id' => $cepage,
                'domaine' => $champs['domaine'],
                'millesime' => $champs['millesime'],
                'date_entree' => $champs['date_entree'],
                'origine' => $champs['origine'],
                'note' => $champs['note'],
                'tag_souvenir' => (int) $champs['souvenir'],
                'date_limite_consommation' => DateLimite::calculer(
                    $champs['type'],
                    $champs['millesime'],
                    $champs['date_entree'],
                    $this->bouteilles->dureeDeGarde($utilisateur, $champs['type'], $region),
                ),
                'date_dernier_mouvement_applique' => $date,
            ];

            $destinations = $this->placement->destinations($utilisateur, $emplacement, count($bouteilles));
            $ajoutees = [];
            foreach ($bouteilles as $i => $bouteille) {
                $destination = $destinations[$i];
                $reference = $bouteille['reference'] ?? $this->reserver->executer($utilisateur, 1)[0];
                $id = $this->mouvements->creerBouteille($utilisateur, $commun + [
                    'reference' => $reference,
                    'client_ref' => $bouteille['client_ref'],
                    'emplacement_type' => $destination['type'],
                    'etagere_id' => $destination['type'] === 'etagere' ? $destination['id'] : null,
                    'carton_id' => $destination['type'] === 'carton' ? $destination['id'] : null,
                ]);
                $this->mouvements->enregistrer($utilisateur, $id, 'entree', null, null, $destination, $date, null);
                $ajoutees[] = [
                    'client_ref' => $bouteille['client_ref'],
                    'id' => $id,
                    'reference' => $reference,
                    'emplacement' => ($this->lire->bouteille($utilisateur, $id)
                        ?? throw new LogicException('Bouteille créée introuvable.'))['emplacement'],
                    'redirection' => $destination['redirection'],
                ];
            }

            return $ajoutees;
        });
    }

    /**
     * @param list<?string> $references
     * @throws MutationRejetee
     */
    private function verifierReferences(int $utilisateur, array $references): void
    {
        $sequence = $this->sequences->verrouiller($utilisateur);
        $vues = [];
        foreach ($references as $reference) {
            if ($reference === null) {
                continue;
            }
            $position = CodeReference::position($reference);
            $distribuee = $position !== null && (
                $position['longueur'] < $sequence['longueur']
                || ($position['longueur'] === $sequence['longueur'] && $position['index'] < $sequence['index'])
            );
            if (!$distribuee) {
                throw MutationRejetee::referenceNonReservee($reference);
            }
            if (isset($vues[$reference]) || $this->mouvements->referencePortee($utilisateur, $reference)) {
                throw MutationRejetee::referencePrise($reference);
            }
            $vues[$reference] = true;
        }
    }
}
