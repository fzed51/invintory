<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

use RuntimeException;

/** Access token refusé : signature, expiration, audience, émetteur ou format. */
final class JetonInvalide extends RuntimeException
{
}
