<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

use RuntimeException;

/**
 * Ticket précédent représenté juste après une rotation : requête concurrente du même
 * appareil, pas un vol. Le client réessaie avec le nouveau cookie.
 */
final class SessionDejaRenouvelee extends RuntimeException
{
}
