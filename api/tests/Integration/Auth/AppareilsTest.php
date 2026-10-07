<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Auth;

use CaveAVin\Tests\Support\AuthTestCase;

/** Déconnexion de l'appareil, liste et révocation des appareils (P14), isolées par utilisateur. */
final class AppareilsTest extends AuthTestCase
{
    public function testDeconnexionSupprimeLaSessionEtEffaceLeCookie(): void
    {
        $this->connecter();
        $ticket = $this->ticket();

        $reponse = $this->appeler('POST', '/api/auth/logout');

        self::assertSame(204, $reponse->getStatusCode());
        self::assertSame(
            'ivt_session=; Path=/api/auth; Max-Age=0; Secure; HttpOnly; SameSite=Strict',
            $this->cookie($reponse, 'ivt_session'),
        );
        self::assertSame(0, $this->nombreDeSessions());
        $this->cookies['ivt_session'] = $ticket;
        self::assertSame(401, $this->appeler('POST', '/api/auth/refresh')->getStatusCode());
    }

    public function testDeconnexionSansTicketResteUnSucces(): void
    {
        self::assertSame(204, $this->appeler('POST', '/api/auth/logout')->getStatusCode());
    }

    public function testDeconnexionAvecUnAncienTicketNeSupprimeRien(): void
    {
        $this->connecter();
        $ancien = $this->ticket();
        $this->appeler('POST', '/api/auth/refresh');
        $this->cookies['ivt_session'] = $ancien;

        $this->appeler('POST', '/api/auth/logout');

        self::assertSame(1, $this->nombreDeSessions());
    }

    public function testListeLesAppareilsDeLUtilisateurEtMarqueLeCourant(): void
    {
        $this->connecter(appareil: 'Ordinateur');
        $jeton = $this->connecter(appareil: 'Téléphone');
        $this->connecter('bob@exemple.fr', 'Appareil de Bob');
        $this->maintenant += 5;
        $this->cookies = [];
        $jeton = $this->connecter(appareil: 'Téléphone courant');

        $reponse = $this->appeler('GET', '/api/auth/devices', null, $this->bearer($jeton));
        $appareils = $this->json($reponse)['devices'];

        self::assertIsArray($appareils);
        self::assertSame(
            [['Téléphone courant', true], ['Téléphone', false], ['Ordinateur', false]],
            array_map(static fn (array $a): array => [$a['device'], $a['current']], $appareils),
        );
        self::assertSame(['id', 'device', 'created_at', 'last_used_at', 'current'], array_keys($appareils[0]));
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', $appareils[0]['created_at']);
    }

    public function testRevoquerUnAutreAppareil(): void
    {
        $this->connecter(appareil: 'Ordinateur');
        $ordinateur = $this->ticket();
        $jeton = $this->connecter(appareil: 'Téléphone');
        $id = (int) $this->valeur("SELECT id FROM user_sessions WHERE device_label = 'Ordinateur'");

        $reponse = $this->appeler('DELETE', '/api/auth/devices/' . $id, null, $this->bearer($jeton));

        self::assertSame(204, $reponse->getStatusCode());
        self::assertSame(1, $this->nombreDeSessions());
        $this->cookies['ivt_session'] = $ordinateur;
        self::assertSame(401, $this->appeler('POST', '/api/auth/refresh')->getStatusCode());
    }

    public function testNePeutNiVoirNiRevoquerLesAppareilsDUnAutre(): void
    {
        $this->connecter(appareil: 'Appareil d’Alice');
        $idAlice = (int) $this->valeur('SELECT id FROM user_sessions');
        $jetonBob = $this->connecter('bob@exemple.fr', 'Appareil de Bob');

        $liste = $this->json($this->appeler('GET', '/api/auth/devices', null, $this->bearer($jetonBob)))['devices'];
        $reponse = $this->appeler('DELETE', '/api/auth/devices/' . $idAlice, null, $this->bearer($jetonBob));

        self::assertSame(['Appareil de Bob'], array_column((array) $liste, 'device'));
        self::assertSame(404, $reponse->getStatusCode());
        self::assertSame('NOT_FOUND', $this->codeErreur($reponse));
        self::assertSame(2, $this->nombreDeSessions());
    }

    public function testIdentifiantDAppareilNonNumerique(): void
    {
        $jeton = $this->connecter();

        $reponse = $this->appeler('DELETE', '/api/auth/devices/abc', null, $this->bearer($jeton));

        self::assertSame(404, $reponse->getStatusCode());
    }
}
