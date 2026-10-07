<?php

declare(strict_types=1);

use CaveAVin\Auth\AuthController;
use CaveAVin\Auth\CallbackController;
use CaveAVin\Auth\CompteController;
use CaveAVin\Migration\JetonDeDeploiement;
use CaveAVin\Migration\MigrationController;
use CaveAVin\Sante\SanteController;
use Slim\App;

// Toute route exige un Bearer valide (middleware Authentification), sauf celles nommées
// « public.* » : la liste ci-dessous est l'inventaire complet des exceptions.
// Chemins en anglais (P29), contrat complet : docs/contrat-api.md.
return function (App $app): void {
    // HEAD est servi par la route GET (repli de FastRoute, corps vidé par Slim).
    $app->get('/health', [SanteController::class, 'verifier'])->setName('public.sante');

    // Protégée par X-Deploy-Token (et non par JWT) : seule la CI l'appelle.
    $app->post('/internal/migrate', [MigrationController::class, 'migrer'])
        ->add(new JetonDeDeploiement($app->getResponseFactory()))
        ->setName('public.migration');

    // Session : le ticket voyage en cookie HttpOnly (Path=/api/auth).
    $app->post('/auth/login', [AuthController::class, 'connexion'])->setName('public.connexion');
    $app->post('/auth/refresh', [AuthController::class, 'rafraichir'])->setName('public.rafraichir');
    $app->post('/auth/logout', [AuthController::class, 'deconnexion'])->setName('public.deconnexion');

    // Parcours de compte sans session.
    $app->post('/auth/register', [AuthController::class, 'inscription'])->setName('public.inscription');
    $app->post('/auth/register/resend', [AuthController::class, 'renvoi'])->setName('public.renvoi');
    $app->post('/auth/password/forgot', [AuthController::class, 'oubli'])->setName('public.oubli');
    $app->post('/auth/password/reset', [AuthController::class, 'nouveauMotDePasse'])
        ->setName('public.nouveau-mot-de-passe');
    // redirect_uri déclaré à auth-service.
    $app->get('/auth/callback', [CallbackController::class, 'retour'])->setName('public.callback');

    // Authentifiées.
    $app->get('/auth/devices', [AuthController::class, 'listerAppareils']);
    $app->delete('/auth/devices/{id}', [AuthController::class, 'revoquerAppareil']);
    $app->get('/account', [CompteController::class, 'profil']);
    $app->post('/account/email', [CompteController::class, 'changerEmail']);
};
