<?php

declare(strict_types=1);

namespace CaveAVin\Bouteilles;

use DateTimeImmutable;

/**
 * Date limite de consommation (P17, contrat §7.1) : avec millésime, 31 décembre de
 * (millésime + garde) ; sans, date d'entrée (1er du mois) + garde. La garde vient de la
 * catégorie (résolue par le repository), sinon de la valeur par défaut du type.
 */
final class DateLimite
{
    public const GARDE_PAR_DEFAUT = [
        'rouge' => 8,
        'blanc' => 4,
        'rose' => 2,
        'effervescent' => 3,
        'doux' => 10,
        'autre' => 5,
    ];

    /** @param string $dateEntree format Y-m-d */
    public static function calculer(string $type, ?int $millesime, string $dateEntree, ?int $garde): string
    {
        $garde ??= self::GARDE_PAR_DEFAUT[$type] ?? 0;
        if ($millesime !== null) {
            return sprintf('%04d-12-31', $millesime + $garde);
        }

        return (new DateTimeImmutable($dateEntree))->modify(sprintf('+%d years', $garde))->format('Y-m-d');
    }
}
