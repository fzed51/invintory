<?php

declare(strict_types=1);

namespace CaveAVin\Categories;

use RuntimeException;

/** Une catégorie (type, région) existe déjà pour ce compte (contrat §9). */
final class CategorieExistante extends RuntimeException
{
}
