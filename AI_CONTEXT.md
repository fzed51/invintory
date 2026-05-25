# Contexte IA - Projet Template-Php-React

## Vue d'ensemble du projet

**Template-Php-React** est une base d'application full-stack avec :
- **Frontend** : React + TypeScript + Vite
- **Backend** : API REST en PHP avec Slim Framework v4
- **Architecture** : SPA (Single Page Application) avec API découplée

---

## Architecture API Backend PHP

### Stack technique

- **Framework** : Slim 4.15 (micro-framework PHP)
- **Dependency Injection** : PHP-DI v3.4 avec Slim Bridge
- **Routing** : FastRoute (via Slim)
- **Base de données** : SQLite avec PDO
- **Autoloading** : PSR-4 via Composer
- **Namespace principal** : `TemplatePhpReact\` (à modifier)

### Structure des fichiers

```
api/
├── bootstrap.php      # Point d'entrée de l'application
├── container.php      # Configuration du conteneur DI
├── router.php         # Définition des routes
└── TemplatePhpReact/         # Code métier (namespace TemplatePhpReact)
    └── [domaines]/    # Dossiers organisés par domaine/ressource
        ├── *Controller.php  # Contrôleurs liés aux routes
        ├── *Action.php      # Actions métier centralisées
        └── *Repository.php  # Couche de persistance
data/
└── database.sqlite    # Base de données SQLite (générée automatiquement)
```

### Point d'entrée

**Fichier** : `public/api/index.php`
```php
<?php
require __DIR__ . '/../../api/bootstrap.php';
```

### Cycle de vie de l'application

1. **Bootstrap** (`api/bootstrap.php`) :
   - Charge l'autoloader Composer
   - Initialise le conteneur DI
   - Crée l'application Slim avec le Bridge PHP-DI
   - Configure les routes
   - Lance l'application

2. **Container** (`api/container.php`) :
   - Retourne une factory qui construit le ContainerBuilder
   - Configure la connexion PDO à SQLite
   - Permet d'ajouter des définitions pour l'injection de dépendances

3. **Router** (`api/router.php`) :
   - Retourne une factory qui reçoit l'instance `$app`
   - Définit les routes HTTP (GET, POST, PUT, DELETE, etc.)

### Convention d'architecture

Le projet suit une architecture DDD simplifiée :

#### Contrôleurs (Controllers)
- **Rôle** : Gérer les requêtes HTTP et les réponses
- **Liaison** : Un contrôleur est directement lié à une route
- **Exemple** : 
  ```
  [GET] /resource → ResourceController->get()
  ```
- **Responsabilité** : Exécuter des actions et/ou utiliser des repositories

#### Actions
- **Rôle** : Centraliser la logique métier réutilisable
- **Usage** : Appelées par les contrôleurs pour des opérations complexes

#### Repositories
- **Rôle** : Gérer la persistance des données
- **Liaison** : Un repository par ressource/entité
- **Responsabilité** : Abstraction de la couche de données

### Organisation par domaine

Le code métier dans `api/TemplatePhpReact/` est organisé en sous-dossiers par domaine/ressource :

```
api/
└── TemplatePhpReact/
    ├── [Domain1]/
    │   ├── Domain1Controller.php
    │   ├── Domain1Action.php
    │   └── Domain1Repository.php
    ├── [Domain2]/
    │   ├── Domain2Controller.php
    │   └── Domain2Repository.php
    └── readme.md
```

### Autoloading PSR-4

Dans `composer.json` :
```json
{
  "autoload": {
    "psr-4": {
      "TemplatePhpReact\\": "api/TemplatePhpReact/"
    }
  }
}
```

Exemple d'utilisation :
- `TemplatePhpReact\User\UserController` → `api/TemplatePhpReact/User/UserController.php`
- `TemplatePhpReact\Product\ProductRepository` → `api/TemplatePhpReact/Product/ProductRepository.php`

---

## Architecture APP Frontend React

### Stack technique

- **Framework** : React 19.2.0
- **Language** : TypeScript 5.9.3
- **Build tool** : Vite 7.2.4
- **Compiler** : React Compiler activé
- **Routage** : React Router DOM

### Scripts disponibles

```bash
npm run dev      # Serveur de développement
npm run build    # Build de production
npm run lint     # Linting ESLint
npm run preview  # Prévisualisation du build
```

### Structure

```
app/
├── main.tsx         # Point d'entrée React (avec BrowserRouter)
├── App.tsx          # Composant racine (intègre le router)
├── routes.tsx       # Définition des routes React Router
├── pages/           # Pages pour chaque route
│   ├── Home.tsx     # Page d'accueil
│   └── NotFound.tsx # Page 404
├── components/      # Composants réutilisables
│   └── layouts/     # Layouts du projet
├── hooks/           # Hooks custom (hors hooks de store)
├── stores/          # Stores zustand et hooks associés
├── App.css
├── index.css
└── assets/          # Ressources statiques
```

#### Dossier components

Ce dossier contient les composants qui constituent les pages.
Le sous-dossier `components/layouts` regroupe les différents layouts du projet.

#### Dossier hooks

Ce dossier contient tous les hooks custom. Exception : les hooks associés à un store restent dans le dossier stores.

#### Dossier stores

Ce dossier contient tous les stores et hooks associés pour la gestion d'état globale de l'application frontend.
Librairie utilisée : [zustand](https://github.com/pmndrs/zustand).
Convention : un store par domaine ou ressource principale, hooks personnalisés pour accéder aux stores.

Exemple de store :

```ts
// app/stores/userStore.ts
import { create } from 'zustand';

type User = {
  id: number;
  name: string;
};

interface UserState {
  users: User[];
  addUser: (user: User) => void;
}

export const useUserStore = create<UserState>((set) => ({
  users: [],
  addUser: (user) => set((state) => ({ users: [...state.users, user] })),
}));
```

Utilisation dans un composant :

```tsx
import { useUserStore } from './stores/userStore';

function UserList() {
  const users = useUserStore((state) => state.users);
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

---

## Guide pour un agent IA

### Conventions de code à respecter

#### Frontend React

1. **Organisation des fichiers** :
   - Un composant par fichier dans `app/components/`
   - Les layouts dans `app/components/layouts/`
   - Les pages dans `app/pages/`
   - Les hooks custom dans `app/hooks/` (hors hooks de store)
   - Les stores et hooks associés dans `app/stores/`
2. **Nommage** :
   - Composants : PascalCase (ex : `UserCard.tsx`)
   - Hooks : préfixe `use` (ex : `useUserStore.ts`)
   - Stores : suffixe `Store` (ex : `userStore.ts`)
3. **Convention zustand** :
   - Un store par domaine ou ressource principale
   - Les hooks d'accès au store sont exportés depuis le même fichier
4. **Routage** :
   - Les routes sont définies dans `app/routes.tsx` et utilisent React Router DOM
5. **Styles** :
   - Fichiers CSS par composant ou global (`App.css`, `index.css`)

#### Backend PHP

1. **Namespace** : Toujours utiliser `namespace TemplatePhpReact\[Domain];`
2. **Nommage des classes** :
   - Contrôleurs : `*Controller`
   - Actions : `*Action`
   - Repositories : `*Repository`
3. **Organisation** : Créer un dossier par domaine dans `api/TemplatePhpReact/`
4. **Routes** : Définir dans `api/router.php`
5. **DI** : Configurer les dépendances dans `api/container.php`

#### Routes Slim

```php
// Dans api/router.php
return function ($app) {
    $app->get('/users', [\TemplatePhpReact\User\UserController::class, 'list']);
    $app->get('/users/{id}', [\TemplatePhpReact\User\UserController::class, 'get']);
    $app->post('/users', [\TemplatePhpReact\User\UserController::class, 'create']);
    $app->put('/users/{id}', [\TemplatePhpReact\User\UserController::class, 'update']);
    $app->delete('/users/{id}', [\TemplatePhpReact\User\UserController::class, 'delete']);
};
```

#### Exemple de contrôleur

```php
<?php
namespace TemplatePhpReact\User;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class UserController
{
    private UserRepository $repository;
    
    public function __construct(UserRepository $repository)
    {
        $this->repository = $repository;
    }
    
    public function get(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $user = $this->repository->findById($id);
        
        $response->getBody()->write(json_encode($user));
        return $response->withHeader('Content-Type', 'application/json');
    }
}
```

#### Exemple de repository

```php
<?php
namespace TemplatePhpReact\User;

class UserRepository
{
    private \PDO $pdo;
    
    public function __construct(\PDO $pdo)
    {
        $this->pdo = $pdo;
    }
    
    public function findById(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM users WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $result = $stmt->fetch();
        
        return $result ?: null;
    }
    
    public function findAll(): array
    {
        $stmt = $this->pdo->query('SELECT * FROM users');
        return $stmt->fetchAll();
    }
    
    public function create(array $data): array
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO users (name, email) VALUES (:name, :email)'
        );
        $stmt->execute($data);
        
        return array_merge(['id' => $this->pdo->lastInsertId()], $data);
    }
}
```

#### Exemple d'action

```php
<?php
namespace TemplatePhpReact\User;

class CreateUserAction
{
    private UserRepository $repository;
    
    public function __construct(UserRepository $repository)
    {
        $this->repository = $repository;
    }
    
    public function execute(array $data): array
    {
        // Validation et logique métier
        // ...
        
        return $this->repository->create($data);
    }
}
```

### Configuration du conteneur DI

```php
<?php
// Dans api/container.php
return function () {
    $containerBuilder = new \DI\ContainerBuilder();
    
    $containerBuilder->addDefinitions([
        // PDO SQLite connection
        \PDO::class => function () {
            $dbPath = __DIR__ . '/../data/database.sqlite';
            
            // Create data directory if it doesn't exist
            $dataDir = dirname($dbPath);
            if (!is_dir($dataDir)) {
                mkdir($dataDir, 0755, true);
            }
            
            $pdo = new \PDO('sqlite:' . $dbPath);
            $pdo->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
            $pdo->setAttribute(\PDO::ATTR_DEFAULT_FETCH_MODE, \PDO::FETCH_ASSOC);
            
            return $pdo;
        },
        
        // Repositories and actions with autowiring
        \TemplatePhpReact\User\UserRepository::class => \DI\autowire(),
        \TemplatePhpReact\User\CreateUserAction::class => \DI\autowire(),
    ]);
    
    return $containerBuilder->build();
};
```

### Commandes utiles

```bash
# Frontend React
npm install                         # Installer les dépendances
npm install zustand                 # Installer zustand
npm run dev                         # Lancer le serveur de développement
npm run build                       # Build de production
npm run lint                        # Linting ESLint
npm run preview                     # Prévisualisation du build

# Backend PHP
composer install                    # Installer les dépendances
composer dump-autoload              # Régénérer l'autoloader
php -S localhost:8080 -t public     # Démarrer le serveur PHP
```

### URL d'accès

- **Frontend** : http://localhost:5173 (Vite dev server)
- **API Backend** : http://localhost:8080/api (serveur PHP)

---

## Checklist pour créer une nouvelle ressource

1. ☐ Créer un dossier dans `api/TemplatePhpReact/[ResourceName]/`
2. ☐ Créer `[ResourceName]Controller.php` avec namespace `TemplatePhpReact\[ResourceName]`
3. ☐ Créer `[ResourceName]Repository.php` si besoin de persistance
4. ☐ Créer `[ResourceName]Action.php` si logique métier complexe
5. ☐ Enregistrer les routes dans `api/router.php`
6. ☐ Configurer les dépendances dans `api/container.php`
7. ☐ Tester avec un client HTTP (curl, Postman, etc.)

---

## Dépendances Composer

```json
{
  "slim/slim": "^4.15",           // Framework REST API
  "slim/http": "^1.4",            // Implémentation PSR-7
  "php-di/slim-bridge": "^3.4"    // Bridge PHP-DI pour Slim
}
```

### Dépendances indirectes importantes

- `nikic/fast-route` : Router rapide
- `psr/http-message` : Interfaces PSR-7 (Request/Response)
- `psr/container` : Interface PSR-11 (DI Container)
- `laravel/serializable-closure` : Sérialisation de closures

---

## Notes importantes

1. **Base de données SQLite** : Le projet utilise SQLite avec PDO. Le fichier de base de données est stocké dans `data/database.sqlite` et est créé automatiquement au premier lancement. PDO est injecté automatiquement dans les repositories via le conteneur DI.

2. **CORS** : Si le frontend et le backend tournent sur des ports différents, penser à configurer CORS dans Slim

3. **Error Handling** : Ajouter un middleware de gestion d'erreurs si nécessaire

4. **Validation** : Aucune bibliothèque de validation n'est installée. Considérer `respect/validation` ou `symfony/validator`

5. **Testing** : Pas de framework de test installé. Considérer PHPUnit pour les tests

---

## Exemple complet : Création d'une ressource "Product"

### 1. Structure des fichiers

```
api/TemplatePhpReact/Product/
├── ProductController.php
├── ProductRepository.php
└── CreateProductAction.php
```

### 2. ProductController.php

```php
<?php
namespace TemplatePhpReact\Product;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class ProductController
{
    private ProductRepository $repository;
    private CreateProductAction $createAction;
    
    public function __construct(
        ProductRepository $repository,
        CreateProductAction $createAction
    ) {
        $this->repository = $repository;
        $this->createAction = $createAction;
    }
    
    public function list(Request $request, Response $response): Response
    {
        $products = $this->repository->findAll();
        $response->getBody()->write(json_encode($products));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function get(Request $request, Response $response, array $args): Response
    {
        $product = $this->repository->findById((int)$args['id']);
        $response->getBody()->write(json_encode($product));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function create(Request $request, Response $response): Response
    {
        $data = json_decode($request->getBody()->getContents(), true);
        $product = $this->createAction->execute($data);
        
        $response->getBody()->write(json_encode($product));
        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus(201);
    }
}
```

### 3. ProductRepository.php

```php
<?php
namespace TemplatePhpReact\Product;

class ProductRepository
{
    private \PDO $pdo;
    
    public function __construct(\PDO $pdo)
    {
        $this->pdo = $pdo;
    }
    
    public function findAll(): array
    {
        $stmt = $this->pdo->query('SELECT * FROM products');
        return $stmt->fetchAll();
    }
    
    public function findById(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM products WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $result = $stmt->fetch();
        
        return $result ?: null;
    }
    
    public function create(array $data): array
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO products (name, price, description, created_at) '
            . 'VALUES (:name, :price, :description, :created_at)'
        );
        $stmt->execute($data);
        
        return array_merge(['id' => $this->pdo->lastInsertId()], $data);
    }
}
```

### 4. CreateProductAction.php

```php
<?php
namespace TemplatePhpReact\Product;

class CreateProductAction
{
    private ProductRepository $repository;
    
    public function __construct(ProductRepository $repository)
    {
        $this->repository = $repository;
    }
    
    public function execute(array $data): array
    {
        // Validation
        if (empty($data['name'])) {
            throw new \InvalidArgumentException('Product name is required');
        }
        
        // Logique métier
        $data['created_at'] = date('Y-m-d H:i:s');
        
        // Persistance
        return $this->repository->create($data);
    }
}
```

### 5. Mise à jour de api/router.php

```php
<?php

return function ($app) {
    // Product routes
    $app->get('/products', [\TemplatePhpReact\Product\ProductController::class, 'list']);
    $app->get('/products/{id}', [\TemplatePhpReact\Product\ProductController::class, 'get']);
    $app->post('/products', [\TemplatePhpReact\Product\ProductController::class, 'create']);
};
```

### 6. Mise à jour de api/container.php

```php
<?php

return function () {
    $containerBuilder = new \DI\ContainerBuilder();

    $containerBuilder->addDefinitions([
        // PDO is already configured in container.php
        \TemplatePhpReact\Product\ProductRepository::class => \DI\autowire(),
        \TemplatePhpReact\Product\CreateProductAction::class => \DI\autowire(),
        \TemplatePhpReact\Product\ProductController::class => \DI\autowire(),
    ]);

    return $containerBuilder->build();
};
```

---

## Points d'amélioration suggérés

1. **Migrations** : Créer un système de migrations pour gérer le schéma de la base de données
2. **Validation** : Ajouter une bibliothèque de validation
3. **Middleware** : Ajouter CORS, authentification, logging
4. **Error handling** : Middleware de gestion centralisée des erreurs
5. **Testing** : Setup PHPUnit avec tests unitaires et fonctionnels
6. **Documentation API** : OpenAPI/Swagger
7. **Environment config** : Utiliser dotenv pour la configuration

---

*Document généré le 21 décembre 2025*
