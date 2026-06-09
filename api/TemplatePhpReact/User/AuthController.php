<?php

namespace TemplatePhpReact\User;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use TemplatePhpReact\AbstractController;

class AuthController extends AbstractController
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
        $data = $this->getJsonBody($request) ?? [];
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';

        try {
            $result = $this->registerAction->execute($email, $password);

            return $this->jsonResponse($response, $result, 201);
        } catch (\InvalidArgumentException $e) {
            return $this->jsonError(400, $e->getMessage());
        } catch (\RuntimeException $e) {
            return $this->jsonError(409, $e->getMessage());
        }
    }

    public function login(Request $request, Response $response): Response
    {
        $data = $this->getJsonBody($request) ?? [];
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';

        try {
            $result = $this->loginAction->execute($email, $password);

            return $this->jsonResponse($response, $result);
        } catch (\RuntimeException $e) {
            return $this->jsonError(401, $e->getMessage());
        }
    }

    public function me(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('authUser');
        if (!is_array($user)) {
            return $this->jsonError(401, 'Utilisateur non authentifié.');
        }

        return $this->jsonResponse($response, $user);
    }
}
