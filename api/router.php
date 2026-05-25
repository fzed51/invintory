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
};