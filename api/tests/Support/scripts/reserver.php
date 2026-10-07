<?php

/**
 * Un processus = un appareil qui complète sa réserve de références, plusieurs fois de
 * suite, sur sa propre connexion à la base de test. Affiche les codes obtenus, un par
 * ligne. Lancé en parallèle par ReservationsConcurrentesTest.
 *
 * Usage : php reserver.php <users.id> <réservations> <codes par réservation>
 */

declare(strict_types=1);

use CaveAVin\Bouteilles\ReserverReferencesAction;
use CaveAVin\Bouteilles\SequenceRepository;
use CaveAVin\Tests\Support\BaseDeTest;

require __DIR__ . '/../../../vendor/autoload.php';

/** @var list<string> $arguments */
$arguments = $_SERVER['argv'];
[, $utilisateur, $reservations, $nombre] = $arguments;

$action = new ReserverReferencesAction(new SequenceRepository(BaseDeTest::connexion()));
for ($i = 0; $i < (int) $reservations; $i++) {
    echo implode("\n", $action->executer((int) $utilisateur, (int) $nombre)), "\n";
}
