<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

/**
 * Parcours de compte délégués à auth-service (inscription, mot de passe, email) et profil.
 * Les refus du service remontent tels quels (ErreurAuthService), relayés par ErreurHandler.
 */
final class CompteAction
{
    public function __construct(
        private readonly ClientAuthService $client,
        private readonly UtilisateurRepository $utilisateurs,
    ) {
    }

    public function inscrire(string $email, string $motDePasse): void
    {
        $this->client->inscrire($email, $motDePasse);
    }

    public function renvoyerConfirmation(string $email): void
    {
        $this->client->renvoyerConfirmation($email);
    }

    /** Anti-énumération : rien ne distingue une adresse inconnue (§2.5). */
    public function oublierMotDePasse(string $email): void
    {
        $this->client->oublierMotDePasse($email);
    }

    /** Révoque toutes les sessions de l'utilisateur chez auth-service, toutes applications (§2.5). */
    public function reinitialiserMotDePasse(string $jeton, string $motDePasse): void
    {
        $this->client->reinitialiserMotDePasse($jeton, $motDePasse);
    }

    /** @return array{email: string} */
    public function profil(int $utilisateur, string $jetonDAcces): array
    {
        $email = $this->client->profil($jetonDAcces)['email'];
        $this->utilisateurs->changerEmail($utilisateur, $email);

        return ['email' => $email];
    }

    /** L'adresse ne change qu'à l'ouverture du lien reçu sur la nouvelle (§2.6). */
    public function changerEmail(string $jetonDAcces, string $email, string $motDePasse): void
    {
        $this->client->changerEmail($jetonDAcces, $email, $motDePasse);
    }
}
