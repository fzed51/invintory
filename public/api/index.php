<?php

declare(strict_types=1);

// Derrière une réécriture (.htaccess), Apache expose l'en-tête sous REDIRECT_HTTP_AUTHORIZATION.
if (!isset($_SERVER['HTTP_AUTHORIZATION']) && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
}

require __DIR__ . '/../../api/bootstrap.php';
