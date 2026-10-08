<?php

declare(strict_types=1);

namespace CaveAVin\Export;

use CaveAVin\Auth\Authentification;
use CaveAVin\Bouteilles\BouteillesController;
use CaveAVin\Categories\CategoriesController;
use CaveAVin\Emplacements\EmplacementsController;
use CaveAVin\Horloge;
use CaveAVin\Http\BaseController;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use RuntimeException;
use Slim\Psr7\Stream;
use ZipArchive;

/**
 * GET /api/export (contrat §12) : archive ZIP avec `data.json` (mêmes noms de champs que
 * l'API, sans aucun id interne : bouteilles par référence, emplacements par nom) et
 * `photos/{reference}.jpg` (miniatures exclues).
 */
final class ExportController extends BaseController
{
    /** Clés d'identifiants internes retirées partout : ils ne survivent pas à un réimport. */
    private const IDS = ['id', 'cabinet_id'];

    public function __construct(private readonly ExporterAction $exporter, private readonly Horloge $horloge)
    {
    }

    public function exporter(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $export = $this->exporter->executer(Authentification::utilisateur($request));
        $maintenant = $this->horloge->maintenant();
        $donnees = self::sansIds([
            'exported_at' => gmdate('Y-m-d\TH:i:s.000\Z', $maintenant),
            'cabinets' => array_map(EmplacementsController::armoireJson(...), $export['armoires']),
            'boxes' => array_map(EmplacementsController::cartonJson(...), $export['cartons']),
            'regions' => array_map(fn (array $region): array => ['name' => $region['nom']], $export['regions']),
            'grapes' => array_map(fn (array $cepage): array => ['name' => $cepage['nom']], $export['cepages']),
            'categories' => array_map(CategoriesController::categorieJson(...), $export['categories']),
            'bottles' => array_map(BouteillesController::ficheJson(...), $export['fiches']),
        ]);

        return $response
            ->withBody(self::archive($donnees, $export['photos']))
            ->withHeader('Content-Type', 'application/zip')
            ->withHeader(
                'Content-Disposition',
                sprintf('attachment; filename="invintory-%s.zip"', gmdate('Y-m-d', $maintenant)),
            )
            ->withHeader('Cache-Control', 'no-store');
    }

    /**
     * @param array<mixed> $valeur
     * @return array<mixed>
     */
    private static function sansIds(array $valeur): array
    {
        $resultat = [];
        foreach ($valeur as $cle => $element) {
            if (!in_array($cle, self::IDS, true)) {
                $resultat[$cle] = is_array($element) ? self::sansIds($element) : $element;
            }
        }

        return $resultat;
    }

    /**
     * Archive construite dans un fichier temporaire, recopiée dans un flux php://temp (effacé
     * par PHP à sa fermeture), puis supprimée.
     *
     * @param array<mixed> $donnees
     * @param array<string, string> $photos chemin absolu par référence
     */
    private static function archive(array $donnees, array $photos): Stream
    {
        $fichier = sys_get_temp_dir() . '/invintory-export-' . bin2hex(random_bytes(8)) . '.zip';
        try {
            $zip = new ZipArchive();
            if ($zip->open($fichier, ZipArchive::CREATE | ZipArchive::EXCL) !== true) {
                throw new RuntimeException('Archive d\'export impossible à créer.');
            }
            $zip->addFromString(
                'data.json',
                json_encode($donnees, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
            );
            foreach ($photos as $reference => $chemin) {
                $zip->addFile($chemin, 'photos/' . $reference . '.jpg');
            }
            if (!$zip->close()) {
                throw new RuntimeException('Archive d\'export impossible à écrire.');
            }
            $source = fopen($fichier, 'rb');
            $flux = fopen('php://temp', 'w+b');
            if ($source === false || $flux === false) {
                throw new RuntimeException('Archive d\'export illisible.');
            }
            stream_copy_to_stream($source, $flux);
            fclose($source);
            rewind($flux);

            return new Stream($flux);
        } finally {
            if (is_file($fichier)) {
                unlink($fichier);
            }
        }
    }
}
