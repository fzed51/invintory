<?php
require __DIR__ . '/../../vendor/autoload.php';

$containerFactory = require __DIR__ . '/container.php';

$app = \DI\Bridge\Slim\Bridge::create($containerFactory());

$routerFactory = require __DIR__ . '/router.php';
$routerFactory($app);

$app->run();