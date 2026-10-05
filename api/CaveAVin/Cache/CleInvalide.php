<?php

declare(strict_types=1);

namespace CaveAVin\Cache;

use InvalidArgumentException;
use Psr\SimpleCache\InvalidArgumentException as InvalidArgumentExceptionPsr;

/** Clé interdite par PSR-16 (vide ou contenant {}()/\@:). */
final class CleInvalide extends InvalidArgumentException implements InvalidArgumentExceptionPsr
{
}
