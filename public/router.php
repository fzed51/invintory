<?php

/**
 * PHP built-in server router script.
 * Run with: php -S localhost:8080 -t public public/router.php
 *
 * Routes /api/* requests to the Slim application and serves
 * all other requests as static files.
 */
if (preg_match('/^\/api(\/|$)/', $_SERVER['REQUEST_URI'])) {
    require __DIR__ . '/api/index.php';

    return;
}

return false;
