<?php

namespace TemplatePhpReact\Image;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Psr7\Response as SlimResponse;
use Slim\Psr7\Stream;
use Psr\Http\Message\UploadedFileInterface;

class ImageController
{
    private const MAX_UPLOAD_SIZE_BYTES = 8_000_000;

    private \PDO $pdo;
    private string $imagesBaseDir;

    /**
     * @var array<string, string>
     */
    private array $supportedMimeTypes = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/heic' => 'heic',
        'image/heif' => 'heif',
    ];

    public function __construct(\PDO $pdo)
    {
        $this->pdo = $pdo;
        $this->imagesBaseDir = __DIR__ . '/../../../data/images';
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

        if ($file->getError() !== UPLOAD_ERR_OK) {
            return $this->jsonError(400, 'Erreur lors de l\'upload de l\'image.');
        }

        $size = $file->getSize();
        if ($size === null || $size < 1 || $size > self::MAX_UPLOAD_SIZE_BYTES) {
            return $this->jsonError(400, 'Image invalide ou trop volumineuse.');
        }

        $mimeType = strtolower((string) $file->getClientMediaType());
        $extension = $this->supportedMimeTypes[$mimeType] ?? null;
        if ($extension === null) {
            return $this->jsonError(400, 'Format d\'image non supporté.');
        }

        $imageId = bin2hex(random_bytes(16));
        $relativePath = sprintf('tmp/%s.%s', $imageId, $extension);
        $absolutePath = $this->absolutePath($relativePath);
        $this->ensureDirectory(dirname($absolutePath));

        $file->moveTo($absolutePath);

        $statement = $this->pdo->prepare(
            'INSERT INTO images (id, user_id, mime_type, extension, storage_path, is_temporary, created_at)
             VALUES (:id, :user_id, :mime_type, :extension, :storage_path, 1, :created_at)'
        );
        $statement->execute([
            'id' => $imageId,
            'user_id' => (int) $user['id'],
            'mime_type' => $mimeType,
            'extension' => $extension,
            'storage_path' => $relativePath,
            'created_at' => (new \DateTimeImmutable())->format(\DATE_ATOM),
        ]);

        $response->getBody()->write(json_encode([
            'id' => $imageId,
            'temporary' => true,
            'url' => '/api/images/' . $imageId,
        ]));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus(201);
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

        $statement = $this->pdo->prepare(
            'SELECT id, mime_type, extension, storage_path, is_temporary
             FROM images
             WHERE id = :id AND user_id = :user_id
             LIMIT 1'
        );
        $statement->execute([
            'id' => $imageId,
            'user_id' => (int) $user['id'],
        ]);
        $image = $statement->fetch();
        if ($image === false) {
            return $this->jsonError(404, 'Illustration introuvable.');
        }

        if ((int) $image['is_temporary'] === 1) {
            try {
                $this->finalizeTemporaryImageAndCleanup((int) $user['id'], (string) $image['id'], (string) $image['extension'], (string) $image['storage_path']);
                $image['storage_path'] = sprintf('final/%s.%s', $image['id'], $image['extension']);
            } catch (\Throwable $exception) {
                return $this->jsonError(500, 'Impossible de finaliser l\'illustration.');
            }
        }

        $absolutePath = $this->absolutePath((string) $image['storage_path']);
        if (!file_exists($absolutePath)) {
            return $this->jsonError(404, 'Illustration introuvable.');
        }

        $stream = new Stream(fopen($absolutePath, 'rb'));

        return (new SlimResponse(200))
            ->withBody($stream)
            ->withHeader('Content-Type', (string) $image['mime_type'])
            ->withHeader('Content-Length', (string) filesize($absolutePath))
            ->withHeader('Cache-Control', 'private, max-age=3600');
    }

    private function finalizeTemporaryImageAndCleanup(int $userId, string $imageId, string $extension, string $sourceRelativePath): void
    {
        $this->pdo->beginTransaction();
        try {
            $targetRelativePath = sprintf('final/%s.%s', $imageId, $extension);
            $sourceAbsolutePath = $this->absolutePath($sourceRelativePath);
            $targetAbsolutePath = $this->absolutePath($targetRelativePath);
            $this->ensureDirectory(dirname($targetAbsolutePath));

            if (file_exists($sourceAbsolutePath)) {
                if (!rename($sourceAbsolutePath, $targetAbsolutePath)) {
                    throw new \RuntimeException('Failed to move temporary image.');
                }
            }

            $updateStatement = $this->pdo->prepare(
                'UPDATE images
                 SET is_temporary = 0, storage_path = :storage_path
                 WHERE id = :id AND user_id = :user_id'
            );
            $updateStatement->execute([
                'storage_path' => $targetRelativePath,
                'id' => $imageId,
                'user_id' => $userId,
            ]);

            $temporaryImagesStatement = $this->pdo->prepare(
                'SELECT id, storage_path
                 FROM images
                 WHERE user_id = :user_id AND is_temporary = 1'
            );
            $temporaryImagesStatement->execute(['user_id' => $userId]);
            $temporaryImages = $temporaryImagesStatement->fetchAll();

            foreach ($temporaryImages as $temporaryImage) {
                $temporaryImageId = (string) $temporaryImage['id'];
                if ($temporaryImageId === $imageId) {
                    continue;
                }

                $temporaryAbsolutePath = $this->absolutePath((string) $temporaryImage['storage_path']);
                if (file_exists($temporaryAbsolutePath)) {
                    unlink($temporaryAbsolutePath);
                }

                $deleteStatement = $this->pdo->prepare(
                    'DELETE FROM images
                     WHERE id = :id AND user_id = :user_id AND is_temporary = 1'
                );
                $deleteStatement->execute([
                    'id' => $temporaryImageId,
                    'user_id' => $userId,
                ]);
            }

            $this->pdo->commit();
        } catch (\Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }

            throw $exception;
        }
    }

    private function ensureDirectory(string $directory): void
    {
        if (!is_dir($directory)) {
            mkdir($directory, 0755, true);
        }
    }

    private function absolutePath(string $relativePath): string
    {
        return rtrim($this->imagesBaseDir, '/\\') . DIRECTORY_SEPARATOR . ltrim($relativePath, '/\\');
    }

    private function jsonError(int $status, string $message): Response
    {
        $response = new SlimResponse($status);
        $response->getBody()->write(json_encode(['error' => $message]));

        return $response->withHeader('Content-Type', 'application/json');
    }
}
