<?php

declare(strict_types=1);

namespace CaveAVin;

use CaveAVin\Http\ErreurHandler;
use DI\Bridge\Slim\Bridge;
use Psr\Container\ContainerInterface;
use Slim\App;

final class Application
{
    /**
     * Assemble l'application Slim (conteneur, routes, erreurs) sans la lancer.
     *
     * @return App<ContainerInterface|null>
     */
    public static function creer(): App
    {
        $conteneur = (require __DIR__ . '/../container.php')();

        $app = Bridge::create($conteneur);
        $app->setBasePath('/api');
        $app->addRoutingMiddleware();

        $debug = Environnement::lireBooleen('APP_DEBUG');
        $gestionnaire = $app->addErrorMiddleware($debug, false, false);
        $gestionnaire->setDefaultErrorHandler(new ErreurHandler(
            $app->getResponseFactory(),
            $debug,
            Environnement::lire('APP_LOG_FILE', dirname(__DIR__, 2) . '/logs/api.log'),
        ));

        (require __DIR__ . '/../router.php')($app);

        return $app;
    }
}
