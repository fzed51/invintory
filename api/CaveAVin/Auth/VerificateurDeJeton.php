<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Psr\SimpleCache\CacheInterface;
use Throwable;

/**
 * Vérifie l'access token localement, avec la clé publique du JWKS (intégration §3.3) :
 * signature et expiration (tolérance 60 s), puis aud ET iss — php-jwt ne contrôle ni l'un
 * ni l'autre, et le service est multi-tenant (Arch §2.3).
 */
final class VerificateurDeJeton
{
    private const CLE_DE_CACHE = 'auth-service.jwks';

    /** Le service publie Cache-Control: max-age=3600 sur le JWKS. */
    private const DUREE_DU_CACHE = 3600;

    private const TOLERANCE_D_HORLOGE = 60;

    public function __construct(
        private readonly ClientAuthService $client,
        private readonly CacheInterface $cache,
        private readonly string $emetteur,
        private readonly string $audience,
    ) {
    }

    /** @return string le sub (identifiant auth-service de l'utilisateur) */
    public function verifier(string $jeton): string
    {
        $jwks = $this->jwks();
        // Un kid inconnu signale le plus souvent une rotation de clé pendant que le cache
        // était chaud : un seul nouveau téléchargement (§3.3, point 2).
        if (!in_array($this->kid($jeton), array_column($jwks['keys'], 'kid'), true)) {
            $jwks = $this->jwks(true);
        }

        JWT::$leeway = self::TOLERANCE_D_HORLOGE;
        try {
            $claims = JWT::decode($jeton, JWK::parseKeySet($jwks, 'RS256'));
        } catch (Throwable $exception) {
            throw new JetonInvalide($exception->getMessage(), 0, $exception);
        }

        if (($claims->aud ?? null) !== $this->audience) {
            throw new JetonInvalide('Jeton émis pour une autre application.');
        }
        if (($claims->iss ?? null) !== $this->emetteur) {
            throw new JetonInvalide('Émetteur inattendu.');
        }
        $sujet = $claims->sub ?? null;
        if (!is_string($sujet) || $sujet === '') {
            throw new JetonInvalide('Jeton sans sujet.');
        }

        return $sujet;
    }

    private function kid(string $jeton): ?string
    {
        $entete = json_decode(JWT::urlsafeB64Decode(explode('.', $jeton)[0]), true);

        return is_array($entete) && is_string($entete['kid'] ?? null) ? $entete['kid'] : null;
    }

    /** @return array{keys: list<array<string, mixed>>} */
    private function jwks(bool $actualiser = false): array
    {
        if (!$actualiser) {
            $enCache = $this->cache->get(self::CLE_DE_CACHE);
            if ($this->valide($enCache)) {
                return $enCache;
            }
        }

        try {
            $jwks = $this->client->jwks();
        } catch (ErreurAuthService $erreur) {
            throw new JetonInvalide('JWKS injoignable : ' . $erreur->getMessage(), 0, $erreur);
        }
        if (!$this->valide($jwks)) {
            throw new JetonInvalide('JWKS malformé.');
        }
        $this->cache->set(self::CLE_DE_CACHE, $jwks, self::DUREE_DU_CACHE);

        return $jwks;
    }

    /** @phpstan-assert-if-true array{keys: list<array<string, mixed>>} $jwks */
    private function valide(mixed $jwks): bool
    {
        return is_array($jwks) && isset($jwks['keys']) && is_array($jwks['keys']) && array_is_list($jwks['keys']);
    }
}
