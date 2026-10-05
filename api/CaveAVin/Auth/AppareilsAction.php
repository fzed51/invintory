<?php

declare(strict_types=1);

namespace CaveAVin\Auth;

/** Déconnexion de l'appareil courant, liste et révocation des appareils (P14). */
final class AppareilsAction
{
    public function __construct(private readonly SessionRepository $sessions)
    {
    }

    public function deconnecter(?string $ticket): void
    {
        if ($ticket !== null && $ticket !== '') {
            $this->sessions->supprimerParEmpreinte(Ticket::empreinte($ticket));
        }
    }

    /** @return list<array{id: int, appareil: ?string, cree_le: string, utilise_le: string, courant: bool}> */
    public function lister(int $utilisateur, ?string $ticket): array
    {
        return $this->sessions->listerPour($utilisateur, $ticket === null ? null : Ticket::empreinte($ticket));
    }

    /** @return bool faux si l'appareil n'existe pas ou appartient à un autre utilisateur */
    public function revoquer(int $utilisateur, int $id): bool
    {
        return $this->sessions->supprimerPour($utilisateur, $id);
    }
}
