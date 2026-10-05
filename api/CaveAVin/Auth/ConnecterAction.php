<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

use CaveAVin\Horloge;

/**
 * Connexion par email et mot de passe (Arch §2.2) : auth-service émet la paire, le refresh
 * token reste en base, la PWA reçoit l'access token et un ticket neuf.
 */
final class ConnecterAction
{
    public function __construct(
        private readonly ClientAuthService $client,
        private readonly VerificateurDeJeton $verificateur,
        private readonly UtilisateurRepository $utilisateurs,
        private readonly SessionRepository $sessions,
        private readonly Horloge $horloge,
    ) {
    }

    public function __invoke(string $email, string $motDePasse, ?string $appareil): SessionOuverte
    {
        $paire = $this->client->connecter($email, $motDePasse);
        // Vérifier le jeton reçu valide aussi notre configuration (aud, iss) dès la connexion.
        $sub = $this->verificateur->verifier($paire->jetonDAcces);
        $profil = $this->client->profil($paire->jetonDAcces);
        $utilisateur = $this->utilisateurs->enregistrer($sub, $profil['email']);

        $ticket = Ticket::nouveau();
        $this->sessions->creer(
            $utilisateur,
            Ticket::empreinte($ticket),
            $paire->jetonDeRafraichissement,
            $appareil === null ? null : mb_substr($appareil, 0, 255),
            $this->horloge->maintenant(),
        );

        return new SessionOuverte($paire->jetonDAcces, $paire->expireDans, $ticket);
    }
}
