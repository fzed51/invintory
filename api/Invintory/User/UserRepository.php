<?php

namespace Invintory\User;

class UserRepository
{
    private \PDO $pdo;

    public function __construct(\PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function findByEmail(string $email): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM users WHERE email = :email');
        $stmt->execute(['email' => $email]);
        $result = $stmt->fetch();

        return $result ?: null;
    }

    public function findByToken(string $token): ?array
    {
        $stmt = $this->pdo->prepare('SELECT id, email, created_at FROM users WHERE token = :token');
        $stmt->execute(['token' => $token]);
        $result = $stmt->fetch();

        return $result ?: null;
    }

    public function create(string $email, string $passwordHash): array
    {
        $createdAt = date('Y-m-d H:i:s');
        $stmt = $this->pdo->prepare(
            'INSERT INTO users (email, password_hash, created_at) VALUES (:email, :password_hash, :created_at)'
        );
        $stmt->execute([
            'email' => $email,
            'password_hash' => $passwordHash,
            'created_at' => $createdAt,
        ]);

        return [
            'id' => (int) $this->pdo->lastInsertId(),
            'email' => $email,
            'created_at' => $createdAt,
        ];
    }

    public function updateToken(int $userId, string $token): void
    {
        $stmt = $this->pdo->prepare('UPDATE users SET token = :token WHERE id = :id');
        $stmt->execute(['token' => $token, 'id' => $userId]);
    }
}
