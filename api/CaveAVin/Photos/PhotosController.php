<?php

declare(strict_types=1);

namespace CaveAVin\Photos;

use CaveAVin\Auth\Authentification;
use CaveAVin\Http\BaseController;
use CaveAVin\Http\ErreurApi;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Routes des photos (contrat §11) : corps brut image/jpeg de 10 Mo au plus. Lecture par
 * route authentifiée (isolation) : la PWA charge l'image par fetch, pas par <img src>.
 */
final class PhotosController extends BaseController
{
    public const TAILLE_MAX = 10 * 1024 * 1024;

    public function __construct(private readonly PhotosAction $photos)
    {
    }

    public function envoyer(
        ServerRequestInterface $request,
        ResponseInterface $response,
        string $clientRef,
    ): ResponseInterface {
        if (!self::estUuid($clientRef)) {
            throw ErreurApi::introuvable();
        }
        $type = strtolower(trim(explode(';', $request->getHeaderLine('Content-Type'))[0]));
        if ($type !== 'image/jpeg') {
            throw ErreurApi::typeNonPrisEnCharge('Photo : corps image/jpeg attendu.');
        }
        try {
            $trouvee = $this->photos->envoyer(
                Authentification::utilisateur($request),
                $clientRef,
                self::octets($request),
            );
        } catch (PhotoIllisible $erreur) {
            throw ErreurApi::donneesInvalides($erreur->getMessage());
        }

        return $trouvee ? $response->withStatus(204) : throw ErreurApi::introuvable();
    }

    public function photo(ServerRequestInterface $request, ResponseInterface $response, string $id): ResponseInterface
    {
        return $this->image($request, $response, (int) $id, false);
    }

    public function miniature(
        ServerRequestInterface $request,
        ResponseInterface $response,
        string $id,
    ): ResponseInterface {
        return $this->image($request, $response, (int) $id, true);
    }

    public function supprimer(
        ServerRequestInterface $request,
        ResponseInterface $response,
        string $id,
    ): ResponseInterface {
        return $this->photos->supprimer(Authentification::utilisateur($request), (int) $id)
            ? $response->withStatus(204)
            : throw ErreurApi::introuvable();
    }

    private function image(
        ServerRequestInterface $requete,
        ResponseInterface $reponse,
        int $id,
        bool $miniature,
    ): ResponseInterface {
        $fichier = $this->photos->fichier(Authentification::utilisateur($requete), $id, $miniature);
        $contenu = $fichier === null ? false : file_get_contents($fichier);
        if ($contenu === false) {
            throw ErreurApi::introuvable();
        }
        $reponse->getBody()->write($contenu);

        return $reponse
            ->withHeader('Content-Type', 'image/jpeg')
            ->withHeader('Cache-Control', 'no-store');
    }

    /** Corps de la requête, refusé au-delà de TAILLE_MAX sans le lire en entier. */
    private static function octets(ServerRequestInterface $requete): string
    {
        if ((int) $requete->getHeaderLine('Content-Length') > self::TAILLE_MAX) {
            throw self::tropGrosse();
        }
        $flux = $requete->getBody();
        if ($flux->isSeekable()) {
            $flux->rewind();
        }
        $octets = '';
        while (!$flux->eof() && strlen($octets) <= self::TAILLE_MAX) {
            $octets .= $flux->read(1024 * 1024);
        }
        if (strlen($octets) > self::TAILLE_MAX) {
            throw self::tropGrosse();
        }

        return $octets;
    }

    private static function tropGrosse(): ErreurApi
    {
        return ErreurApi::tropGros('Photo de plus de 10 Mo.');
    }
}
