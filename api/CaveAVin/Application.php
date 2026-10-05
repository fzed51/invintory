<?php

declare(strict_types=1);

namespace CaveAVin;

use CaveAVin\Auth\Authentification;
use CaveAVin\Http\ErreurHandler;
use DI\Bridge\Slim\Bridge;
use Psr\Container\ContainerInterface;
use Slim\App;

final class Application
{
    /**
     * Assemble l'application Slim (conteneur, routes, erreurs) sans la lancer.
     *
     * @param array<string, mixed> $surcharges définitions du conteneur remplacées (tests)
     * @return App<ContainerInterface|null>
     */
    public static function creer(array $surcharges = []): App
    {
        $conteneur = (require __DIR__ . '/../container.php')($surcharges);

        $app = Bridge::create($conteneur);
        $app->setBasePath('/api');
        // Ordre inverse d'exécution : le routage passe avant l'authentification, qui lit le
        // nom de la route (routes « public.* »).
        $app->add(Authentification::class);
        $app->addBodyParsingMiddleware();
        $app->addRoutingMiddleware();

        $debug = Environnement::lireBooleen('APP_DEBUG');
        $gestionnaire = $app->addErrorMiddleware($debug, false, false);
        $journal = $conteneur->get(Journal::class);
        assert($journal instanceof Journal);
        $gestionnaire->setDefaultErrorHandler(new ErreurHandler($app->getResponseFactory(), $debug, $journal));

        (require __DIR__ . '/../router.php')($app);

        return $app;
    }
}
