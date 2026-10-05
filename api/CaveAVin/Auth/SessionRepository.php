<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

use PDO;

/**
 * Table user_sessions : une ligne par appareil connecté (Arch §2.2, schéma §1.2).
 *
 * Exception assumée à la règle « toute requête filtre par user_id » : les méthodes qui
 * partent du ticket (verrouillerParTicket, supprimerParEmpreinte) servent à identifier
 * l'utilisateur, avant qu'on le connaisse. L'empreinte d'un secret de 256 bits, unique en
 * base, fait office de preuve d'appartenance. Toutes les autres méthodes filtrent par user_id.
 *
 * @phpstan-type Session array{id: int, user_id: int, refresh_session_hash: string,
 *     previous_refresh_session_hash: ?string, auth_refresh_token: string, utilisee: int}
 */
final class SessionRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function creer(
        int $utilisateur,
        string $empreinte,
        string $refreshToken,
        ?string $appareil,
        int $maintenant,
    ): void {
        $date = gmdate('Y-m-d H:i:s', $maintenant);
        $this->pdo->prepare(
            'INSERT INTO user_sessions'
            . ' (user_id, refresh_session_hash, auth_refresh_token, device_label, created_at, last_used_at)'
            . ' VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$utilisateur, $empreinte, $refreshToken, $appareil, $date, $date]);
    }

    /**
     * Ligne dont le ticket courant OU précédent a cette empreinte, verrouillée jusqu'à la fin
     * de la transaction : les rotations d'une même session sont sérialisées (Arch §2.3).
     *
     * @return Session|null
     */
    public function verrouillerParTicket(string $empreinte): ?array
    {
        $requete = $this->pdo->prepare(
            'SELECT id, user_id, refresh_session_hash, previous_refresh_session_hash, auth_refresh_token,'
            . ' UNIX_TIMESTAMP(last_used_at) AS utilisee'
            . ' FROM user_sessions WHERE refresh_session_hash = ? OR previous_refresh_session_hash = ?'
            . ' FOR UPDATE'
        );
        $requete->execute([$empreinte, $empreinte]);
        $ligne = $requete->fetch();
        if (!is_array($ligne)) {
            return null;
        }

        return [
            'id' => (int) $ligne['id'],
            'user_id' => (int) $ligne['user_id'],
            'refresh_session_hash' => (string) $ligne['refresh_session_hash'],
            'previous_refresh_session_hash' => $ligne['previous_refresh_session_hash'] === null
                ? null
                : (string) $ligne['previous_refresh_session_hash'],
            'auth_refresh_token' => (string) $ligne['auth_refresh_token'],
            'utilisee' => (int) $ligne['utilisee'],
        ];
    }

    public function tourner(int $id, string $nouvelle, string $precedente, string $refreshToken, int $maintenant): void
    {
        $this->pdo->prepare(
            'UPDATE user_sessions SET refresh_session_hash = ?, previous_refresh_session_hash = ?,'
            . ' auth_refresh_token = ?, last_used_at = ? WHERE id = ?'
        )->execute([$nouvelle, $precedente, $refreshToken, gmdate('Y-m-d H:i:s', $maintenant), $id]);
    }

    /** Suppression d'une ligne déjà identifiée par verrouillerParTicket. */
    public function supprimer(int $id): void
    {
        $this->pdo->prepare('DELETE FROM user_sessions WHERE id = ?')->execute([$id]);
    }

    /** Déconnexion de l'appareil : seul le ticket courant compte, jamais le précédent. */
    public function supprimerParEmpreinte(string $empreinte): void
    {
        $this->pdo->prepare('DELETE FROM user_sessions WHERE refresh_session_hash = ?')->execute([$empreinte]);
    }

    /**
     * @return list<array{id: int, appareil: ?string, cree_le: string, utilise_le: string, courant: bool}>
     */
    public function listerPour(int $utilisateur, ?string $empreinteCourante): array
    {
        $requete = $this->pdo->prepare(
            'SELECT id, device_label, UNIX_TIMESTAMP(created_at) AS cree, UNIX_TIMESTAMP(last_used_at) AS utilisee,'
            . ' refresh_session_hash = ? AS courant'
            . ' FROM user_sessions WHERE user_id = ? ORDER BY last_used_at DESC, id DESC'
        );
        $requete->execute([$empreinteCourante ?? '', $utilisateur]);

        return array_values(array_map(static fn (array $ligne): array => [
            'id' => (int) $ligne['id'],
            'appareil' => $ligne['device_label'] === null ? null : (string) $ligne['device_label'],
            'cree_le' => gmdate('Y-m-d\TH:i:s\Z', (int) $ligne['cree']),
            'utilise_le' => gmdate('Y-m-d\TH:i:s\Z', (int) $ligne['utilisee']),
            'courant' => (bool) $ligne['courant'],
        ], $requete->fetchAll()));
    }

    /** @return bool faux si la session n'existe pas ou appartient à un autre utilisateur */
    public function supprimerPour(int $utilisateur, int $id): bool
    {
        $requete = $this->pdo->prepare('DELETE FROM user_sessions WHERE id = ? AND user_id = ?');
        $requete->execute([$id, $utilisateur]);

        return $requete->rowCount() === 1;
    }
}
