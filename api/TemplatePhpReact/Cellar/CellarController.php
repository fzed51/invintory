<?php

namespace TemplatePhpReact\Cellar;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Psr7\Response as SlimResponse;

class CellarController
{
    private CellarRepository $repository;

    public function __construct(CellarRepository $repository)
    {
        $this->repository = $repository;
    }

    public function getCellar(Request $request, Response $response): Response
    {
        $userId = $this->getUserId($request);
        if ($userId === null) {
            return $this->jsonError(401, 'Utilisateur non authentifié.');
        }

        $stored = $this->repository->findByUserId($userId);
        if ($stored === null) {
            $response->getBody()->write(json_encode([
                'cellar' => [
                    'cabinets' => [],
                    'bottles' => [],
                    'cartons' => [],
                ],
                'updatedAt' => null,
            ]));

            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(200);
        }

        $payload = json_decode($stored['payload'], true);
        if (!is_array($payload)) {
            $payload = [
                'cabinets' => [],
                'bottles' => [],
                'cartons' => [],
            ];
        }

        $response->getBody()->write(json_encode([
            'cellar' => [
                'cabinets' => is_array($payload['cabinets'] ?? null) ? $payload['cabinets'] : [],
                'bottles' => is_array($payload['bottles'] ?? null) ? $payload['bottles'] : [],
                'cartons' => is_array($payload['cartons'] ?? null) ? $payload['cartons'] : [],
            ],
            'updatedAt' => $stored['updatedAt'],
        ]));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus(200);
    }

    public function saveCellar(Request $request, Response $response): Response
    {
        $userId = $this->getUserId($request);
        if ($userId === null) {
            return $this->jsonError(401, 'Utilisateur non authentifié.');
        }

        $body = json_decode($request->getBody()->getContents(), true);
        if (!is_array($body)) {
            return $this->jsonError(400, 'Corps JSON invalide.');
        }

        $cellar = $body['cellar'] ?? null;
        if (!is_array($cellar)) {
            return $this->jsonError(400, 'Le champ cellar est requis.');
        }

        $normalized = [
            'cabinets' => is_array($cellar['cabinets'] ?? null) ? $cellar['cabinets'] : [],
            'bottles' => is_array($cellar['bottles'] ?? null) ? $cellar['bottles'] : [],
            'cartons' => is_array($cellar['cartons'] ?? null) ? $cellar['cartons'] : [],
        ];

        $updatedAt = $body['updatedAt'] ?? '';
        if (!is_string($updatedAt) || trim($updatedAt) === '') {
            $updatedAt = gmdate('c');
        }

        $payload = json_encode($normalized);
        if ($payload === false) {
            return $this->jsonError(400, 'Impossible de sérialiser la cave.');
        }

        $this->repository->saveByUserId($userId, $payload, $updatedAt);

        $response->getBody()->write(json_encode(['updatedAt' => $updatedAt]));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus(200);
    }

    private function getUserId(Request $request): ?int
    {
        $user = $request->getAttribute('authUser');
        if (!is_array($user) || !isset($user['id'])) {
            return null;
        }

        return (int) $user['id'];
    }

    private function jsonError(int $status, string $message): Response
    {
        $response = new SlimResponse($status);
        $response->getBody()->write(json_encode(['error' => $message]));

        return $response->withHeader('Content-Type', 'application/json');
    }
}
