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
     * Exécute $travail dans une transaction ; annulée si une exception s'échappe. Appelée
     * dans une transaction déjà ouverte, elle devient un point de sauvegarde : son échec
     * n'annule qu'elle (une mutation rejetée dans le lot de /sync).
     *
     * @template T
     * @param callable(): T $travail
     * @return T
     */
    public function transaction(callable $travail): mixed
    {
        $point = $this->pdo->inTransaction() ? 'sp_' . bin2hex(random_bytes(6)) : null;
        $point === null ? $this->pdo->beginTransaction() : $this->pdo->exec('SAVEPOINT ' . $point);
        try {
            $resultat = $travail();
            $point === null ? $this->pdo->commit() : $this->pdo->exec('RELEASE SAVEPOINT ' . $point);

            return $resultat;
        } catch (Throwable $erreur) {
            $point === null ? $this->pdo->rollBack() : $this->pdo->exec('ROLLBACK TO SAVEPOINT ' . $point);
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
