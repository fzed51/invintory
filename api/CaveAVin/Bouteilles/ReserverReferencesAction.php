<?php

declare(strict_types=1);

namespace CaveAVin\Bouteilles;

/**
 * Réserve de références (P1, contrat §4) : les $nombre codes suivants de la séquence de
 * l'utilisateur, sous verrou. Une longueur épuisée cède la place à la suivante.
 */
final class ReserverReferencesAction
{
    public function __construct(private readonly SequenceRepository $sequences)
    {
    }

    /** @return list<string> dans l'ordre de la séquence */
    public function executer(int $utilisateur, int $nombre): array
    {
        return $this->sequences->transaction(function () use ($utilisateur, $nombre): array {
            ['longueur' => $longueur, 'index' => $index] = $this->sequences->verrouiller($utilisateur);
            $codes = [];
            while (count($codes) < $nombre) {
                if ($index >= CodeReference::capacite($longueur)) {
                    $longueur++;
                    $index = 0;
                }
                $codes[] = CodeReference::code($longueur, $index++);
            }
            $this->sequences->avancer($utilisateur, $longueur, $index);

            return $codes;
        });
    }
}
