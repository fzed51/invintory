<?php

declare(strict_types=1);

namespace CaveAVin;

/** Journal applicatif simple, fichier unique hors webroot (Arch §6.5 ; rotation : suivi, P8). */
final class Journal
{
    public function __construct(private readonly string $fichier)
    {
    }

    public function ecrire(string $niveau, string $message): void
    {
        $dossier = dirname($this->fichier);
        if (!is_dir($dossier) && !@mkdir($dossier, 0755, true) && !is_dir($dossier)) {
            return;
        }

        @file_put_contents(
            $this->fichier,
            sprintf("[%s] %s %s\n", date('c'), strtoupper($niveau), $message),
            FILE_APPEND | LOCK_EX,
        );
    }
}
