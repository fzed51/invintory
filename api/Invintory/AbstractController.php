<?php

namespace Invintory;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Psr7\Response as SlimResponse;

abstract class AbstractController
{
    protected function jsonError(int $status, string $message): Response
    {
        $response = new SlimResponse($status);
        $response->getBody()->write(json_encode(['error' => $message], JSON_THROW_ON_ERROR));

        return $response->withHeader('Content-Type', 'application/json');
    }

    protected function jsonResponse(Response $response, mixed $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_THROW_ON_ERROR));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus($status);
    }

    protected function getUserId(Request $request): ?int
    {
        $user = $request->getAttribute('authUser');
        if (!is_array($user) || !isset($user['id'])) {
            return null;
        }

        return (int) $user['id'];
    }

    protected function getJsonBody(Request $request): ?array
    {
        $body = json_decode($request->getBody()->getContents(), true);

        return is_array($body) ? $body : null;
    }
}
