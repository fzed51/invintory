<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

use CaveAVin\Horloge;
use CaveAVin\Journal;
use PDO;
use Throwable;

/**
 * Rafraîchissement par le ticket (décision P3) :
 * - la ligne est verrouillée (SELECT … FOR UPDATE) : une seule rotation à la fois par
 *   session, donc jamais deux appels concurrents au service avec le même refresh token,
 *   ce qui déclencherait sa révocation en cascade (intégration §2.4) ;
 * - le ticket change à chaque rotation ; l'ancien représenté au-delà de 10 s est un rejeu
 *   (vol probable) et supprime la session, dans les 10 s c'est une requête concurrente ;
 * - 30 jours sans usage : session expirée.
 */
final class RafraichirAction
{
    public const FENETRE_CONCURRENCE = 10;
    public const DUREE_INACTIVITE = 30 * 86400;

    public function __construct(
        private readonly PDO $pdo,
        private readonly SessionRepository $sessions,
        private readonly ClientAuthService $client,
        private readonly Horloge $horloge,
        private readonly Journal $journal,
    ) {
    }

    /**
     * @throws SessionInvalide reconnexion requise
     * @throws SessionDejaRenouvelee réessayer avec le nouveau ticket
     * @throws ErreurAuthService ACCESS_REVOKED (session supprimée) ou service indisponible
     */
    public function __invoke(?string $ticket): SessionOuverte
    {
        if ($ticket === null || $ticket === '') {
            throw new SessionInvalide('Aucun ticket.');
        }
        $empreinte = Ticket::empreinte($ticket);
        $maintenant = $this->horloge->maintenant();

        $this->pdo->beginTransaction();
        try {
            $session = $this->sessions->verrouillerParTicket($empreinte);
            if ($session === null) {
                throw new SessionInvalide('Ticket inconnu.');
            }

            if ($session['previous_refresh_session_hash'] === $empreinte) {
                if ($maintenant - $session['utilisee'] <= self::FENETRE_CONCURRENCE) {
                    throw new SessionDejaRenouvelee('Ticket déjà renouvelé.');
                }
                $this->fermer($session['id']);
                $this->journal->ecrire('warning', sprintf(
                    'rejeu du ticket de la session %d (utilisateur %d) : session supprimée',
                    $session['id'],
                    $session['user_id'],
                ));
                throw new SessionInvalide('Ticket rejoué.');
            }

            if ($maintenant - $session['utilisee'] > self::DUREE_INACTIVITE) {
                $this->fermer($session['id']);
                throw new SessionInvalide('Session expirée.');
            }

            try {
                $paire = $this->client->rafraichir($session['auth_refresh_token']);
            } catch (ErreurAuthService $erreur) {
                // Refus définitifs : la session ne vaut plus rien (intégration §3.4).
                if (in_array($erreur->codeErreur, ['REFRESH_TOKEN_INVALID', 'ACCESS_REVOKED'], true)) {
                    $this->fermer($session['id']);
                    if ($erreur->codeErreur === 'REFRESH_TOKEN_INVALID') {
                        throw new SessionInvalide('Refresh token refusé.', 0, $erreur);
                    }
                }
                throw $erreur;
            }

            $nouveau = Ticket::nouveau();
            $this->sessions->tourner(
                $session['id'],
                Ticket::empreinte($nouveau),
                $empreinte,
                $paire->jetonDeRafraichissement,
                $maintenant,
            );
            $this->pdo->commit();

            return new SessionOuverte($paire->jetonDAcces, $paire->expireDans, $nouveau);
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }
    }

    /** Supprime la session et valide aussitôt : la suppression survit à l'exception qui suit. */
    private function fermer(int $id): void
    {
        $this->sessions->supprimer($id);
        $this->pdo->commit();
    }
}
