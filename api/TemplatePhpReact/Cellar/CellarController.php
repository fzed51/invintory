<?php

namespace TemplatePhpReact\Cellar;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use TemplatePhpReact\AbstractController;

class CellarController extends AbstractController
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
            return $this->jsonResponse($response, [
                'cellar' => [
                    'cabinets' => [],
                    'bottles' => [],
                    'cartons' => [],
                ],
                'updatedAt' => null,
            ]);
        }

        $payload = json_decode($stored['payload'], true);
        if (!is_array($payload)) {
            $payload = [
                'cabinets' => [],
                'bottles' => [],
                'cartons' => [],
            ];
        }

        return $this->jsonResponse($response, [
            'cellar' => [
                'cabinets' => is_array($payload['cabinets'] ?? null) ? $payload['cabinets'] : [],
                'bottles' => is_array($payload['bottles'] ?? null) ? $payload['bottles'] : [],
                'cartons' => is_array($payload['cartons'] ?? null) ? $payload['cartons'] : [],
            ],
            'updatedAt' => $stored['updatedAt'],
        ]);
    }

    public function saveCellar(Request $request, Response $response): Response
    {
        $userId = $this->getUserId($request);
        if ($userId === null) {
            return $this->jsonError(401, 'Utilisateur non authentifié.');
        }

        $body = $this->getJsonBody($request);
        if ($body === null) {
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

        return $this->jsonResponse($response, ['updatedAt' => $updatedAt]);
    }
}
