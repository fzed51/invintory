<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Doublure;

use Closure;
use Firebase\JWT\JWT;
use GuzzleHttp\Psr7\Response;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;
use RuntimeException;
use Throwable;

/**
 * Doublure d'auth-service, fidèle au contrat de docs/ressources/auth-service-integration.md
 * (§2 à §4), utilisée tant que les identifiants réels manquent (suivi, P13) :
 * - en processus, par les tests PHPUnit (gestionnaire Guzzle, voir GestionnaireSimule) ;
 * - en HTTP, par le service « auth » de la doublure Docker (docker/auth-simule/index.php).
 *
 * L'état vit dans un fichier JSON verrouillé (flock) : plusieurs processus partagent le
 * même service. Les emails ne partent pas : ils sont consignés et lisibles par emails().
 *
 * @phpstan-type Etat array{
 *     cle: array{kid: string, privee: string, n: string, e: string},
 *     utilisateurs: array<string, array{email: string, empreinte: string, cree: int, revoque: bool}>,
 *     demandes: array<string, array{type: string, email: string, empreinte?: string, user?: string, cree: int,
 *         utilisee: bool}>,
 *     reinitialisations: array<string, array{user: string, expire: int, utilisee: bool}>,
 *     sessions: array<string, array{user: string, appareil: string, cree: int, utilisee: int, revoquee: bool}>,
 *     rafraichissements: array<string, array{session: string, expire: int, utilise: bool}>,
 *     emails: list<array{a: string, type: string, lien: ?string, quand: int}>,
 *     rotations: int
 * }
 */
final class AuthServiceSimule
{
    private const DUREE_ACCES = 900;
    private const DUREE_RAFRAICHISSEMENT = 30 * 24 * 3600;
    private const DUREE_LIEN_INSCRIPTION = 24 * 3600;
    private const DUREE_LIEN = 3600;
    private const DUREE_REINITIALISATION = 900;
    private const EMAILS_PAR_QUART_D_HEURE = 3;

    private readonly Closure $horloge;

    /** @var Etat */
    private array $etat;

    /**
     * @param array{client_id: string, client_secret: string, redirect_uri: string, iss: string,
     *     url_publique: string, delai_rotation_ms?: int} $config
     * @param (Closure(): int)|null $horloge
     */
    public function __construct(
        private readonly string $dossier,
        private readonly array $config,
        ?Closure $horloge = null,
    ) {
        $this->horloge = $horloge ?? time(...);
    }

    /**
     * @return array{client_id: string, client_secret: string, redirect_uri: string, iss: string,
     *     url_publique: string}
     */
    public static function configurationDeTest(): array
    {
        return [
            'client_id' => 'invintory-test',
            'client_secret' => 'secret-de-test',
            'redirect_uri' => 'https://invintory.test/api/auth/callback',
            'iss' => 'https://auth.test',
            'url_publique' => 'https://auth.test',
        ];
    }

    public static function effacer(string $dossier): void
    {
        foreach (glob($dossier . '/*') ?: [] as $fichier) {
            unlink($fichier);
        }
        if (is_dir($dossier)) {
            rmdir($dossier);
        }
    }

    public function traiter(RequestInterface $requete): ResponseInterface
    {
        return $this->avecEtat(fn (): ResponseInterface => $this->router($requete));
    }

    /** @return list<array{a: string, type: string, lien: ?string}> */
    public function emails(string $adresse): array
    {
        return $this->avecEtat(fn (): array => array_values(array_map(
            static fn (array $email): array => ['a' => $email['a'], 'type' => $email['type'], 'lien' => $email['lien']],
            array_filter($this->etat['emails'], static fn (array $email): bool => $email['a'] === $adresse),
        )));
    }

    public function nombreDeRotations(): int
    {
        return $this->avecEtat(fn (): int => $this->etat['rotations']);
    }

    /** Ce que fait l'exploitant du service à la main (Arch §2.3) : retirer l'accès d'un compte. */
    public function revoquerAcces(string $email): void
    {
        $this->avecEtat(function () use ($email): void {
            $id = $this->utilisateurParEmail($email) ?? throw new RuntimeException('Compte inconnu : ' . $email);
            $this->etat['utilisateurs'][$id]['revoque'] = true;
        });
    }

    private function router(RequestInterface $requete): ResponseInterface
    {
        $methode = $requete->getMethod();
        $chemin = $requete->getUri()->getPath();

        if ($methode === 'GET' && $chemin === '/health') {
            return $this->json(200, ['status' => 'ok']);
        }
        if ($methode === 'GET' && $chemin === '/.well-known/jwks.json') {
            return $this->jwks();
        }
        if (
            $chemin !== '/users/confirm/resend'
            && preg_match('#^/users/confirm/([A-Za-z0-9_-]+)$#', $chemin, $m) === 1
            && in_array($methode, ['GET', 'POST'], true)
        ) {
            return $this->suivreLien($m[1], $methode);
        }

        if (
            !hash_equals($this->config['client_id'], $requete->getHeaderLine('X-Client-Id'))
            || !hash_equals($this->config['client_secret'], $requete->getHeaderLine('X-Client-Secret'))
        ) {
            return $this->erreur(401, 'UNAUTHORIZED', 'Application non authentifiée.');
        }

        $corps = json_decode((string) $requete->getBody(), true);
        $corps = is_array($corps) ? $corps : [];

        return match (true) {
            $methode === 'POST' && $chemin === '/users' => $this->inscrire($corps),
            $methode === 'POST' && $chemin === '/users/confirm/resend' => $this->renvoyer($corps),
            $methode === 'POST' && $chemin === '/sessions' => $this->connecter($corps, $requete),
            $methode === 'POST' && $chemin === '/sessions/refresh' => $this->rafraichir($corps),
            $methode === 'POST' && $chemin === '/users/password/forgot' => $this->oublier($corps),
            $methode === 'POST' && $chemin === '/users/password/reset' => $this->reinitialiser($corps),
            $methode === 'GET' && $chemin === '/users/me' => $this->avecJeton($requete, $this->profil(...)),
            $methode === 'POST' && $chemin === '/users/me/email' => $this->avecJeton(
                $requete,
                fn (string $id): ResponseInterface => $this->changerEmail($id, $corps),
            ),
            $methode === 'GET' && $chemin === '/sessions' => $this->avecJeton($requete, $this->sessions(...)),
            $methode === 'DELETE' && str_starts_with($chemin, '/sessions/') => $this->avecJeton(
                $requete,
                fn (string $id): ResponseInterface => $this->revoquerSession($id, rawurldecode(substr($chemin, 10))),
            ),
            default => $this->erreur(404, 'NOT_FOUND', 'Route inconnue.'),
        };
    }

    /** @param array<mixed> $corps */
    private function inscrire(array $corps): ResponseInterface
    {
        [$email, $motDePasse] = [$corps['email'] ?? null, $corps['password'] ?? null];
        if (!$this->emailValide($email) || !$this->motDePasseValide($motDePasse)) {
            return $this->erreur(400, 'VALIDATION_FAILED', 'Email ou mot de passe invalide.');
        }
        if ($this->utilisateurParEmail($email) !== null) {
            return $this->erreur(409, 'EMAIL_ALREADY_USED', 'Adresse déjà utilisée.');
        }

        $demande = ['email' => $email, 'empreinte' => $this->empreinte($motDePasse)];

        return $this->envoyerLien($email, 'user_registration', $demande)
            ?? $this->json(202, ['status' => 'confirmation_pending']);
    }

    /** @param array<mixed> $corps */
    private function renvoyer(array $corps): ResponseInterface
    {
        $email = $corps['email'] ?? null;
        $demande = null;
        foreach ($this->etat['demandes'] as $candidate) {
            if ($candidate['type'] === 'user_registration' && $candidate['email'] === $email) {
                $demande = $candidate;
            }
        }
        if (!is_string($email) || $demande === null || $this->utilisateurParEmail($email) !== null) {
            return $this->erreur(404, 'NO_PENDING_REGISTRATION', 'Aucune inscription en attente.');
        }

        $nouvelle = ['email' => $email, 'empreinte' => $demande['empreinte'] ?? ''];

        return $this->envoyerLien($email, 'user_registration', $nouvelle)
            ?? $this->json(202, ['status' => 'confirmation_pending']);
    }

    /** @param array<mixed> $corps */
    private function connecter(array $corps, RequestInterface $requete): ResponseInterface
    {
        $id = is_string($corps['email'] ?? null) ? $this->utilisateurParEmail($corps['email']) : null;
        if ($id === null || !$this->motDePasseCorrect($id, $corps['password'] ?? null)) {
            return $this->erreur(401, 'INVALID_CREDENTIALS', 'Identifiants incorrects.');
        }
        if ($this->etat['utilisateurs'][$id]['revoque']) {
            return $this->erreur(403, 'ACCESS_REVOKED', 'Accès suspendu.');
        }

        $session = $this->jeton();
        $this->etat['sessions'][$session] = [
            'user' => $id,
            'appareil' => $requete->getHeaderLine('User-Agent'),
            'cree' => $this->maintenant(),
            'utilisee' => $this->maintenant(),
            'revoquee' => false,
        ];

        return $this->json(201, $this->paire($id, $session));
    }

    /** @param array<mixed> $corps */
    private function rafraichir(array $corps): ResponseInterface
    {
        $this->etat['rotations']++;
        if (($this->config['delai_rotation_ms'] ?? 0) > 0) {
            usleep($this->config['delai_rotation_ms'] * 1000);
        }

        $jeton = is_string($corps['refresh_token'] ?? null) ? $corps['refresh_token'] : '';
        $rafraichissement = $this->etat['rafraichissements'][$jeton] ?? null;
        $session = $rafraichissement === null ? null : $this->etat['sessions'][$rafraichissement['session']];
        if (
            $rafraichissement === null || $session === null || $session['revoquee']
            || $rafraichissement['expire'] <= $this->maintenant()
        ) {
            return $this->erreur(401, 'REFRESH_TOKEN_INVALID', 'Jeton de rafraîchissement invalide.');
        }
        if ($rafraichissement['utilise']) {
            // Rejeu : vol probable, toutes les sessions de l'utilisateur tombent (§2.4).
            $this->revoquerToutesLesSessions($session['user']);

            return $this->erreur(401, 'REFRESH_TOKEN_INVALID', 'Jeton de rafraîchissement invalide.');
        }
        if ($this->etat['utilisateurs'][$session['user']]['revoque']) {
            return $this->erreur(403, 'ACCESS_REVOKED', 'Accès suspendu.');
        }

        $this->etat['rafraichissements'][$jeton]['utilise'] = true;
        $this->etat['sessions'][$rafraichissement['session']]['utilisee'] = $this->maintenant();

        return $this->json(200, $this->paire($session['user'], $rafraichissement['session']));
    }

    /** @param array<mixed> $corps */
    private function oublier(array $corps): ResponseInterface
    {
        $email = $corps['email'] ?? null;
        $id = is_string($email) ? $this->utilisateurParEmail($email) : null;
        // Anti-énumération : même réponse dans tous les cas, plafond compris (§4).
        if ($id !== null && !$this->etat['utilisateurs'][$id]['revoque']) {
            $this->envoyerLien($this->etat['utilisateurs'][$id]['email'], 'password_reset', [
                'email' => $this->etat['utilisateurs'][$id]['email'],
                'user' => $id,
            ]);
        }

        return $this->json(202, ['status' => 'reset_pending']);
    }

    /** @param array<mixed> $corps */
    private function reinitialiser(array $corps): ResponseInterface
    {
        $jeton = is_string($corps['reset_token'] ?? null) ? $corps['reset_token'] : '';
        $autorisation = $this->etat['reinitialisations'][$jeton] ?? null;
        if ($autorisation === null || $autorisation['utilisee'] || $autorisation['expire'] <= $this->maintenant()) {
            return $this->erreur(400, 'RESET_TOKEN_INVALID', 'Jeton de réinitialisation invalide.');
        }
        if (!$this->motDePasseValide($corps['password'] ?? null)) {
            return $this->erreur(400, 'VALIDATION_FAILED', 'Mot de passe invalide.');
        }

        $this->etat['reinitialisations'][$jeton]['utilisee'] = true;
        $this->etat['utilisateurs'][$autorisation['user']]['empreinte'] = $this->empreinte($corps['password']);
        $this->revoquerToutesLesSessions($autorisation['user']);

        return new Response(204);
    }

    private function profil(string $id): ResponseInterface
    {
        $utilisateur = $this->etat['utilisateurs'][$id];

        return $this->json(200, [
            'id' => $id,
            'email' => $utilisateur['email'],
            'created_at' => date(DATE_ATOM, $utilisateur['cree']),
        ]);
    }

    /** @param array<mixed> $corps */
    private function changerEmail(string $id, array $corps): ResponseInterface
    {
        $email = $corps['email'] ?? null;
        $actuelle = $this->etat['utilisateurs'][$id]['email'];
        if (!$this->emailValide($email) || $email === $actuelle) {
            return $this->erreur(400, 'VALIDATION_FAILED', 'Adresse invalide.');
        }
        if ($this->etat['utilisateurs'][$id]['revoque']) {
            return $this->erreur(403, 'ACCESS_REVOKED', 'Accès suspendu.');
        }
        if (!$this->motDePasseCorrect($id, $corps['password'] ?? null)) {
            return $this->erreur(401, 'INVALID_CREDENTIALS', 'Identifiants incorrects.');
        }
        if ($this->utilisateurParEmail($email) !== null) {
            return $this->erreur(409, 'EMAIL_ALREADY_USED', 'Adresse déjà utilisée.');
        }

        $refus = $this->envoyerLien($email, 'email_change', ['email' => $email, 'user' => $id]);
        if ($refus !== null) {
            return $refus;
        }
        $this->etat['emails'][] = [
            'a' => $actuelle,
            'type' => 'email_change_avis',
            'lien' => null,
            'quand' => $this->maintenant(),
        ];

        return $this->json(202, ['status' => 'confirmation_pending']);
    }

    private function sessions(string $id): ResponseInterface
    {
        $sessions = [];
        foreach ($this->etat['sessions'] as $cle => $session) {
            if ($session['user'] === $id && !$session['revoquee']) {
                $sessions[] = [
                    'id' => $cle,
                    'device' => $session['appareil'],
                    'created_at' => date(DATE_ATOM, $session['cree']),
                    'last_used_at' => date(DATE_ATOM, $session['utilisee']),
                ];
            }
        }

        return $this->json(200, ['sessions' => $sessions]);
    }

    private function revoquerSession(string $id, string $session): ResponseInterface
    {
        if (($this->etat['sessions'][$session]['user'] ?? null) !== $id) {
            return $this->erreur(404, 'SESSION_NOT_FOUND', 'Session introuvable.');
        }
        $this->etat['sessions'][$session]['revoquee'] = true;

        return new Response(204);
    }

    private function suivreLien(string $jeton, string $methode): ResponseInterface
    {
        $demande = $this->etat['demandes'][$jeton] ?? null;
        if ($demande === null) {
            return new Response(404, ['Content-Type' => 'text/html'], '<p>Lien inconnu.</p>');
        }

        $type = $demande['type'];
        $duree = $type === 'user_registration' ? self::DUREE_LIEN_INSCRIPTION : self::DUREE_LIEN;
        if ($demande['cree'] + $duree <= $this->maintenant()) {
            return $this->rediriger($type, 'expired');
        }

        // Réinitialisation : page intermédiaire à bouton, anti-scanner, sans écriture (§2.5).
        if ($type === 'password_reset' && $methode === 'GET') {
            $page = '<form method="post"><button>Choisir un nouveau mot de passe</button></form>';

            return new Response(200, ['Content-Type' => 'text/html; charset=utf-8'], $page);
        }

        return match ($type) {
            'user_registration' => $this->confirmerInscription($jeton, $demande),
            'password_reset' => $this->accorderReinitialisation($jeton, $demande),
            default => $this->confirmerChangementDEmail($jeton, $demande),
        };
    }

    /** @param array{email: string, empreinte?: string, cree: int, utilisee: bool} $demande */
    private function confirmerInscription(string $jeton, array $demande): ResponseInterface
    {
        if ($this->utilisateurParEmail($demande['email']) !== null) {
            return $this->rediriger('user_registration', 'already_confirmed');
        }
        $this->etat['demandes'][$jeton]['utilisee'] = true;
        $this->etat['utilisateurs'][$this->uuid()] = [
            'email' => $demande['email'],
            'empreinte' => $demande['empreinte'] ?? '',
            'cree' => $this->maintenant(),
            'revoque' => false,
        ];

        return $this->rediriger('user_registration', 'confirmed');
    }

    /** @param array{user?: string, utilisee: bool} $demande */
    private function accorderReinitialisation(string $jeton, array $demande): ResponseInterface
    {
        if ($demande['utilisee']) {
            return $this->rediriger('password_reset', 'already_confirmed');
        }
        $this->etat['demandes'][$jeton]['utilisee'] = true;
        $autorisation = $this->jeton();
        $this->etat['reinitialisations'][$autorisation] = [
            'user' => $demande['user'] ?? '',
            'expire' => $this->maintenant() + self::DUREE_REINITIALISATION,
            'utilisee' => false,
        ];

        return $this->rediriger('password_reset', 'confirmed', $autorisation);
    }

    /** @param array{email: string, user?: string, utilisee: bool} $demande */
    private function confirmerChangementDEmail(string $jeton, array $demande): ResponseInterface
    {
        $id = $demande['user'] ?? '';
        if ($demande['utilisee'] || $this->etat['utilisateurs'][$id]['email'] === $demande['email']) {
            return $this->rediriger('email_change', 'already_confirmed');
        }
        if ($this->utilisateurParEmail($demande['email']) !== null) {
            return $this->rediriger('email_change', 'email_taken');
        }
        $this->etat['demandes'][$jeton]['utilisee'] = true;
        $this->etat['utilisateurs'][$id]['email'] = $demande['email'];

        return $this->rediriger('email_change', 'confirmed');
    }

    /** @param Closure(string): ResponseInterface $suite */
    private function avecJeton(RequestInterface $requete, Closure $suite): ResponseInterface
    {
        $id = $this->verifierJeton(substr($requete->getHeaderLine('Authorization'), 7));
        if ($id === null) {
            return $this->erreur(401, 'INVALID_ACCESS_TOKEN', 'Jeton d’accès invalide.');
        }

        return $suite($id);
    }

    private function verifierJeton(string $jeton): ?string
    {
        $parties = explode('.', $jeton);
        if (count($parties) !== 3) {
            return null;
        }
        $signature = JWT::urlsafeB64Decode($parties[2]);
        $publique = openssl_pkey_get_details($this->clePrivee())['key'] ?? '';
        if (openssl_verify($parties[0] . '.' . $parties[1], $signature, $publique, OPENSSL_ALGO_SHA256) !== 1) {
            return null;
        }
        $claims = json_decode(JWT::urlsafeB64Decode($parties[1]), true);
        if (
            !is_array($claims) || ($claims['exp'] ?? 0) <= $this->maintenant()
            || ($claims['aud'] ?? null) !== $this->config['client_id']
        ) {
            return null;
        }
        $id = $claims['sub'] ?? null;

        return is_string($id) && isset($this->etat['utilisateurs'][$id]) ? $id : null;
    }

    /** @return array{access_token: string, refresh_token: string, expires_in: int} */
    private function paire(string $id, string $session): array
    {
        $maintenant = $this->maintenant();
        $rafraichissement = $this->jeton();
        $this->etat['rafraichissements'][$rafraichissement] = [
            'session' => $session,
            'expire' => $maintenant + self::DUREE_RAFRAICHISSEMENT,
            'utilise' => false,
        ];
        $acces = JWT::encode(
            [
                'iss' => $this->config['iss'],
                'sub' => $id,
                'aud' => $this->config['client_id'],
                'iat' => $maintenant,
                'exp' => $maintenant + self::DUREE_ACCES,
            ],
            $this->clePrivee(),
            'RS256',
            $this->etat['cle']['kid'],
        );

        return ['access_token' => $acces, 'refresh_token' => $rafraichissement, 'expires_in' => self::DUREE_ACCES];
    }

    /**
     * Enregistre une demande et « envoie » son lien. Renvoie la réponse 429 si le plafond
     * d'emails de l'adresse est atteint, null sinon.
     *
     * @param array{email: string, empreinte?: string, user?: string} $donnees
     */
    private function envoyerLien(string $email, string $type, array $donnees): ?ResponseInterface
    {
        $fenetre = $this->maintenant() - 900;
        $recents = array_filter(
            $this->etat['emails'],
            static fn (array $e): bool => $e['a'] === $email && $e['quand'] > $fenetre,
        );
        if (count($recents) >= self::EMAILS_PAR_QUART_D_HEURE) {
            // L'oubli de mot de passe ne répond jamais 429 : l'appelant ignore le refus (§4).
            return $this->erreur(429, 'RATE_LIMITED', 'Trop d’emails envoyés.', ['Retry-After' => '900']);
        }

        $jeton = $this->jeton();
        $this->etat['demandes'][$jeton] = ['type' => $type, 'cree' => $this->maintenant(), 'utilisee' => false]
            + $donnees;
        $this->etat['emails'][] = [
            'a' => $email,
            'type' => $type,
            'lien' => rtrim($this->config['url_publique'], '/') . '/users/confirm/' . $jeton,
            'quand' => $this->maintenant(),
        ];

        return null;
    }

    private function rediriger(string $type, string $statut, ?string $reinitialisation = null): ResponseInterface
    {
        $parametres = ['type' => $type, 'status' => $statut];
        if ($reinitialisation !== null) {
            $parametres['reset_token'] = $reinitialisation;
        }
        $separateur = str_contains($this->config['redirect_uri'], '?') ? '&' : '?';

        $adresse = $this->config['redirect_uri'] . $separateur . http_build_query($parametres);

        return new Response(302, ['Location' => $adresse]);
    }

    private function revoquerToutesLesSessions(string $id): void
    {
        foreach ($this->etat['sessions'] as $cle => $session) {
            if ($session['user'] === $id) {
                $this->etat['sessions'][$cle]['revoquee'] = true;
            }
        }
    }

    private function jwks(): ResponseInterface
    {
        $cle = $this->etat['cle'];

        return $this->json(200, ['keys' => [[
            'kty' => 'RSA',
            'use' => 'sig',
            'alg' => 'RS256',
            'kid' => $cle['kid'],
            'n' => $cle['n'],
            'e' => $cle['e'],
        ]]], ['Cache-Control' => 'public, max-age=3600']);
    }

    private function utilisateurParEmail(string $email): ?string
    {
        foreach ($this->etat['utilisateurs'] as $id => $utilisateur) {
            if ($utilisateur['email'] === $email) {
                return $id;
            }
        }

        return null;
    }

    /** @phpstan-assert-if-true string $email */
    private function emailValide(mixed $email): bool
    {
        return is_string($email) && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    }

    /** @phpstan-assert-if-true string $motDePasse */
    private function motDePasseValide(mixed $motDePasse): bool
    {
        return is_string($motDePasse) && strlen($motDePasse) >= 8 && strlen($motDePasse) <= 72;
    }

    private function motDePasseCorrect(string $id, mixed $motDePasse): bool
    {
        return hash_equals($this->etat['utilisateurs'][$id]['empreinte'], $this->empreinte($motDePasse));
    }

    private function empreinte(mixed $motDePasse): string
    {
        // Doublure : un hachage rapide suffit, les tests créent beaucoup de comptes.
        return hash('sha256', 'doublure:' . (is_string($motDePasse) ? $motDePasse : ''));
    }

    private function jeton(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');
    }

    private function uuid(): string
    {
        $octets = random_bytes(16);
        $octets[6] = chr(ord($octets[6]) & 0x0f | 0x40);
        $octets[8] = chr(ord($octets[8]) & 0x3f | 0x80);

        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($octets), 4));
    }

    private function maintenant(): int
    {
        return ($this->horloge)();
    }

    /**
     * @param array<string, mixed> $donnees
     * @param array<string, string> $entetes
     */
    private function json(int $statut, array $donnees, array $entetes = []): ResponseInterface
    {
        $corps = json_encode($donnees, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);

        return new Response($statut, ['Content-Type' => 'application/json'] + $entetes, $corps);
    }

    /** @param array<string, string> $entetes */
    private function erreur(int $statut, string $code, string $message, array $entetes = []): ResponseInterface
    {
        return $this->json($statut, ['error' => ['code' => $code, 'message' => $message]], $entetes);
    }

    private function clePrivee(): \OpenSSLAsymmetricKey
    {
        return openssl_pkey_get_private($this->etat['cle']['privee'])
            ?: throw new RuntimeException('Clé privée de la doublure illisible.');
    }

    /**
     * Exécute $action sous verrou exclusif, l'état chargé puis réécrit.
     *
     * @template T
     * @param Closure(): T $action
     * @return T
     */
    private function avecEtat(Closure $action): mixed
    {
        if (!is_dir($this->dossier) && !@mkdir($this->dossier, 0700, true) && !is_dir($this->dossier)) {
            throw new RuntimeException('Dossier d’état impossible à créer : ' . $this->dossier);
        }
        $verrou = fopen($this->dossier . '/etat.lock', 'c') ?: throw new RuntimeException('Verrou impossible.');
        flock($verrou, LOCK_EX);
        try {
            $fichier = $this->dossier . '/etat.json';
            $lu = is_file($fichier) ? json_decode((string) file_get_contents($fichier), true) : null;
            /** @var Etat $etat */
            $etat = is_array($lu) ? $lu : $this->etatInitial();
            $this->etat = $etat;
            $resultat = $action();
            file_put_contents($fichier, json_encode($this->etat, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));

            return $resultat;
        } finally {
            flock($verrou, LOCK_UN);
            fclose($verrou);
        }
    }

    /** @return Etat */
    private function etatInitial(): array
    {
        return [
            'cle' => self::nouvelleCle(),
            'utilisateurs' => [],
            'demandes' => [],
            'reinitialisations' => [],
            'sessions' => [],
            'rafraichissements' => [],
            'emails' => [],
            'rotations' => 0,
        ];
    }

    /** @return array{kid: string, privee: string, n: string, e: string} */
    private static function nouvelleCle(): array
    {
        $options = ['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA];
        // PHP pour Windows ne trouve pas toujours son openssl.cnf : celui qu'il livre suffit.
        $cnf = dirname(PHP_BINARY) . '/extras/ssl/openssl.cnf';
        $config = is_file($cnf) ? ['config' => $cnf] : [];
        $cle = @openssl_pkey_new($options) ?: openssl_pkey_new($options + $config);
        if ($cle === false || !openssl_pkey_export($cle, $privee, null, $config)) {
            $cause = openssl_error_string() ?: 'inconnue';

            throw new RuntimeException('Génération de la clé RSA impossible : ' . $cause);
        }
        $rsa = openssl_pkey_get_details($cle)['rsa'] ?? [];
        $b64 = static fn (string $octets): string => rtrim(strtr(base64_encode($octets), '+/', '-_'), '=');

        return [
            'kid' => 'doublure-' . bin2hex(random_bytes(4)),
            'privee' => $privee,
            'n' => $b64($rsa['n']),
            'e' => $b64($rsa['e']),
        ];
    }

    /** Réponse d'erreur si une exception s'échappe (dysfonctionnement de la doublure elle-même). */
    public static function erreurInterne(Throwable $exception): ResponseInterface
    {
        return new Response(500, ['Content-Type' => 'application/json'], json_encode(
            ['error' => ['code' => 'INTERNAL_ERROR', 'message' => $exception->getMessage()]],
            JSON_THROW_ON_ERROR,
        ));
    }
}
