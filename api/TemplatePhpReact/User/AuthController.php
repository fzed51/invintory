<?php

namespace TemplatePhpReact\User;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AuthController
{
    private RegisterAction $registerAction;
    private LoginAction $loginAction;

    public function __construct(RegisterAction $registerAction, LoginAction $loginAction)
    {
        $this->registerAction = $registerAction;
        $this->loginAction = $loginAction;
    }

    public function register(Request $request, Response $response): Response
    {
        $data = json_decode($request->getBody()->getContents(), true) ?? [];
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';

        try {
            $result = $this->registerAction->execute($email, $password);
            $response->getBody()->write(json_encode($result));

            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(201);
        } catch (\InvalidArgumentException $e) {
            $response->getBody()->write(json_encode(['error' => $e->getMessage()]));

            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(400);
        } catch (\RuntimeException $e) {
            $response->getBody()->write(json_encode(['error' => $e->getMessage()]));

            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(409);
        }
    }

    public function login(Request $request, Response $response): Response
    {
        $data = json_decode($request->getBody()->getContents(), true) ?? [];
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';

        try {
            $result = $this->loginAction->execute($email, $password);
            $response->getBody()->write(json_encode($result));

            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(200);
        } catch (\RuntimeException $e) {
            $response->getBody()->write(json_encode(['error' => $e->getMessage()]));

            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(401);
        }
    }

    public function me(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('authUser');
        if (!is_array($user)) {
            $response->getBody()->write(json_encode(['error' => 'Utilisateur non authentifié.']));

            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(401);
        }

        $response->getBody()->write(json_encode($user));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus(200);
    }
}
