<?php

declare(strict_types=1);

use CaveAVin\Application;
use Dotenv\Dotenv;

require __DIR__ . '/vendor/autoload.php';

// Le .env vit à la racine du projet, hors du webroot (dist/).
Dotenv::createImmutable(dirname(__DIR__))->safeLoad();

Application::creer()->run();
