<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

use RuntimeException;

/** Ticket absent, inconnu, expiré, rejoué, ou refusé par auth-service : reconnexion requise. */
final class SessionInvalide extends RuntimeException
{
}
