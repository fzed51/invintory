<?php

declare(strict_types=1);

namespace CaveAVin\Photos;

use RuntimeException;

/** Octets reçus qui ne sont pas une image JPEG décodable. */
final class PhotoIllisible extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Photo illisible : image JPEG attendue.');
    }
}
