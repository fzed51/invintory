<?php

declare(strict_types=1);

namespace CaveAVin\Bouteilles;

use InvalidArgumentException;

/**
 * Référence courte d'une bouteille (CdC §2.3, schéma §7) : 1er caractère parmi 24 lettres
 * (a-z sans o ni i), suivants parmi 34 symboles (0-9 puis a-z sans o ni i). Une longueur L
 * offre 24 × 34^(L-1) codes, numérotés dans l'ordre de génération à partir de 0.
 */
final class CodeReference
{
    private const PREMIERS = 'abcdefghjklmnpqrstuvwxyz';
    private const SUIVANTS = '0123456789abcdefghjklmnpqrstuvwxyz';

    /** Taille de la colonne bouteilles.reference. */
    private const LONGUEUR_MAX = 10;

    public static function capacite(int $longueur): int
    {
        return strlen(self::PREMIERS) * strlen(self::SUIVANTS) ** ($longueur - 1);
    }

    /** Code de rang $index parmi ceux de longueur $longueur. */
    public static function code(int $longueur, int $index): string
    {
        if ($longueur < 1 || $index < 0 || $index >= self::capacite($longueur)) {
            throw new InvalidArgumentException(sprintf('Pas de code de rang %d en longueur %d.', $index, $longueur));
        }
        $base = strlen(self::SUIVANTS);
        $code = '';
        for ($i = 1; $i < $longueur; $i++) {
            $code = self::SUIVANTS[$index % $base] . $code;
            $index = intdiv($index, $base);
        }

        return self::PREMIERS[$index] . $code;
    }

    /**
     * Longueur et rang d'un code ; null s'il n'est pas un code valide (contrat §4 : sert à
     * vérifier qu'une référence fournie a bien été distribuée).
     *
     * @return array{longueur: int, index: int}|null
     */
    public static function position(string $code): ?array
    {
        $longueur = strlen($code);
        if ($longueur < 2 || $longueur > self::LONGUEUR_MAX || !str_contains(self::PREMIERS, $code[0])) {
            return null;
        }
        $index = (int) strpos(self::PREMIERS, $code[0]);
        for ($i = 1; $i < $longueur; $i++) {
            $rang = strpos(self::SUIVANTS, $code[$i]);
            if ($rang === false) {
                return null;
            }
            $index = $index * strlen(self::SUIVANTS) + $rang;
        }

        return ['longueur' => $longueur, 'index' => $index];
    }

    /** Saisie de recherche ramenée à la forme stockée : minuscules, sans espaces (contrat §7.2). */
    public static function normaliser(string $saisie): string
    {
        return strtolower((string) preg_replace('/\s+/', '', $saisie));
    }
}
