<?php
require __DIR__ . '/../vendor/autoload.php';

// Le middleware d'erreur intercepte les Throwable, mais pas ce que PHP gère
// lui-même (erreurs fatales de démarrage, mémoire épuisée). Sans APP_DEBUG,
// on coupe donc l'affichage : ces cas seraient sinon renvoyés au client avec
// les chemins du serveur. Les erreurs restent journalisées.
$appDebug = filter_var((string) getenv('APP_DEBUG'), FILTER_VALIDATE_BOOLEAN);
ini_set('display_errors', $appDebug ? '1' : '0');
ini_set('log_errors', '1');

$containerFactory = require __DIR__ . '/container.php';

$app = \DI\Bridge\Slim\Bridge::create($containerFactory());
$app->setBasePath('/api');

$routerFactory = require __DIR__ . '/router.php';
$routerFactory($app);

$app->run();