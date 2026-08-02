<?php

namespace Invintory\Image;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Psr7\Response as SlimResponse;
use Slim\Psr7\Stream;
use Psr\Http\Message\UploadedFileInterface;

class ImageController
{
    private UploadTemporaryImageAction $uploadTemporaryImageAction;
    private StreamImageAction $streamImageAction;

    public function __construct(
        UploadTemporaryImageAction $uploadTemporaryImageAction,
        StreamImageAction $streamImageAction
    )
    {
        $this->uploadTemporaryImageAction = $uploadTemporaryImageAction;
        $this->streamImageAction = $streamImageAction;
    }

    public function uploadTemporary(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('authUser');
        if (!is_array($user) || !isset($user['id'])) {
            return $this->jsonError(401, 'Utilisateur non authentifié.');
        }

        $uploadedFiles = $request->getUploadedFiles();
        $file = $uploadedFiles['image'] ?? null;
        if (!$file instanceof UploadedFileInterface) {
            return $this->jsonError(400, 'Image manquante.');
        }

        try {
            $result = $this->uploadTemporaryImageAction->execute((int) $user['id'], $file);
            $response->getBody()->write(json_encode([
                'id' => $result['id'],
                'temporary' => true,
                'url' => '/api/images/' . $result['id'],
            ]));

            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(201);
        } catch (\InvalidArgumentException $exception) {
            return $this->jsonError(400, $exception->getMessage());
        } catch (\RuntimeException $exception) {
            return $this->jsonError(400, 'Impossible de traiter l\'image fournie.');
        }
    }

    public function streamImage(Request $request, Response $response, array $args): Response
    {
        $user = $request->getAttribute('authUser');
        if (!is_array($user) || !isset($user['id'])) {
            return $this->jsonError(401, 'Utilisateur non authentifié.');
        }

        $imageId = trim((string) ($args['imageId'] ?? ''));
        if (!preg_match('/^[a-f0-9]{32}$/', $imageId)) {
            return $this->jsonError(404, 'Illustration introuvable.');
        }

        try {
            $result = $this->streamImageAction->execute((int) $user['id'], $imageId);
        } catch (\InvalidArgumentException $exception) {
            return $this->jsonError(404, 'Illustration introuvable.');
        } catch (\RuntimeException $exception) {
            return $this->jsonError(500, 'Impossible de finaliser l\'illustration.');
        }

        $stream = new Stream(fopen((string) $result['absolutePath'], 'rb'));

        return (new SlimResponse(200))
            ->withBody($stream)
            ->withHeader('Content-Type', (string) $result['mimeType'])
            ->withHeader('Content-Length', (string) filesize((string) $result['absolutePath']))
            ->withHeader('Cache-Control', 'private, max-age=3600');
    }

    private function jsonError(int $status, string $message): Response
    {
        $response = new SlimResponse($status);
        $response->getBody()->write(json_encode(['error' => $message]));

        return $response->withHeader('Content-Type', 'application/json');
    }
}
