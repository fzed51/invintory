<?php

namespace TemplatePhpReact\User;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;
use Slim\Psr7\Response as SlimResponse;

class JwtAuthMiddleware
{
    private JwtService $jwtService;
    private UserRepository $userRepository;

    public function __construct(JwtService $jwtService, UserRepository $userRepository)
    {
        $this->jwtService = $jwtService;
        $this->userRepository = $userRepository;
    }

    public function __invoke(Request $request, RequestHandler $handler): Response
    {
        $authorizationHeader = $request->getHeaderLine('Authorization');
        if (!preg_match('/^Bearer\s+(.+)$/i', $authorizationHeader, $matches)) {
            return $this->unauthorizedResponse('Token manquant.');
        }

        $payload = $this->jwtService->validateToken(trim($matches[1]));
        if ($payload === null) {
            return $this->unauthorizedResponse('Token invalide ou expiré.');
        }

        $email = $payload['email'] ?? null;
        $userId = $payload['sub'] ?? null;
        if (!is_string($email) || !is_int($userId)) {
            return $this->unauthorizedResponse('Token invalide.');
        }

        $user = $this->userRepository->findByEmail($email);
        if ($user === null || (int) $user['id'] !== $userId) {
            return $this->unauthorizedResponse('Utilisateur introuvable.');
        }

        return $handler->handle($request->withAttribute('authUser', [
            'id' => $userId,
            'email' => $email,
        ]));
    }

    private function unauthorizedResponse(string $message): Response
    {
        $response = new SlimResponse(401);
        $response->getBody()->write(json_encode(['error' => $message]));

        return $response->withHeader('Content-Type', 'application/json');
    }
}
