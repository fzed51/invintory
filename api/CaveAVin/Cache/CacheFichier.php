<?php

declare(strict_types=1);

namespace CaveAVin\Cache;

use Closure;
use DateInterval;
use DateTimeImmutable;
use Psr\SimpleCache\CacheInterface;

/**
 * Cache PSR-16 sur fichiers, hors docroot (pas d'APCu sur le mutualisé OVH). Sert au JWKS
 * d'auth-service ; un fichier illisible ou corrompu vaut une absence.
 */
final class CacheFichier implements CacheInterface
{
    private readonly Closure $horloge;

    /** @param (Closure(): int)|null $horloge */
    public function __construct(private readonly string $dossier, ?Closure $horloge = null)
    {
        $this->horloge = $horloge ?? time(...);
    }

    public function get(string $key, mixed $default = null): mixed
    {
        $contenu = @file_get_contents($this->fichier($key));
        $entree = $contenu === false ? false : @unserialize($contenu, ['allowed_classes' => false]);
        if (!is_array($entree) || !array_key_exists('valeur', $entree)) {
            return $default;
        }
        if ($entree['expire'] !== null && $entree['expire'] <= ($this->horloge)()) {
            $this->delete($key);

            return $default;
        }

        return $entree['valeur'];
    }

    public function set(string $key, mixed $value, null|int|DateInterval $ttl = null): bool
    {
        $fichier = $this->fichier($key);
        $duree = $ttl instanceof DateInterval
            ? (new DateTimeImmutable('@0'))->add($ttl)->getTimestamp()
            : $ttl;
        if ($duree !== null && $duree <= 0) {
            return $this->delete($key);
        }
        if (!is_dir($this->dossier) && !@mkdir($this->dossier, 0700, true) && !is_dir($this->dossier)) {
            return false;
        }

        $entree = serialize(['valeur' => $value, 'expire' => $duree === null ? null : ($this->horloge)() + $duree]);
        // Écriture atomique : un lecteur concurrent voit l'ancienne valeur ou la nouvelle.
        $temporaire = $fichier . '.' . bin2hex(random_bytes(4));

        return @file_put_contents($temporaire, $entree) !== false && @rename($temporaire, $fichier);
    }

    public function delete(string $key): bool
    {
        $fichier = $this->fichier($key);

        return !is_file($fichier) || @unlink($fichier);
    }

    public function clear(): bool
    {
        $ok = true;
        foreach (glob($this->dossier . '/*.cache') ?: [] as $fichier) {
            $ok = @unlink($fichier) && $ok;
        }

        return $ok;
    }

    /**
     * @param iterable<string> $keys
     * @return array<string, mixed>
     */
    public function getMultiple(iterable $keys, mixed $default = null): iterable
    {
        $valeurs = [];
        foreach ($keys as $cle) {
            $valeurs[$cle] = $this->get($cle, $default);
        }

        return $valeurs;
    }

    /** @param iterable<string, mixed> $values */
    public function setMultiple(iterable $values, null|int|DateInterval $ttl = null): bool
    {
        $ok = true;
        foreach ($values as $cle => $valeur) {
            $ok = $this->set($cle, $valeur, $ttl) && $ok;
        }

        return $ok;
    }

    /** @param iterable<string> $keys */
    public function deleteMultiple(iterable $keys): bool
    {
        $ok = true;
        foreach ($keys as $cle) {
            $ok = $this->delete($cle) && $ok;
        }

        return $ok;
    }

    public function has(string $key): bool
    {
        return $this->get($key, $this) !== $this;
    }

    private function fichier(string $cle): string
    {
        if ($cle === '' || preg_match('#[{}()/\\@:]#', $cle) === 1) {
            throw new CleInvalide(sprintf('Clé de cache invalide : « %s ».', $cle));
        }

        return $this->dossier . '/' . sha1($cle) . '.cache';
    }
}
