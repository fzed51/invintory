<?php

namespace TemplatePhpReact\Image;

class StreamImageAction
{
    private \PDO $pdo;
    private string $imagesBaseDir;

    public function __construct(\PDO $pdo)
    {
        $this->pdo = $pdo;
        $this->imagesBaseDir = __DIR__ . '/../../../data/images';
    }

    /**
     * @return array{mimeType: string, absolutePath: string}
     */
    public function execute(int $userId, string $imageId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, mime_type, extension, storage_path, is_temporary
             FROM images
             WHERE id = :id AND user_id = :user_id
             LIMIT 1'
        );
        $statement->execute([
            'id' => $imageId,
            'user_id' => $userId,
        ]);
        $image = $statement->fetch();
        if ($image === false) {
            throw new \InvalidArgumentException('image_not_found');
        }

        if ((int) $image['is_temporary'] === 1) {
            try {
                $this->finalizeTemporaryImageAndCleanup($userId, (string) $image['id'], (string) $image['extension'], (string) $image['storage_path']);
                $image['storage_path'] = sprintf('final/%s.%s', $image['id'], $image['extension']);
            } catch (\Throwable $exception) {
                throw new \RuntimeException('finalize_failed', 0, $exception);
            }
        }

        $absolutePath = $this->absolutePath((string) $image['storage_path']);
        if (!file_exists($absolutePath)) {
            throw new \InvalidArgumentException('image_not_found');
        }

        return [
            'mimeType' => (string) $image['mime_type'],
            'absolutePath' => $absolutePath,
        ];
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
}
