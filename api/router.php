<?php

return function ($app) {
    // Middleware d'erreur : traduit toute exception non rattrapée en réponse
    // JSON {"error": ...}, au lieu de laisser PHP renvoyer sa page HTML avec
    // la trace complète.
    //
    // ORDRE IMPORTANT : Slim exécute les middlewares dans l'ordre inverse de
    // leur ajout, donc celui-ci doit être ajouté AVANT le CORS pour rester à
    // l'intérieur. Si le CORS était le plus interne, une exception le
    // traverserait sans exécuter son code post-handle() et les réponses
    // d'erreur perdraient leurs en-têtes CORS.
    $displayErrorDetails = filter_var(
        (string) getenv('APP_DEBUG'),
        FILTER_VALIDATE_BOOLEAN
    );
    $app->addErrorMiddleware($displayErrorDetails, true, true)
        ->setDefaultErrorHandler(\Invintory\Error\JsonErrorHandler::class);

    // CORS. Le préflight est traité ici plutôt que par une route fourre-tout
    // $app->options('/{routes:.+}') : une telle route fait correspondre
    // n'importe quel chemin, si bien que Slim répondait 405 « méthode non
    // autorisée » au lieu de 404 sur une URL inconnue.
    $app->add(function ($request, $handler) {
        $response = strtoupper($request->getMethod()) === 'OPTIONS'
            ? new \Slim\Psr7\Response(204)
            : $handler->handle($request);

        return $response
            ->withHeader('Access-Control-Allow-Origin', '*')
            ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    });

    // Auth routes
    $app->post('/auth/register', [\Invintory\User\AuthController::class, 'register']);
    $app->post('/auth/login', [\Invintory\User\AuthController::class, 'login']);
    $app->get('/auth/me', [\Invintory\User\AuthController::class, 'me'])
        ->add(\Invintory\User\JwtAuthMiddleware::class);

    // Image routes (secured, no direct static access)
    $app->post('/images/temp', [\Invintory\Image\ImageController::class, 'uploadTemporary'])
        ->add(\Invintory\User\JwtAuthMiddleware::class);
    $app->get('/images/{imageId}', [\Invintory\Image\ImageController::class, 'streamImage'])
        ->add(\Invintory\User\JwtAuthMiddleware::class);

    // Cellar routes (secured)
    $app->get('/cellar', [\Invintory\Cellar\CellarController::class, 'getCellar'])
        ->add(\Invintory\User\JwtAuthMiddleware::class);
    $app->put('/cellar', [\Invintory\Cellar\CellarController::class, 'saveCellar'])
        ->add(\Invintory\User\JwtAuthMiddleware::class);
};