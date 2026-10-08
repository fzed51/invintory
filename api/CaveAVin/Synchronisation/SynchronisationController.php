<?php

declare(strict_types=1);

namespace CaveAVin\Synchronisation;

use CaveAVin\Auth\Authentification;
use CaveAVin\Bouteilles\BouteillesController;
use CaveAVin\Http\BaseController;
use CaveAVin\Http\ErreurApi;
use CaveAVin\Mouvements\SortirBouteilleAction;
use DateTimeImmutable;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * POST /api/sync (contrat §10) : un lot mal formé est refusé en entier (400, 413) ; une
 * mutation mal formée n'est que rejetée, avec son client_ref. Traduction JSON ↔ domaine.
 *
 * @phpstan-import-type Mutation from SynchroniserAction
 * @phpstan-import-type Resultat from SynchroniserAction
 * @phpstan-import-type Demande from SynchroniserAction
 * @phpstan-import-type Champs from \CaveAVin\Mouvements\AjouterBouteillesAction
 */
final class SynchronisationController extends BaseController
{
    private const MUTATIONS_MAX = 200;
    private const BOUTEILLES_MAX = 100;
    private const STATUTS = ['appliquee' => 'applied', 'deja_appliquee' => 'already_applied', 'rejetee' => 'rejected'];
    private const EMPLACEMENTS = ['etagere', 'carton', 'hors_rangement'];

    public function __construct(
        private readonly SynchroniserAction $synchroniser,
        private readonly BouteillesController $bouteilles,
    ) {
    }

    public function synchroniser(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $corps = $request->getParsedBody();
        $lot = is_array($corps) ? ($corps['mutations'] ?? null) : null;
        if (!is_array($lot) || !array_is_list($lot)) {
            throw ErreurApi::donneesInvalides('Champ « mutations » : liste attendue.');
        }
        if (count($lot) > self::MUTATIONS_MAX) {
            throw ErreurApi::tropGros(sprintf('Lot de plus de %d mutations.', self::MUTATIONS_MAX));
        }
        $mutations = [];
        foreach ($lot as $rang => $mutation) {
            $ref = is_array($mutation) ? ($mutation['client_ref'] ?? null) : null;
            if (!is_array($mutation) || !is_string($ref) || !self::estUuid($ref)) {
                throw ErreurApi::donneesInvalides(
                    sprintf('Mutation %d : objet avec un client_ref UUID v4 attendu.', $rang + 1),
                );
            }
            $mutations[] = $this->mutation($ref, $mutation);
        }

        $resultats = $this->synchroniser->executer(Authentification::utilisateur($request), $mutations);

        return $this->json($response, ['results' => array_map(self::resultatJson(...), $resultats)]);
    }

    /**
     * @param array<mixed> $json
     * @return Mutation
     */
    private function mutation(string $ref, array $json): array
    {
        try {
            $version = $json['schema_version'] ?? null;
            if (!is_int($version)) {
                throw ErreurApi::donneesInvalides('Champ « schema_version » : entier attendu.');
            }
            if ($version !== SynchroniserAction::VERSION) {
                return [
                    'client_ref' => $ref,
                    'type' => 'invalide',
                    'code' => 'UNSUPPORTED_SCHEMA_VERSION',
                    'message' => sprintf('Version de mutation %d non prise en charge.', $version),
                ];
            }
            $date = self::date($json['occurred_at'] ?? null);

            return match ($json['kind'] ?? null) {
                'add' => [
                    'client_ref' => $ref,
                    'type' => 'ajout',
                    'date' => $date,
                    'bouteilles' => self::bouteillesAjoutees($json['bottles'] ?? null),
                    'champs' => $this->champs($json['fields'] ?? null),
                    'emplacement' => self::emplacement($json['location'] ?? null),
                ],
                'move' => [
                    'client_ref' => $ref,
                    'type' => 'deplacement',
                    'date' => $date,
                    'bouteille' => self::bouteille($json['bottle'] ?? null),
                    'emplacement' => self::emplacement($json['location'] ?? null),
                ],
                'exit' => [
                    'client_ref' => $ref,
                    'type' => 'sortie',
                    'date' => $date,
                    'bouteille' => self::bouteille($json['bottle'] ?? null),
                    'motif' => self::motif($json['exit_reason'] ?? null),
                ],
                default => throw ErreurApi::donneesInvalides('Champ « kind » : une valeur parmi add, move, exit.'),
            };
        } catch (ErreurApi $erreur) {
            return [
                'client_ref' => $ref,
                'type' => 'invalide',
                'code' => $erreur->codeErreur,
                'message' => $erreur->getMessage(),
            ];
        }
    }

    /** ISO 8601 UTC, millisecondes facultatives (contrat §1.2) → DATETIME(3) UTC. */
    private static function date(mixed $valeur): string
    {
        $motif = '/^([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2}:[0-9]{2}:[0-9]{2})(?:\.([0-9]{1,3}))?Z$/';
        if (is_string($valeur) && preg_match($motif, $valeur, $m) === 1) {
            $jour = $m[1] . ' ' . $m[2];
            $date = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $jour);
            if ($date !== false && $date->format('Y-m-d H:i:s') === $jour) {
                return $jour . '.' . str_pad($m[3] ?? '', 3, '0');
            }
        }

        throw ErreurApi::donneesInvalides('Champ « occurred_at » : date ISO 8601 UTC attendue.');
    }

    /** @return list<array{client_ref: string, reference: ?string}> */
    private static function bouteillesAjoutees(mixed $valeur): array
    {
        if (!is_array($valeur) || !array_is_list($valeur) || $valeur === [] || count($valeur) > self::BOUTEILLES_MAX) {
            throw ErreurApi::donneesInvalides(
                sprintf('Champ « bottles » : liste de 1 à %d bouteilles attendue.', self::BOUTEILLES_MAX),
            );
        }
        $bouteilles = [];
        foreach ($valeur as $bouteille) {
            $ref = is_array($bouteille) ? ($bouteille['client_ref'] ?? null) : null;
            if (!is_array($bouteille) || !is_string($ref) || !self::estUuid($ref)) {
                throw ErreurApi::donneesInvalides(
                    'Champ « bottles » : client_ref UUID v4 attendu pour chaque bouteille.',
                );
            }
            if (isset($bouteilles[$ref])) {
                throw ErreurApi::donneesInvalides('Champ « bottles » : client_ref en double.');
            }
            $reference = $bouteille['reference'] ?? null;
            if ($reference !== null && !is_string($reference)) {
                throw ErreurApi::donneesInvalides('Champ « reference » : texte attendu.');
            }
            $bouteilles[$ref] = ['client_ref' => $ref, 'reference' => $reference];
        }

        return array_values($bouteilles);
    }

    /**
     * Champs communs d'un ajout : mêmes règles que l'édition de la fiche ; type, date
     * d'entrée et origine obligatoires.
     *
     * @return Champs
     */
    private function champs(mixed $valeur): array
    {
        if (!is_array($valeur)) {
            throw ErreurApi::donneesInvalides('Champ « fields » : objet attendu.');
        }
        $champs = $this->bouteilles->modifications($valeur);
        if (!isset($champs['type'])) {
            throw ErreurApi::donneesInvalides('Champ « type » requis.');
        }
        if (!isset($champs['date_entree'])) {
            throw ErreurApi::donneesInvalides('Champ « entry_date » requis.');
        }
        if (!isset($champs['origine'])) {
            throw ErreurApi::donneesInvalides('Champ « origin » requis.');
        }

        return [
            'type' => $champs['type'],
            'region' => $champs['region'] ?? null,
            'cepage' => $champs['cepage'] ?? null,
            'domaine' => $champs['domaine'] ?? null,
            'millesime' => $champs['millesime'] ?? null,
            'date_entree' => $champs['date_entree'],
            'origine' => $champs['origine'],
            'note' => $champs['note'] ?? null,
            'souvenir' => $champs['souvenir'] ?? false,
        ];
    }

    /** @return Demande */
    private static function emplacement(mixed $valeur): array
    {
        $type = is_array($valeur) ? ($valeur['type'] ?? null) : null;
        if (!is_array($valeur) || !is_string($type) || !in_array($type, self::EMPLACEMENTS, true)) {
            throw ErreurApi::donneesInvalides(
                'Champ « location » : type parmi ' . implode(', ', self::EMPLACEMENTS) . ' attendu.',
            );
        }
        if ($type === 'hors_rangement') {
            return ['type' => $type];
        }
        $id = $valeur['id'] ?? null;
        if (!is_int($id) || $id < 1) {
            throw ErreurApi::donneesInvalides('Champ « location » : id entier positif attendu.');
        }

        return ['type' => $type, 'id' => $id];
    }

    private static function bouteille(mixed $valeur): string
    {
        if (!is_string($valeur) || !self::estUuid($valeur)) {
            throw ErreurApi::donneesInvalides('Champ « bottle » : client_ref UUID v4 attendu.');
        }

        return $valeur;
    }

    private static function motif(mixed $valeur): string
    {
        if (!is_string($valeur) || !in_array($valeur, SortirBouteilleAction::MOTIFS, true)) {
            throw ErreurApi::donneesInvalides(
                'Champ « exit_reason » : une valeur parmi ' . implode(', ', SortirBouteilleAction::MOTIFS) . '.',
            );
        }

        return $valeur;
    }

    /**
     * @param Resultat $resultat
     * @return array<string, mixed>
     */
    private static function resultatJson(array $resultat): array
    {
        $json = ['client_ref' => $resultat['client_ref'], 'status' => self::STATUTS[$resultat['statut']]];
        if (isset($resultat['bouteilles'])) {
            $json['bottles'] = array_map(fn (array $bouteille): array => [
                'client_ref' => $bouteille['client_ref'],
                'id' => $bouteille['id'],
                'reference' => $bouteille['reference'],
                'location' => BouteillesController::emplacementJson($bouteille['emplacement']),
                'redirected' => $bouteille['redirection'],
            ], $resultat['bouteilles']);
        }
        if (isset($resultat['mouvement_id'])) {
            $json['movement_id'] = $resultat['mouvement_id'];
        }
        if (array_key_exists('redirection', $resultat)) {
            $json['redirected'] = $resultat['redirection'];
        }
        if (isset($resultat['erreur'])) {
            $json['error'] = $resultat['erreur'];
        }

        return $json;
    }
}
