<?php

declare(strict_types=1);

namespace CaveAVin\Bouteilles;

use CaveAVin\Auth\Authentification;
use CaveAVin\Http\BaseController;
use CaveAVin\Http\ErreurApi;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Routes des bouteilles, des référentiels et de la réserve de références (contrat §4, §6,
 * §7, §8) : validation et traduction des noms français du domaine vers le JSON anglais (§1.4).
 *
 * @phpstan-import-type Bouteille from LireBouteillesAction
 * @phpstan-import-type Mouvement from LireBouteillesAction
 * @phpstan-import-type Emplacement from LireBouteillesAction
 * @phpstan-import-type Filtres from BouteilleRepository
 * @phpstan-import-type Modifications from ModifierBouteilleAction
 */
final class BouteillesController extends BaseController
{
    private const TYPES = ['rouge', 'blanc', 'rose', 'effervescent', 'doux', 'autre'];
    private const ORIGINES = ['achetee', 'offerte'];
    private const TRIS = ['reference' => 'reference', 'priority' => 'priorite', 'age' => 'age'];
    private const RESERVE_MAX = 100;

    public function __construct(
        private readonly ReferentielsAction $referentiels,
        private readonly ReserverReferencesAction $reserver,
        private readonly LireBouteillesAction $lire,
        private readonly ModifierBouteilleAction $modifier,
    ) {
    }

    public function regions(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->lecture($response, ['regions' => $this->referentiel($request, 'regions')]);
    }

    public function cepages(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->lecture($response, ['grapes' => $this->referentiel($request, 'cepages')]);
    }

    public function reserverReferences(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $nombre = $this->entier($this->corps($request)['count'] ?? null, 'count', 1, self::RESERVE_MAX);

        return $this->json(
            $response,
            ['references' => $this->reserver->executer(Authentification::utilisateur($request), $nombre)],
            201,
        );
    }

    public function lister(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $bouteilles = $this->lire->lister(Authentification::utilisateur($request), $this->filtres($request));

        return $this->lecture($response, ['bottles' => array_map(self::bouteilleJson(...), $bouteilles)]);
    }

    public function fiche(ServerRequestInterface $request, ResponseInterface $response, string $id): ResponseInterface
    {
        $fiche = $this->lire->fiche(Authentification::utilisateur($request), (int) $id);

        return $this->lecture($response, self::ficheJson($fiche ?? throw ErreurApi::introuvable()));
    }

    public function ficheParReference(
        ServerRequestInterface $request,
        ResponseInterface $response,
        string $reference,
    ): ResponseInterface {
        $fiche = $this->lire->ficheParReference(Authentification::utilisateur($request), $reference);

        return $this->lecture($response, self::ficheJson($fiche ?? throw ErreurApi::introuvable()));
    }

    public function modifier(
        ServerRequestInterface $request,
        ResponseInterface $response,
        string $id,
    ): ResponseInterface {
        $bouteille = $this->modifier->executer(
            Authentification::utilisateur($request),
            (int) $id,
            $this->modifications($this->corps($request)),
        );

        return $this->json($response, self::bouteilleJson($bouteille ?? throw ErreurApi::introuvable()));
    }

    /**
     * @param 'regions'|'cepages' $table
     * @return list<array{id: int, name: string}>
     */
    private function referentiel(ServerRequestInterface $requete, string $table): array
    {
        $recherche = $requete->getQueryParams()['q'] ?? null;
        if ($recherche !== null && !is_string($recherche)) {
            throw ErreurApi::donneesInvalides('Paramètre « q » : texte attendu.');
        }

        return array_map(
            fn (array $valeur): array => ['id' => $valeur['id'], 'name' => $valeur['nom']],
            $this->referentiels->lister(Authentification::utilisateur($requete), $table, $recherche),
        );
    }

    /** @return Filtres */
    private function filtres(ServerRequestInterface $requete): array
    {
        $parametres = $requete->getQueryParams();
        $filtres = [];
        $statut = $this->choix($parametres, 'status', ['en_cave', 'sortie', 'all']) ?? 'en_cave';
        if ($statut === 'en_cave' || $statut === 'sortie') {
            $filtres['statut'] = $statut;
        }
        $emplacement = $this->choix($parametres, 'location', null);
        if ($emplacement !== null) {
            $filtres['emplacement'] = self::emplacementFiltre($emplacement);
        }
        $type = $this->choix($parametres, 'type', self::TYPES);
        if ($type !== null) {
            $filtres['type'] = $type;
        }
        foreach (['region_id' => 'region_id', 'grape_id' => 'cepage_id'] as $parametre => $cle) {
            if (isset($parametres[$parametre])) {
                $filtres[$cle] = $this->parametreEntier($requete, $parametre, 0, 1, PHP_INT_MAX);
            }
        }
        $tri = $this->choix($parametres, 'sort', array_keys(self::TRIS));
        if ($tri !== null) {
            $filtres['tri'] = self::TRIS[$tri];
        }
        if (isset($parametres['limit'])) {
            $filtres['limite'] = $this->parametreEntier($requete, 'limit', 0, 1, PHP_INT_MAX);
        }

        return $filtres;
    }

    /**
     * Paramètre d'URL facultatif, pris parmi $valeurs (ou libre si $valeurs est null).
     *
     * @param array<mixed> $parametres
     * @param list<string>|null $valeurs
     */
    private function choix(array $parametres, string $nom, ?array $valeurs): ?string
    {
        $valeur = $parametres[$nom] ?? null;
        if ($valeur === null) {
            return null;
        }
        if (!is_string($valeur) || ($valeurs !== null && !in_array($valeur, $valeurs, true))) {
            throw ErreurApi::donneesInvalides(sprintf('Paramètre « %s » invalide.', $nom));
        }

        return $valeur;
    }

    /** @return array{0: string, 1: ?int} */
    private static function emplacementFiltre(string $valeur): array
    {
        if ($valeur === 'hors_rangement') {
            return ['hors_rangement', null];
        }
        if (preg_match('/^(etagere|carton|cabinet):([1-9][0-9]{0,17})$/', $valeur, $m) !== 1) {
            throw ErreurApi::donneesInvalides('Paramètre « location » invalide.');
        }

        return [$m[1] === 'cabinet' ? 'armoire' : $m[1], (int) $m[2]];
    }

    /**
     * Corps de PATCH /api/bottles/{id}, entièrement validé avant toute écriture.
     *
     * @param array<mixed> $corps
     * @return Modifications
     */
    private function modifications(array $corps): array
    {
        $modifications = [];
        if (array_key_exists('type', $corps)) {
            $modifications['type'] = $this->valeurParmi($corps['type'], 'type', self::TYPES);
        }
        if (array_key_exists('origin', $corps)) {
            $modifications['origine'] = $this->valeurParmi($corps['origin'], 'origin', self::ORIGINES);
        }
        $textes = ['region' => ['region', 150], 'grape' => ['cepage', 150], 'domain' => ['domaine', 255]];
        foreach ($textes as $champ => [$cle, $max]) {
            if (array_key_exists($champ, $corps)) {
                $modifications[$cle] = $corps[$champ] === null ? null : $this->libelle($corps[$champ], $champ, $max);
            }
        }
        if (array_key_exists('vintage', $corps)) {
            $modifications['millesime'] = $corps['vintage'] === null
                ? null
                : $this->entier($corps['vintage'], 'vintage', 1000, 9999);
        }
        if (array_key_exists('entry_date', $corps)) {
            $date = $corps['entry_date'];
            if (!is_string($date) || preg_match('/^([0-9]{4})-(0[1-9]|1[0-2])$/', $date) !== 1) {
                throw ErreurApi::donneesInvalides('Champ « entry_date » : année et mois attendus (AAAA-MM).');
            }
            $modifications['date_entree'] = $date . '-01';
        }
        if (array_key_exists('note', $corps)) {
            if ($corps['note'] !== null && !is_string($corps['note'])) {
                throw ErreurApi::donneesInvalides('Champ « note » : texte attendu.');
            }
            $modifications['note'] = $corps['note'];
        }
        if (array_key_exists('souvenir', $corps)) {
            if (!is_bool($corps['souvenir'])) {
                throw ErreurApi::donneesInvalides('Champ « souvenir » : booléen attendu.');
            }
            $modifications['souvenir'] = $corps['souvenir'];
        }

        return $modifications;
    }

    /** @param list<string> $valeurs */
    private function valeurParmi(mixed $valeur, string $champ, array $valeurs): string
    {
        if (!is_string($valeur) || !in_array($valeur, $valeurs, true)) {
            throw ErreurApi::donneesInvalides(
                sprintf('Champ « %s » : une valeur parmi %s.', $champ, implode(', ', $valeurs)),
            );
        }

        return $valeur;
    }

    /**
     * @param array{bouteille: Bouteille, mouvements: list<Mouvement>} $fiche
     * @return array<string, mixed>
     */
    private static function ficheJson(array $fiche): array
    {
        return self::bouteilleJson($fiche['bouteille']) + [
            'movements' => array_map(fn (array $mouvement): array => [
                'id' => $mouvement['id'],
                'client_ref' => $mouvement['client_ref'],
                'type' => $mouvement['type'],
                'exit_reason' => $mouvement['motif_sortie'],
                'from' => $mouvement['avant'] === null ? null : self::emplacementJson($mouvement['avant']),
                'to' => $mouvement['apres'] === null ? null : self::emplacementJson($mouvement['apres']),
                'occurred_at' => self::dateHeure($mouvement['date']),
            ], $fiche['mouvements']),
        ];
    }

    /**
     * @param Bouteille $bouteille
     * @return array<string, mixed>
     */
    private static function bouteilleJson(array $bouteille): array
    {
        return [
            'id' => $bouteille['id'],
            'client_ref' => $bouteille['client_ref'],
            'reference' => $bouteille['reference'],
            'type' => $bouteille['type'],
            'region' => $bouteille['region'] === null
                ? null
                : ['id' => $bouteille['region']['id'], 'name' => $bouteille['region']['nom']],
            'grape' => $bouteille['cepage'] === null
                ? null
                : ['id' => $bouteille['cepage']['id'], 'name' => $bouteille['cepage']['nom']],
            'domain' => $bouteille['domaine'],
            'vintage' => $bouteille['millesime'],
            'entry_date' => substr($bouteille['date_entree'], 0, 7),
            'origin' => $bouteille['origine'],
            'note' => $bouteille['note'],
            'souvenir' => $bouteille['souvenir'],
            'location' => self::emplacementJson($bouteille['emplacement']),
            'status' => $bouteille['statut'],
            'drink_by' => $bouteille['date_limite'],
            'urgent' => $bouteille['urgente'],
            'age_year' => $bouteille['anciennete'],
            'batch_id' => $bouteille['lot_ajout_id'],
            'has_photo' => $bouteille['photo'],
            'created_at' => self::dateHeure($bouteille['cree_le']),
            'updated_at' => self::dateHeure($bouteille['modifie_le']),
        ];
    }

    /**
     * Objet location (contrat §1.5).
     *
     * @param Emplacement $emplacement
     * @return array<string, mixed>
     */
    private static function emplacementJson(array $emplacement): array
    {
        $json = ['type' => $emplacement['type']];
        if (isset($emplacement['id'])) {
            $json['id'] = $emplacement['id'];
        }
        if (isset($emplacement['armoire_id'])) {
            $json['cabinet_id'] = $emplacement['armoire_id'];
        }
        if (isset($emplacement['libelle'])) {
            $json['label'] = $emplacement['libelle'];
        }

        return $json;
    }

    /** DATETIME ou DATETIME(3) UTC de MySQL → ISO 8601 à la milliseconde (contrat §1.2). */
    private static function dateHeure(string $valeur): string
    {
        return str_replace(' ', 'T', $valeur) . (str_contains($valeur, '.') ? '' : '.000') . 'Z';
    }
}
