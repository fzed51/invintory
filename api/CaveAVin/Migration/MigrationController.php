<?php

declare(strict_types=1);

namespace CaveAVin\Migration;

use CaveAVin\Http\BaseController;
use Psr\Http\Message\ResponseInterface;

/** POST /internal/migrate, appelé par la CI après l'upload (architecture §6.6). */
final class MigrationController extends BaseController
{
    public function __construct(private readonly Migrateur $migrateur)
    {
    }

    public function migrer(ResponseInterface $response): ResponseInterface
    {
        return $this->json($response, ['executed' => $this->migrateur->executer()]);
    }
}
