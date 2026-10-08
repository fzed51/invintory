<?php

declare(strict_types=1);

namespace CaveAVin\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

abstract class BaseController
{
    /** @param array<string, mixed> $donnees */
    protected function json(ResponseInterface $reponse, array $donnees, int $statut = 200): ResponseInterface
    {
        $reponse->getBody()->write(json_encode($donnees, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));

        return $reponse
            ->withStatus($statut)
            ->withHeader('Content-Type', 'application/json');
    }

    /**
     * Réponse de lecture : jamais mise en cache, le cache hors ligne est celui de la PWA (contrat §1.1).
     *
     * @param array<string, mixed> $donnees
     */
    protected function lecture(ResponseInterface $reponse, array $donnees): ResponseInterface
    {
        return $this->json($reponse, $donnees)->withHeader('Cache-Control', 'no-store');
    }

    /** Texte de 1 à $max caractères, sinon 400 VALIDATION_FAILED. */
    protected function libelle(mixed $valeur, string $champ, int $max = 100): string
    {
        if (!is_string($valeur) || $valeur === '' || mb_strlen($valeur) > $max) {
            throw ErreurApi::donneesInvalides(
                sprintf('Champ « %s » : texte de 1 à %d caractères attendu.', $champ, $max),
            );
        }

        return $valeur;
    }

    /** Entier JSON compris entre $min et $max, sinon 400 VALIDATION_FAILED. */
    protected function entier(mixed $valeur, string $champ, int $min, int $max): int
    {
        if (!is_int($valeur) || $valeur < $min || $valeur > $max) {
            throw ErreurApi::donneesInvalides(sprintf('Champ « %s » : entier de %d à %d attendu.', $champ, $min, $max));
        }

        return $valeur;
    }

    /** Paramètre d'URL entier compris entre $min et $max, $defaut s'il est absent. */
    protected function parametreEntier(
        ServerRequestInterface $requete,
        string $nom,
        int $defaut,
        int $min,
        int $max,
    ): int {
        $valeur = $requete->getQueryParams()[$nom] ?? null;
        if ($valeur === null) {
            return $defaut;
        }
        if (!is_string($valeur) || preg_match('/^[0-9]{1,9}$/', $valeur) !== 1) {
            throw ErreurApi::donneesInvalides(
                sprintf('Paramètre « %s » : entier de %d à %d attendu.', $nom, $min, $max),
            );
        }

        return $this->entier((int) $valeur, $nom, $min, $max);
    }

    /** Identifiant client : UUID v4 en minuscules (contrat §1.1). */
    protected static function estUuid(mixed $valeur): bool
    {
        return is_string($valeur)
            && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $valeur) === 1;
    }

    /** DATETIME ou DATETIME(3) UTC de MySQL → ISO 8601 à la milliseconde (contrat §1.2). */
    protected static function dateHeure(string $valeur): string
    {
        return str_replace(' ', 'T', $valeur) . (str_contains($valeur, '.') ? '' : '.000') . 'Z';
    }

    /** @return array<mixed> */
    protected function corps(ServerRequestInterface $requete): array
    {
        $corps = $requete->getParsedBody();

        return is_array($corps) ? $corps : [];
    }

    /** Champ texte obligatoire et non vide du corps JSON, sinon 400 VALIDATION_FAILED. */
    protected function texte(ServerRequestInterface $requete, string $champ): string
    {
        $valeur = $this->corps($requete)[$champ] ?? null;
        if (!is_string($valeur) || $valeur === '') {
            throw ErreurApi::donneesInvalides(sprintf('Champ « %s » requis.', $champ));
        }

        return $valeur;
    }

    /** Champ texte facultatif ; null s'il est absent. */
    protected function texteFacultatif(ServerRequestInterface $requete, string $champ): ?string
    {
        $valeur = $this->corps($requete)[$champ] ?? null;
        if ($valeur !== null && !is_string($valeur)) {
            throw ErreurApi::donneesInvalides(sprintf('Champ « %s » invalide.', $champ));
        }

        return $valeur;
    }
}
