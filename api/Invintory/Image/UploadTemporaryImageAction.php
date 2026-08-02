<?php

namespace Invintory\Image;

use Psr\Http\Message\UploadedFileInterface;

class UploadTemporaryImageAction
{
    private const MAX_UPLOAD_SIZE_BYTES = 8_000_000;
    private const STANDARD_IMAGE_WIDTH = 512;
    private const STANDARD_IMAGE_HEIGHT = 1024;
    private const STANDARD_IMAGE_QUALITY = 85;

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

    /**
     * @return array{id: string}
     */
    public function execute(int $userId, UploadedFileInterface $file): array
    {
        if ($file->getError() !== UPLOAD_ERR_OK) {
            throw new \InvalidArgumentException('Erreur lors de l\'upload de l\'image.');
        }

        $size = $file->getSize();
        if ($size === null || $size < 1 || $size > self::MAX_UPLOAD_SIZE_BYTES) {
            throw new \InvalidArgumentException('Image invalide ou trop volumineuse.');
        }

        $mimeType = strtolower((string) $file->getClientMediaType());
        if (!isset($this->supportedMimeTypes[$mimeType])) {
            throw new \InvalidArgumentException('Format d\'image non supporté.');
        }

        $imageId = bin2hex(random_bytes(16));
        $relativePath = sprintf('tmp/%s.jpg', $imageId);
        $absolutePath = $this->absolutePath($relativePath);
        $this->ensureDirectory(dirname($absolutePath));

        $uploadedRelativePath = sprintf('tmp/%s.upload', $imageId);
        $uploadedAbsolutePath = $this->absolutePath($uploadedRelativePath);
        $file->moveTo($uploadedAbsolutePath);

        try {
            $this->formatBottleImage($uploadedAbsolutePath, $absolutePath);
        } catch (\Throwable $exception) {
            if (file_exists($uploadedAbsolutePath)) {
                unlink($uploadedAbsolutePath);
            }
            if (file_exists($absolutePath)) {
                unlink($absolutePath);
            }

            throw new \RuntimeException('image_processing_failed', 0, $exception);
        }

        if (file_exists($uploadedAbsolutePath)) {
            unlink($uploadedAbsolutePath);
        }

        $statement = $this->pdo->prepare(
            'INSERT INTO images (id, user_id, mime_type, extension, storage_path, is_temporary, created_at)
             VALUES (:id, :user_id, :mime_type, :extension, :storage_path, 1, :created_at)'
        );
        $statement->execute([
            'id' => $imageId,
            'user_id' => $userId,
            'mime_type' => 'image/jpeg',
            'extension' => 'jpg',
            'storage_path' => $relativePath,
            'created_at' => (new \DateTimeImmutable())->format(\DATE_ATOM),
        ]);

        return ['id' => $imageId];
    }

    private function ensureDirectory(string $directory): void
    {
        if (!is_dir($directory)) {
            mkdir($directory, 0755, true);
        }
    }

    private function formatBottleImage(string $sourcePath, string $targetPath): void
    {
        $rawContent = file_get_contents($sourcePath);
        if ($rawContent === false) {
            throw new \RuntimeException('Unable to read uploaded image.');
        }

        $source = imagecreatefromstring($rawContent);
        if ($source === false) {
            throw new \RuntimeException('Unable to decode uploaded image.');
        }

        $sourceWidth = imagesx($source);
        $sourceHeight = imagesy($source);
        if ($sourceWidth < 1 || $sourceHeight < 1) {
            imagedestroy($source);
            throw new \RuntimeException('Invalid source image dimensions.');
        }

        $scaledWidth = (int) max(1, round(($sourceWidth * self::STANDARD_IMAGE_HEIGHT) / $sourceHeight));
        $scaled = imagecreatetruecolor($scaledWidth, self::STANDARD_IMAGE_HEIGHT);
        if ($scaled === false) {
            imagedestroy($source);
            throw new \RuntimeException('Unable to create scaled image.');
        }

        if (!imagecopyresampled($scaled, $source, 0, 0, 0, 0, $scaledWidth, self::STANDARD_IMAGE_HEIGHT, $sourceWidth, $sourceHeight)) {
            imagedestroy($scaled);
            imagedestroy($source);
            throw new \RuntimeException('Unable to resize source image.');
        }

        $formatted = imagecreatetruecolor(self::STANDARD_IMAGE_WIDTH, self::STANDARD_IMAGE_HEIGHT);
        if ($formatted === false) {
            imagedestroy($scaled);
            imagedestroy($source);
            throw new \RuntimeException('Unable to create target image.');
        }

        $black = imagecolorallocate($formatted, 0, 0, 0);
        imagefilledrectangle($formatted, 0, 0, self::STANDARD_IMAGE_WIDTH, self::STANDARD_IMAGE_HEIGHT, $black);

        if ($scaledWidth <= self::STANDARD_IMAGE_WIDTH) {
            $destinationX = intdiv(self::STANDARD_IMAGE_WIDTH - $scaledWidth, 2);
            imagecopy($formatted, $scaled, $destinationX, 0, 0, 0, $scaledWidth, self::STANDARD_IMAGE_HEIGHT);
        } else {
            $sourceX = intdiv($scaledWidth - self::STANDARD_IMAGE_WIDTH, 2);
            imagecopy($formatted, $scaled, 0, 0, $sourceX, 0, self::STANDARD_IMAGE_WIDTH, self::STANDARD_IMAGE_HEIGHT);
        }

        $written = imagejpeg($formatted, $targetPath, self::STANDARD_IMAGE_QUALITY);

        imagedestroy($formatted);
        imagedestroy($scaled);
        imagedestroy($source);

        if ($written !== true) {
            throw new \RuntimeException('Unable to write target image.');
        }
    }

    private function absolutePath(string $relativePath): string
    {
        return rtrim($this->imagesBaseDir, '/\\') . DIRECTORY_SEPARATOR . ltrim($relativePath, '/\\');
    }
}
