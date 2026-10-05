<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Support;

use PDO;
use PHPUnit\Framework\TestCase;

/** Test d'intégration : base de test migrée, puis vidée avant chaque test (schéma conservé). */
abstract class IntegrationTestCase extends TestCase
{
    protected PDO $pdo;

    protected function setUp(): void
    {
        $this->pdo = BaseDeTest::connexion();
        BaseDeTest::migrer($this->pdo);
        BaseDeTest::vider($this->pdo);
    }

    protected function valeur(string $sql): mixed
    {
        return BaseDeTest::valeur($this->pdo, $sql);
    }
}
