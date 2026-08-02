<?php

namespace Invintory\Cellar;

class CellarRepository
{
    private \PDO $pdo;

    public function __construct(\PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function findByUserId(int $userId): ?array
    {
        $statement = $this->pdo->prepare('SELECT payload, updated_at FROM cellars WHERE user_id = :user_id');
        $statement->execute(['user_id' => $userId]);
        $row = $statement->fetch();

        if (!$row) {
            return null;
        }

        return [
            'payload' => (string) $row['payload'],
            'updatedAt' => (string) $row['updated_at'],
        ];
    }

    public function saveByUserId(int $userId, string $payload, string $updatedAt): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO cellars (user_id, payload, updated_at)
             VALUES (:user_id, :payload, :updated_at)
             ON CONFLICT(user_id) DO UPDATE SET
                payload = excluded.payload,
                updated_at = excluded.updated_at'
        );

        $statement->execute([
            'user_id' => $userId,
            'payload' => $payload,
            'updated_at' => $updatedAt,
        ]);
    }
}
