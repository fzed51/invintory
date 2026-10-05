<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Auth;

use CaveAVin\Tests\Support\AuthTestCase;

/** Inscription, renvoi du lien, mot de passe oublié, profil et changement d'email. */
final class CompteEtInscriptionTest extends AuthTestCase
{
    public function testInscription(): void
    {
        $reponse = $this->inscrire();

        self::assertSame(202, $reponse->getStatusCode());
        self::assertSame(['statut' => 'confirmation_en_attente'], $this->json($reponse));
        self::assertSame('user_registration', $this->service->emails('alice@exemple.fr')[0]['type'] ?? null);
    }

    public function testInscriptionRefuseeParLeServiceEstRelayee(): void
    {
        $this->service->creerCompte('alice@exemple.fr', self::MOT_DE_PASSE);

        $reponse = $this->inscrire();

        self::assertSame(409, $reponse->getStatusCode());
        self::assertSame('EMAIL_ALREADY_USED', $this->codeErreur($reponse));
    }

    public function testPlafondDEmailsRelayeAvecRetryAfter(): void
    {
        for ($i = 0; $i < 3; $i++) {
            $this->inscrire();
        }

        $reponse = $this->appeler('POST', '/api/auth/inscription/renvoi', ['email' => 'alice@exemple.fr']);

        self::assertSame(429, $reponse->getStatusCode());
        self::assertSame('RATE_LIMITED', $this->codeErreur($reponse));
        self::assertSame('900', $reponse->getHeaderLine('Retry-After'));
    }

    public function testRenvoiDuLien(): void
    {
        $this->inscrire();

        $reponse = $this->appeler('POST', '/api/auth/inscription/renvoi', ['email' => 'alice@exemple.fr']);

        self::assertSame(202, $reponse->getStatusCode());
        self::assertCount(2, $this->service->emails('alice@exemple.fr'));
        $sansDemande = $this->appeler('POST', '/api/auth/inscription/renvoi', ['email' => 'bob@exemple.fr']);
        self::assertSame(404, $sansDemande->getStatusCode());
        self::assertSame('NO_PENDING_REGISTRATION', $this->codeErreur($sansDemande));
    }

    public function testMotDePasseOublieRepondLaMemeChoseQueLeCompteExisteOuNon(): void
    {
        $this->service->creerCompte('alice@exemple.fr', self::MOT_DE_PASSE);

        $existant = $this->appeler('POST', '/api/auth/mot-de-passe/oubli', ['email' => 'alice@exemple.fr']);
        $inconnu = $this->appeler('POST', '/api/auth/mot-de-passe/oubli', ['email' => 'inconnu@exemple.fr']);

        self::assertSame([202, 202], [$existant->getStatusCode(), $inconnu->getStatusCode()]);
        self::assertSame((string) $existant->getBody(), (string) $inconnu->getBody());
        self::assertSame(['statut' => 'reinitialisation_en_attente'], $this->json($inconnu));
    }

    public function testChampsManquants(): void
    {
        foreach (['/api/auth/inscription', '/api/auth/inscription/renvoi', '/api/auth/mot-de-passe/oubli'] as $chemin) {
            $reponse = $this->appeler('POST', $chemin, []);
            self::assertSame(400, $reponse->getStatusCode(), $chemin);
            self::assertSame('VALIDATION_FAILED', $this->codeErreur($reponse));
        }
        self::assertSame([], $this->gestionnaire->requetes);
    }

    private function inscrire(): \Psr\Http\Message\ResponseInterface
    {
        $identifiants = ['email' => 'alice@exemple.fr', 'password' => self::MOT_DE_PASSE];

        return $this->appeler('POST', '/api/auth/inscription', $identifiants);
    }

    public function testProfilEtResynchronisationDeLEmail(): void
    {
        $jeton = $this->connecter();
        $this->pdo->exec("UPDATE users SET email = 'ancienne@exemple.fr'");

        $reponse = $this->appeler('GET', '/api/compte', null, ['Authorization' => 'Bearer ' . $jeton]);

        self::assertSame(200, $reponse->getStatusCode());
        self::assertSame(['email' => 'alice@exemple.fr'], $this->json($reponse));
        self::assertSame('alice@exemple.fr', $this->valeur('SELECT email FROM users'));
    }

    public function testChangementDEmail(): void
    {
        $jeton = $this->connecter();

        $reponse = $this->appeler(
            'POST',
            '/api/compte/email',
            ['email' => 'alice.nouvelle@exemple.fr', 'password' => self::MOT_DE_PASSE],
            ['Authorization' => 'Bearer ' . $jeton],
        );

        self::assertSame(202, $reponse->getStatusCode());
        self::assertSame(['statut' => 'confirmation_en_attente'], $this->json($reponse));
        self::assertSame('email_change', $this->service->emails('alice.nouvelle@exemple.fr')[0]['type'] ?? null);
    }

    public function testChangementDEmailAvecUnMauvaisMotDePasse(): void
    {
        $jeton = $this->connecter();

        $reponse = $this->appeler(
            'POST',
            '/api/compte/email',
            ['email' => 'alice.nouvelle@exemple.fr', 'password' => 'mauvais-mdp'],
            ['Authorization' => 'Bearer ' . $jeton],
        );

        self::assertSame(401, $reponse->getStatusCode());
        self::assertSame('INVALID_CREDENTIALS', $this->codeErreur($reponse));
    }
}
