<?php

declare(strict_types=1);

namespace CaveAVin\Sante;

use CaveAVin\Http\BaseController;
use Psr\Http\Message\ResponseInterface;

final class SanteController extends BaseController
{
    // Le nom $response est imposé : php-di/slim-bridge injecte $request, $response et les
    // arguments de route par nom.
    public function verifier(ResponseInterface $response): ResponseInterface
    {
        return $this->json($response, ['status' => 'ok']);
    }
}
