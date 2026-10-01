<?php

declare(strict_types=1);

namespace CaveAVin\Tests\Integration;

use CaveAVin\Tests\Support\BaseDeTest;
use CaveAVin\Tests\Support\IntegrationTestCase;

final class BaseDeTestTest extends IntegrationTestCase
{
    protected function tearDown(): void
    {
        $this->pdo->exec('DROP TABLE IF EXISTS t_videe, t_conservee');
    }

    public function testSeConnecteALaBaseDeTest(): void
    {
        self::assertSame(BaseDeTest::nomBase(), $this->valeur('SELECT DATABASE()'));
    }

    public function testLeMoteurEstMySql80(): void
    {
        self::assertStringStartsWith('8.0.', (string) $this->valeur('SELECT VERSION()'));
    }

    public function testLaBaseEstEnUtf8mb4(): void
    {
        $jeu = $this->valeur('SELECT @@character_set_database');

        self::assertSame('utf8mb4', $jeu);
    }

    public function testViderSupprimeLesLignesSaufDesTablesExclues(): void
    {
        $this->pdo->exec('CREATE TABLE t_videe (id INT PRIMARY KEY) ENGINE=InnoDB');
        $this->pdo->exec('CREATE TABLE t_conservee (id INT PRIMARY KEY) ENGINE=InnoDB');
        $this->pdo->exec('INSERT INTO t_videe VALUES (1), (2)');
        $this->pdo->exec('INSERT INTO t_conservee VALUES (1)');

        BaseDeTest::vider($this->pdo, ['t_conservee']);

        self::assertSame(0, (int) $this->valeur('SELECT COUNT(*) FROM t_videe'));
        self::assertSame(1, (int) $this->valeur('SELECT COUNT(*) FROM t_conservee'));
    }

    public function testViderIgnoreLesClesEtrangeres(): void
    {
        $this->pdo->exec('CREATE TABLE t_conservee (id INT PRIMARY KEY) ENGINE=InnoDB');
        $this->pdo->exec(
            'CREATE TABLE t_videe (id INT PRIMARY KEY, parent_id INT NOT NULL,'
            . ' FOREIGN KEY (parent_id) REFERENCES t_conservee (id)) ENGINE=InnoDB'
        );
        $this->pdo->exec('INSERT INTO t_conservee VALUES (1)');
        $this->pdo->exec('INSERT INTO t_videe VALUES (1, 1)');

        BaseDeTest::vider($this->pdo);

        self::assertSame(0, (int) $this->valeur('SELECT COUNT(*) FROM t_conservee'));
        self::assertSame(1, (int) $this->valeur('SELECT @@FOREIGN_KEY_CHECKS'));
    }
}
