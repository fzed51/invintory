<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

use CaveAVin\Http\BaseController;
use CaveAVin\Http\ErreurApi;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** Routes /api/auth/* : session (ticket en cookie) et parcours publics de compte. */
final class AuthController extends BaseController
{
    public function __construct(
        private readonly ConnecterAction $connecter,
        private readonly RafraichirAction $rafraichir,
        private readonly AppareilsAction $appareils,
        private readonly CompteAction $compte,
    ) {
    }

    public function connexion(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $session = ($this->connecter)(
            $this->texte($request, 'email'),
            $this->texte($request, 'password'),
            $this->texteFacultatif($request, 'device'),
        );

        return $this->ouverte($response, $session);
    }

    public function rafraichir(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        try {
            $session = ($this->rafraichir)($this->ticket($request));
        } catch (SessionInvalide) {
            throw new ErreurApi(401, 'SESSION_INVALID', 'Session expirée. Reconnectez-vous.', [
                'Set-Cookie' => Cookies::effacerSession(),
            ]);
        } catch (SessionDejaRenouvelee) {
            throw new ErreurApi(409, 'SESSION_ALREADY_REFRESHED', 'Session déjà renouvelée. Réessayez.');
        } catch (ErreurAuthService $erreur) {
            if ($erreur->codeErreur === 'ACCESS_REVOKED') {
                throw new ErreurApi(403, 'ACCESS_REVOKED', 'Accès suspendu.', [
                    'Set-Cookie' => Cookies::effacerSession(),
                ]);
            }
            throw $erreur;
        }

        return $this->ouverte($response, $session);
    }

    public function deconnexion(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $this->appareils->deconnecter($this->ticket($request));

        return $response->withStatus(204)->withHeader('Set-Cookie', Cookies::effacerSession());
    }

    public function inscription(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $this->compte->inscrire($this->texte($request, 'email'), $this->texte($request, 'password'));

        return $this->json($response, ['status' => 'confirmation_pending'], 202);
    }

    public function renvoi(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $this->compte->renvoyerConfirmation($this->texte($request, 'email'));

        return $this->json($response, ['status' => 'confirmation_pending'], 202);
    }

    public function oubli(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $this->compte->oublierMotDePasse($this->texte($request, 'email'));

        return $this->json($response, ['status' => 'reset_pending'], 202);
    }

    public function nouveauMotDePasse(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $jeton = $request->getCookieParams()[Cookies::REINITIALISATION] ?? null;
        if (!is_string($jeton) || $jeton === '') {
            throw new ErreurApi(400, 'RESET_TOKEN_INVALID', 'Lien de réinitialisation invalide ou expiré.');
        }
        $motDePasse = $this->texte($request, 'password');

        try {
            $this->compte->reinitialiserMotDePasse($jeton, $motDePasse);
        } catch (ErreurAuthService $erreur) {
            if ($erreur->codeErreur === 'RESET_TOKEN_INVALID') {
                throw new ErreurApi(400, 'RESET_TOKEN_INVALID', 'Lien de réinitialisation invalide ou expiré.', [
                    'Set-Cookie' => Cookies::effacerReinitialisation(),
                ]);
            }
            throw $erreur;
        }

        return $response->withStatus(204)->withHeader('Set-Cookie', Cookies::effacerReinitialisation());
    }

    public function listerAppareils(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $appareils = $this->appareils->lister(Authentification::utilisateur($request), $this->ticket($request));

        return $this->json($response, ['devices' => array_map(static fn (array $appareil): array => [
            'id' => $appareil['id'],
            'device' => $appareil['appareil'],
            'created_at' => $appareil['cree_le'],
            'last_used_at' => $appareil['utilise_le'],
            'current' => $appareil['courant'],
        ], $appareils)]);
    }

    public function revoquerAppareil(
        ServerRequestInterface $request,
        ResponseInterface $response,
        string $id,
    ): ResponseInterface {
        $utilisateur = Authentification::utilisateur($request);
        if (preg_match('/^[1-9]\d{0,18}$/', $id) !== 1 || !$this->appareils->revoquer($utilisateur, (int) $id)) {
            throw ErreurApi::introuvable();
        }

        return $response->withStatus(204);
    }

    private function ouverte(ResponseInterface $reponse, SessionOuverte $session): ResponseInterface
    {
        return $this->json($reponse, ['access_token' => $session->jetonDAcces, 'expires_in' => $session->expireDans])
            ->withHeader('Cache-Control', 'no-store')
            ->withHeader('Set-Cookie', Cookies::session($session->ticket));
    }

    private function ticket(ServerRequestInterface $requete): ?string
    {
        $ticket = $requete->getCookieParams()[Cookies::SESSION] ?? null;

        return is_string($ticket) ? $ticket : null;
    }
}
