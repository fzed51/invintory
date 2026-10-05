<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Doublure;

use GuzzleHttp\Promise\Create;
use GuzzleHttp\Promise\PromiseInterface;
use Psr\Http\Message\RequestInterface;
use Throwable;

/** Gestionnaire Guzzle qui sert les requêtes par la doublure, en processus, sans réseau. */
final class GestionnaireSimule
{
    /** @var list<RequestInterface> */
    public array $requetes = [];

    public function __construct(private readonly AuthServiceSimule $service)
    {
    }

    /** @param array<string, mixed> $options */
    public function __invoke(RequestInterface $requete, array $options): PromiseInterface
    {
        $this->requetes[] = $requete;
        try {
            return Create::promiseFor($this->service->traiter($requete));
        } catch (Throwable $exception) {
            return Create::promiseFor(AuthServiceSimule::erreurInterne($exception));
        }
    }
}
