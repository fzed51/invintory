<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration\Donnees;

use CaveAVin\Donnees\Repository;
use CaveAVin\Tests\Support\IntegrationTestCase;
use RuntimeException;

/**
 * Transactions du Repository de base : une transaction imbriquée (une mutation dans le lot
 * de /sync) est un point de sauvegarde, annulé seul si elle échoue.
 */
final class TransactionTest extends IntegrationTestCase
{
    private Repository $repository;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repository = new class ($this->pdo) extends Repository {
        };
    }

    public function testValideeSiRienNEchoue(): void
    {
        $this->repository->transaction(fn () => $this->creerUtilisateur('a'));

        self::assertSame(['a'], $this->utilisateurs());
        self::assertFalse($this->pdo->inTransaction());
    }

    public function testAnnuleeSiUneExceptionSEchappe(): void
    {
        try {
            $this->repository->transaction(function (): void {
                $this->creerUtilisateur('a');
                throw new RuntimeException('échec');
            });
        } catch (RuntimeException) {
        }

        self::assertSame([], $this->utilisateurs());
        self::assertFalse($this->pdo->inTransaction());
    }

    public function testUneTransactionImbriqueeEchoueeNAnnuleQuElleMeme(): void
    {
        $this->repository->transaction(function (): void {
            $this->creerUtilisateur('avant');
            try {
                $this->repository->transaction(function (): void {
                    $this->creerUtilisateur('rejetee');
                    throw new RuntimeException('mutation rejetée');
                });
            } catch (RuntimeException) {
            }
            $this->repository->transaction(fn () => $this->creerUtilisateur('apres'));
        });

        self::assertSame(['apres', 'avant'], $this->utilisateurs());
    }

    public function testLEchecDeLaTransactionEnglobanteAnnuleLesImbriquees(): void
    {
        try {
            $this->repository->transaction(function (): void {
                $this->repository->transaction(fn () => $this->creerUtilisateur('imbriquee'));
                throw new RuntimeException('lot en échec');
            });
        } catch (RuntimeException) {
        }

        self::assertSame([], $this->utilisateurs());
    }

    private function creerUtilisateur(string $nom): void
    {
        $this->pdo->prepare('INSERT INTO users (auth_sub, email) VALUES (?, ?)')->execute([$nom, $nom . '@exemple.fr']);
    }

    /** @return list<string> */
    private function utilisateurs(): array
    {
        $requete = $this->pdo->query('SELECT auth_sub FROM users ORDER BY auth_sub');
        self::assertNotFalse($requete);

        /** @var list<string> */
        return $requete->fetchAll(\PDO::FETCH_COLUMN);
    }
}
