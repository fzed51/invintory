<?php

declare(strict_types=1);

namespace CaveAVin;

use Closure;

/** Heure courante (horodatage Unix, UTC), pilotable en test. */
final class Horloge
{
    private readonly Closure $source;

    /** @param (Closure(): int)|null $source */
    public function __construct(?Closure $source = null)
    {
        $this->source = $source ?? time(...);
    }

    public function maintenant(): int
    {
        return ($this->source)();
    }
}
