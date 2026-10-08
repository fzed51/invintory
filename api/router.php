<?php

declare(strict_types=1);

use CaveAVin\Auth\AuthController;
use CaveAVin\Auth\CallbackController;
use CaveAVin\Auth\CompteController;
use CaveAVin\Bouteilles\BouteillesController;
use CaveAVin\Categories\CategoriesController;
use CaveAVin\Emplacements\EmplacementsController;
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

    // Emplacements (contrat §5).
    $app->get('/cellar', [EmplacementsController::class, 'cave']);
    $app->post('/cabinets', [EmplacementsController::class, 'creerArmoire']);
    $app->patch('/cabinets/{id:[0-9]+}', [EmplacementsController::class, 'renommerArmoire']);
    $app->delete('/cabinets/{id:[0-9]+}', [EmplacementsController::class, 'supprimerArmoire']);
    $app->post('/cabinets/{id:[0-9]+}/shelves', [EmplacementsController::class, 'ajouterEtagere']);
    $app->patch('/shelves/{id:[0-9]+}', [EmplacementsController::class, 'modifierEtagere']);
    $app->delete('/shelves/{id:[0-9]+}', [EmplacementsController::class, 'supprimerEtagere']);
    $app->post('/boxes', [EmplacementsController::class, 'creerCarton']);
    $app->patch('/boxes/{id:[0-9]+}', [EmplacementsController::class, 'modifierCarton']);
    $app->delete('/boxes/{id:[0-9]+}', [EmplacementsController::class, 'supprimerCarton']);
    $app->get('/locations/suggestion', [EmplacementsController::class, 'suggestion']);

    // Références, référentiels et bouteilles (contrat §4, §6, §7).
    $app->post('/references/reservations', [BouteillesController::class, 'reserverReferences']);
    $app->get('/regions', [BouteillesController::class, 'regions']);
    $app->get('/grapes', [BouteillesController::class, 'cepages']);
    $app->get('/bottles', [BouteillesController::class, 'lister']);
    $app->get('/bottles/by-reference/{reference}', [BouteillesController::class, 'ficheParReference']);
    $app->get('/bottles/{id:[0-9]+}', [BouteillesController::class, 'fiche']);
    $app->patch('/bottles/{id:[0-9]+}', [BouteillesController::class, 'modifier']);

    // Catégories et manques (contrat §9).
    $app->get('/categories', [CategoriesController::class, 'lister']);
    $app->post('/categories', [CategoriesController::class, 'creer']);
    $app->patch('/categories/{id:[0-9]+}', [CategoriesController::class, 'modifier']);
    $app->delete('/categories/{id:[0-9]+}', [CategoriesController::class, 'supprimer']);
    $app->get('/shortages', [CategoriesController::class, 'manques']);
};
