<?php

declare(strict_types=1);

namespace CaveAVin\Mouvements;

use RuntimeException;

/**
 * Mutation refusée (contrat §10.3) : rien n'est enregistré, le code dit à la PWA si elle
 * garde la mutation ou la retire de sa file.
 */
final class MutationRejetee extends RuntimeException
{
    public function __construct(public readonly string $codeRejet, string $message)
    {
        parent::__construct($message);
    }

    public static function bouteilleInconnue(): self
    {
        return new self('BOTTLE_NOT_FOUND', 'Bouteille inconnue.');
    }

    public static function bouteilleSortie(): self
    {
        return new self('BOTTLE_EXITED', 'Bouteille déjà sortie.');
    }

    public static function referenceNonReservee(string $reference): self
    {
        return new self(
            'REFERENCE_NOT_RESERVED',
            sprintf('Référence « %s » non réservée pour ce compte.', $reference),
        );
    }

    public static function referencePrise(string $reference): self
    {
        return new self(
            'REFERENCE_TAKEN',
            sprintf('Référence « %s » déjà portée par une autre bouteille.', $reference),
        );
    }
}
