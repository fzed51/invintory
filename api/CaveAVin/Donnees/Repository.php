<?php

declare(strict_types=1);

namespace CaveAVin\Donnees;

use PDO;
use Throwable;

/**
 * Base des repositories métier (Arch §6.2) : connexion commune et isolation stricte. Chaque
 * méthode publique reçoit l'utilisateur courant, et toute requête le filtre (`user_id = ?`,
 * directement ou par la table parente).
 */
abstract class Repository
{
    public function __construct(protected readonly PDO $pdo)
    {
    }

    /**
     * Exécute $travail dans une transaction ; annulée si une exception s'échappe.
     *
     * @template T
     * @param callable(): T $travail
     * @return T
     */
    public function transaction(callable $travail): mixed
    {
        $this->pdo->beginTransaction();
        try {
            $resultat = $travail();
            $this->pdo->commit();

            return $resultat;
        } catch (Throwable $erreur) {
            $this->pdo->rollBack();
            throw $erreur;
        }
    }

    /**
     * @param list<mixed> $parametres
     * @return list<array<string, mixed>>
     */
    protected function lignes(string $sql, array $parametres = []): array
    {
        $requete = $this->pdo->prepare($sql);
        $requete->execute($parametres);

        /** @var list<array<string, mixed>> */
        return $requete->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * @param list<mixed> $parametres
     * @return array<string, mixed>|null
     */
    protected function ligne(string $sql, array $parametres = []): ?array
    {
        return $this->lignes($sql, $parametres)[0] ?? null;
    }

    /** @param list<mixed> $parametres */
    protected function valeur(string $sql, array $parametres = []): mixed
    {
        $ligne = $this->ligne($sql, $parametres);

        return $ligne === null ? null : reset($ligne);
    }

    /**
     * @param list<mixed> $parametres
     * @return int lignes touchées
     */
    protected function executer(string $sql, array $parametres = []): int
    {
        $requete = $this->pdo->prepare($sql);
        $requete->execute($parametres);

        return $requete->rowCount();
    }
}
