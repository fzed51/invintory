<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

use GuzzleHttp\Client;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\BadResponseException;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Promise\PromiseInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/**
 * Appels serveur-à-serveur à auth-service (intégration §3.1). Les en-têtes X-Client-* sont
 * posés sur toutes les routes, y compris celles qui portent déjà un Bearer.
 */
final class ClientAuthService
{
    public function __construct(private readonly ClientInterface $http)
    {
    }

    /**
     * @param (callable(RequestInterface, array<mixed>): PromiseInterface<ResponseInterface, mixed>)|null $gestionnaire
     *     gestionnaire Guzzle (doublure en test) ; réseau sinon
     */
    public static function creer(
        string $url,
        string $clientId,
        string $clientSecret,
        ?callable $gestionnaire = null,
    ): self {
        $options = [
            'base_uri' => rtrim($url, '/') . '/',
            'timeout' => 5.0,
            'headers' => [
                'X-Client-Id' => $clientId,
                'X-Client-Secret' => $clientSecret,
                'Accept' => 'application/json',
            ],
            'http_errors' => true,
        ];
        if ($gestionnaire !== null) {
            // Pile complète (http_errors compris), comme le client réseau.
            $options['handler'] = HandlerStack::create($gestionnaire);
        }

        return new self(new Client($options));
    }

    /** Inscription ou rattachement, indistinctement (§2.1). */
    public function inscrire(string $email, string $motDePasse): void
    {
        $this->envoyer('POST', 'users', ['email' => $email, 'password' => $motDePasse]);
    }

    public function renvoyerConfirmation(string $email): void
    {
        $this->envoyer('POST', 'users/confirm/resend', ['email' => $email]);
    }

    public function connecter(string $email, string $motDePasse): Paire
    {
        return $this->paire($this->envoyer('POST', 'sessions', ['email' => $email, 'password' => $motDePasse]));
    }

    /** Le jeton présenté ne vaut plus rien après cet appel, accepté ou non (§2.3). */
    public function rafraichir(string $jetonDeRafraichissement): Paire
    {
        $corps = ['refresh_token' => $jetonDeRafraichissement];

        return $this->paire($this->envoyer('POST', 'sessions/refresh', $corps));
    }

    /** @return array{id: string, email: string} */
    public function profil(string $jetonDAcces): array
    {
        $profil = $this->envoyer('GET', 'users/me', null, $jetonDAcces);

        return ['id' => $this->chaine($profil, 'id'), 'email' => $this->chaine($profil, 'email')];
    }

    /** Répond toujours 202 côté service, que l'adresse existe ou non (§2.5). */
    public function oublierMotDePasse(string $email): void
    {
        $this->envoyer('POST', 'users/password/forgot', ['email' => $email]);
    }

    public function reinitialiserMotDePasse(string $jetonDeReinitialisation, string $motDePasse): void
    {
        $this->envoyer('POST', 'users/password/reset', [
            'reset_token' => $jetonDeReinitialisation,
            'password' => $motDePasse,
        ]);
    }

    public function changerEmail(string $jetonDAcces, string $email, string $motDePasse): void
    {
        $this->envoyer('POST', 'users/me/email', ['email' => $email, 'password' => $motDePasse], $jetonDAcces);
    }

    /** @return array<string, mixed> */
    public function jwks(): array
    {
        return $this->envoyer('GET', '.well-known/jwks.json');
    }

    /**
     * @param array<string, mixed>|null $corps
     * @return array<string, mixed>
     */
    private function envoyer(string $methode, string $chemin, ?array $corps = null, ?string $jetonDAcces = null): array
    {
        $options = [];
        if ($corps !== null) {
            $options['json'] = $corps;
        }
        if ($jetonDAcces !== null) {
            $options['headers'] = ['Authorization' => 'Bearer ' . $jetonDAcces];
        }

        try {
            $reponse = $this->http->request($methode, $chemin, $options);
        } catch (BadResponseException $exception) {
            throw $this->refus($exception->getResponse(), $exception);
        } catch (GuzzleException $exception) {
            // Panne réseau, délai dépassé : réessayer a du sens, contrairement à un refus.
            throw new ErreurAuthService('AUTH_SERVICE_UNAVAILABLE', $exception->getMessage(), 503, null, $exception);
        }

        $donnees = json_decode((string) $reponse->getBody(), true);

        /** @var array<string, mixed> */
        return is_array($donnees) ? $donnees : [];
    }

    private function refus(ResponseInterface $reponse, BadResponseException $exception): ErreurAuthService
    {
        if ($reponse->getStatusCode() >= 500) {
            return new ErreurAuthService('AUTH_SERVICE_UNAVAILABLE', $exception->getMessage(), 503, null, $exception);
        }

        $donnees = json_decode((string) $reponse->getBody(), true);
        $erreur = is_array($donnees) ? ($donnees['error'] ?? null) : null;
        $code = is_array($erreur) && is_string($erreur['code'] ?? null) ? $erreur['code'] : 'UNKNOWN';
        $message = is_array($erreur) && is_string($erreur['message'] ?? null)
            ? $erreur['message']
            : $exception->getMessage();
        $delai = $reponse->getHeaderLine('Retry-After');

        return new ErreurAuthService(
            $code,
            $message,
            $reponse->getStatusCode(),
            $delai === '' ? null : $delai,
            $exception,
        );
    }

    /** @param array<string, mixed> $donnees */
    private function paire(array $donnees): Paire
    {
        return new Paire(
            $this->chaine($donnees, 'access_token'),
            $this->chaine($donnees, 'refresh_token'),
            is_int($donnees['expires_in'] ?? null) ? $donnees['expires_in'] : 0,
        );
    }

    /** @param array<string, mixed> $donnees */
    private function chaine(array $donnees, string $cle): string
    {
        $valeur = $donnees[$cle] ?? null;
        if (!is_string($valeur) || $valeur === '') {
            throw new ErreurAuthService('AUTH_SERVICE_UNAVAILABLE', sprintf('Réponse sans « %s ».', $cle), 503);
        }

        return $valeur;
    }
}
