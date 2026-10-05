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
return function (App $app): void {
    // HEAD est servi par la route GET (repli de FastRoute, corps vidé par Slim).
    $app->get('/health', [SanteController::class, 'verifier'])->setName('public.sante');

    // Protégée par X-Deploy-Token (et non par JWT) : seule la CI l'appelle.
    $app->post('/internal/migrate', [MigrationController::class, 'migrer'])
        ->add(new JetonDeDeploiement($app->getResponseFactory()))
        ->setName('public.migration');

    // Session : le ticket voyage en cookie HttpOnly (Path=/api/auth).
    $app->post('/auth/connexion', [AuthController::class, 'connexion'])->setName('public.connexion');
    $app->post('/auth/rafraichir', [AuthController::class, 'rafraichir'])->setName('public.rafraichir');
    $app->post('/auth/deconnexion', [AuthController::class, 'deconnexion'])->setName('public.deconnexion');

    // Parcours de compte sans session.
    $app->post('/auth/inscription', [AuthController::class, 'inscription'])->setName('public.inscription');
    $app->post('/auth/inscription/renvoi', [AuthController::class, 'renvoi'])->setName('public.renvoi');
    $app->post('/auth/mot-de-passe/oubli', [AuthController::class, 'oubli'])->setName('public.oubli');
    $app->post('/auth/mot-de-passe/nouveau', [AuthController::class, 'nouveauMotDePasse'])
        ->setName('public.nouveau-mot-de-passe');
    // redirect_uri déclaré à auth-service.
    $app->get('/auth/callback', [CallbackController::class, 'retour'])->setName('public.callback');

    // Authentifiées.
    $app->get('/auth/appareils', [AuthController::class, 'listerAppareils']);
    $app->delete('/auth/appareils/{id}', [AuthController::class, 'revoquerAppareil']);
    $app->get('/compte', [CompteController::class, 'profil']);
    $app->post('/compte/email', [CompteController::class, 'changerEmail']);
};
