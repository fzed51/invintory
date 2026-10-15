<?php

declare(strict_types=1);

namespace Deploiement;

use FilesystemIterator;
use InvalidArgumentException;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;

/**
 * Prépare le dossier envoyé au serveur (architecture §6.6) : `api/` et `dist/` frères, plus le
 * `.env` à la racine. Liste blanche plutôt qu'exclusions : un fichier ajouté plus tard au
 * dépôt n'est jamais expédié sans décision (une exclusion tardive n'effacerait pas l'existant,
 * cf. note d'hébergement, « Deux pièges appris à l'usage »).
 */
final class Preparation
{
    /** Ce que `api/` contient en production, tout le reste (tests, outils, configuration de dev) reste ici. */
    private const API_ENVOYEE = ['bootstrap.php', 'container.php', 'router.php', 'CaveAVin', 'migrations', 'vendor'];

    /** Variables du .env de production, sans valeur par défaut sauf mention. */
    public const VARIABLES = [
        'DB_HOST',
        'DB_PORT',
        'DB_NAME',
        'DB_USER',
        'DB_PASSWORD',
        'DEPLOY_TOKEN',
        'AUTH_SERVICE_URL',
        'AUTH_CLIENT_ID',
        'AUTH_CLIENT_SECRET',
    ];

    public function __construct(private readonly string $racine, private readonly string $destination)
    {
    }

    public function preparer(): void
    {
        foreach (self::API_ENVOYEE as $element) {
            $this->exiger('api/' . $element);
        }
        $this->exiger('dist/index.html', ' (npm run build a-t-il été lancé ?)');
        $this->exiger('dist/api/index.php');

        $this->supprimer($this->destination);
        foreach (self::API_ENVOYEE as $element) {
            $this->copier($this->racine . '/api/' . $element, $this->destination . '/api/' . $element);
        }
        $this->copier($this->racine . '/dist', $this->destination . '/dist');
    }

    /** @param array<string, string> $variables */
    public function ecrireEnv(array $variables): void
    {
        if (!is_dir($this->destination) && !mkdir($this->destination, 0777, true)) {
            throw new RuntimeException('Dossier d\'envoi non créé : ' . $this->destination);
        }
        $fichier = $this->destination . '/.env';
        if (file_put_contents($fichier, self::contenuEnv($variables)) === false) {
            throw new RuntimeException('Fichier .env non écrit.');
        }
        chmod($fichier, 0600);
    }

    /**
     * Contenu du .env de production. Seules les variables connues sont retenues ; les messages
     * d'erreur nomment la variable, jamais sa valeur (ils finissent dans le journal de la CI).
     *
     * @param array<string, string> $variables
     */
    public static function contenuEnv(array $variables): string
    {
        if (($variables['DB_PORT'] ?? '') === '') {
            $variables['DB_PORT'] = '3306';
        }
        $lignes = ['APP_DEBUG=false'];
        foreach (self::VARIABLES as $nom) {
            $valeur = $variables[$nom] ?? '';
            if ($valeur === '') {
                throw new InvalidArgumentException('Variable ' . $nom . ' absente ou vide.');
            }
            if (preg_match('/[\r\n\0]/', $valeur) === 1) {
                throw new InvalidArgumentException('Variable ' . $nom . ' : valeur sur plusieurs lignes refusée.');
            }
            // Guillemets doubles (phpdotenv n'échappe rien entre guillemets simples) : \, " et $
            // s'échappent, ce dernier pour éviter l'interpolation de ${...}.
            $lignes[] = $nom . '="' . str_replace(['\\', '"', '$'], ['\\\\', '\\"', '\\$'], $valeur) . '"';
        }

        return implode("\n", $lignes) . "\n";
    }

    private function exiger(string $chemin, string $indice = ''): void
    {
        if (!file_exists($this->racine . '/' . $chemin)) {
            throw new RuntimeException($chemin . ' introuvable' . $indice . '.');
        }
    }

    private function copier(string $source, string $cible): void
    {
        if (!is_dir($source)) {
            $this->creerDossier(dirname($cible));
            if (!copy($source, $cible)) {
                throw new RuntimeException('Copie impossible : ' . $source);
            }

            return;
        }
        $this->creerDossier($cible);
        $parcours = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST,
        );
        foreach ($parcours as $element) {
            $relatif = substr($element->getPathname(), strlen($source));
            if ($element->isDir()) {
                $this->creerDossier($cible . $relatif);
            } elseif (!copy($element->getPathname(), $cible . $relatif)) {
                throw new RuntimeException('Copie impossible : ' . $element->getPathname());
            }
        }
    }

    private function creerDossier(string $dossier): void
    {
        if (!is_dir($dossier) && !mkdir($dossier, 0777, true) && !is_dir($dossier)) {
            throw new RuntimeException('Dossier non créé : ' . $dossier);
        }
    }

    private function supprimer(string $chemin): void
    {
        if (!is_dir($chemin)) {
            return;
        }
        foreach (scandir($chemin) ?: [] as $nom) {
            if ($nom === '.' || $nom === '..') {
                continue;
            }
            $element = $chemin . '/' . $nom;
            is_dir($element) && !is_link($element) ? $this->supprimer($element) : unlink($element);
        }
        rmdir($chemin);
    }
}
