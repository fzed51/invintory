<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Support;

use Psr\Http\Message\ResponseInterface;

/**
 * Routes métier appelées au nom d'un utilisateur connecté (alice par défaut). Les bouteilles
 * sont insérées directement en base : leur API arrive avec les étapes 3b et 3c.
 */
abstract class CaveTestCase extends AuthTestCase
{
    protected string $jeton;

    private int $references = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->jeton = $this->connecter();
    }

    /** @param array<string, mixed>|null $corps */
    protected function api(
        string $methode,
        string $chemin,
        ?array $corps = null,
        ?string $jeton = null,
    ): ResponseInterface {
        return $this->appeler($methode, $chemin, $corps, $this->bearer($jeton ?? $this->jeton));
    }

    /**
     * Appel attendu en succès : renvoie le corps JSON décodé.
     *
     * @param array<string, mixed>|null $corps
     * @return array<string, mixed>
     */
    protected function reussir(string $methode, string $chemin, ?array $corps = null, int $statut = 200): array
    {
        $reponse = $this->api($methode, $chemin, $corps);
        self::assertSame($statut, $reponse->getStatusCode(), (string) $reponse->getBody());

        return $this->json($reponse);
    }

    protected function idUtilisateur(string $email = 'alice@exemple.fr'): int
    {
        $requete = $this->pdo->prepare('SELECT id FROM users WHERE email = ?');
        $requete->execute([$email]);

        return (int) $requete->fetchColumn();
    }

    /** Insère une bouteille rangée à l'emplacement donné ; renvoie son id. */
    protected function insererBouteille(
        string $emplacement,
        ?int $id = null,
        string $statut = 'en_cave',
        ?string $email = null,
        ?string $dernierMouvement = null,
    ): int {
        $this->pdo->prepare(
            'INSERT INTO bouteilles (user_id, reference, type, date_entree, origine, emplacement_type,'
            . ' etagere_id, carton_id, statut, date_dernier_mouvement_applique)'
            . " VALUES (?, ?, 'rouge', '2026-10-01', 'achetee', ?, ?, ?, ?, ?)"
        )->execute([
            $this->idUtilisateur($email ?? 'alice@exemple.fr'),
            sprintf('T%03d', ++$this->references),
            $emplacement,
            $emplacement === 'etagere' ? $id : null,
            $emplacement === 'carton' ? $id : null,
            $statut,
            $dernierMouvement,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /** @return list<array<string, mixed>> */
    protected function lignes(string $sql): array
    {
        $requete = $this->pdo->query($sql);
        self::assertNotFalse($requete);

        /** @var list<array<string, mixed>> */
        return $requete->fetchAll();
    }

    /**
     * Crée une armoire par l'API ; renvoie sa représentation.
     *
     * @param list<int> $capacites capacité de chaque étagère
     * @return array<string, mixed>
     */
    protected function creerArmoire(string $nom, array $capacites): array
    {
        return $this->reussir('POST', '/api/cabinets', [
            'name' => $nom,
            'shelves' => array_map(fn (int $capacite): array => ['capacity' => $capacite], $capacites),
        ], 201);
    }

    /**
     * @param array<string, mixed> $armoire armoire renvoyée par l'API
     * @return list<int> ids de ses étagères
     */
    protected function etageres(array $armoire): array
    {
        self::assertIsArray($armoire['shelves']);
        $ids = [];
        foreach ($armoire['shelves'] as $etagere) {
            self::assertIsArray($etagere);
            self::assertIsInt($etagere['id']);
            $ids[] = $etagere['id'];
        }

        return $ids;
    }

    protected function creerCarton(string $libelle, int $capacite): int
    {
        $carton = $this->reussir('POST', '/api/boxes', ['label' => $libelle, 'capacity' => $capacite], 201);
        self::assertIsInt($carton['id']);

        return $carton['id'];
    }
}
