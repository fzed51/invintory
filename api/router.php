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
    $app->post('/auth/register', [\TemplatePhpReact\User\AuthController::class, 'register']);
    $app->post('/auth/login', [\TemplatePhpReact\User\AuthController::class, 'login']);
    $app->get('/auth/me', [\TemplatePhpReact\User\AuthController::class, 'me'])
        ->add(\TemplatePhpReact\User\JwtAuthMiddleware::class);

    // Image routes (secured, no direct static access)
    $app->post('/images/temp', [\TemplatePhpReact\Image\ImageController::class, 'uploadTemporary'])
        ->add(\TemplatePhpReact\User\JwtAuthMiddleware::class);
    $app->get('/images/{imageId}', [\TemplatePhpReact\Image\ImageController::class, 'streamImage'])
        ->add(\TemplatePhpReact\User\JwtAuthMiddleware::class);

    // Cellar routes (secured)
    $app->get('/cellar', [\TemplatePhpReact\Cellar\CellarController::class, 'getCellar'])
        ->add(\TemplatePhpReact\User\JwtAuthMiddleware::class);
    $app->put('/cellar', [\TemplatePhpReact\Cellar\CellarController::class, 'saveCellar'])
        ->add(\TemplatePhpReact\User\JwtAuthMiddleware::class);
};