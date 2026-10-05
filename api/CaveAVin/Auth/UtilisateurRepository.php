<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

use PDO;

/** Table users : lien entre le sub d'auth-service et la cave (schéma §1.1). */
final class UtilisateurRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** Crée l'utilisateur à sa première connexion, ou resynchronise son email. Renvoie users.id. */
    public function enregistrer(string $sub, string $email): int
    {
        $this->pdo->prepare(
            'INSERT INTO users (auth_sub, email) VALUES (?, ?)'
            . ' ON DUPLICATE KEY UPDATE email = VALUES(email), id = LAST_INSERT_ID(id)'
        )->execute([$sub, $email]);

        return (int) $this->pdo->lastInsertId();
    }

    public function idParSub(string $sub): ?int
    {
        $requete = $this->pdo->prepare('SELECT id FROM users WHERE auth_sub = ?');
        $requete->execute([$sub]);
        $id = $requete->fetchColumn();

        return $id === false ? null : (int) $id;
    }

    public function changerEmail(int $utilisateur, string $email): void
    {
        $this->pdo->prepare('UPDATE users SET email = ? WHERE id = ?')->execute([$email, $utilisateur]);
    }
}
