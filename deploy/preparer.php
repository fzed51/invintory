<?php

declare(strict_types=1);

use Deploiement\Preparation;

require __DIR__ . '/Preparation.php';

// Usage : php deploy/preparer.php <racine du dépôt> <dossier d'envoi>
// Les valeurs du .env viennent de l'environnement du processus (secrets GitHub), jamais des arguments.
$arguments = $_SERVER['argv'] ?? [];
if (count($arguments) !== 3) {
    fwrite(STDERR, "Usage : php deploy/preparer.php <racine du dépôt> <dossier d'envoi>\n");
    exit(2);
}

$variables = [];
foreach (Preparation::VARIABLES as $nom) {
    $valeur = getenv($nom);
    if (is_string($valeur)) {
        $variables[$nom] = $valeur;
    }
}

try {
    $preparation = new Preparation($arguments[1], $arguments[2]);
    $preparation->preparer();
    $preparation->ecrireEnv($variables);
} catch (Throwable $e) {
    fwrite(STDERR, 'Préparation impossible : ' . $e->getMessage() . "\n");
    exit(1);
}

echo "Dossier d'envoi prêt : " . $arguments[2] . "\n";
