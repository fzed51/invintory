<?php

return function ($app) {
    // Handle CORS preflight requests
    $app->options('/{routes:.+}', function ($request, $response) {
        return $response;
    });

    // Add CORS middleware
    $app->add(function ($request, $handler) {
        $response = $handler->handle($request);

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
};