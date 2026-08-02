# Invintory - Cave à vin PWA

Application web (PWA) pour gérer une cave à vin, y compris hors connexion.

## 🚀 Stack technique

### Frontend
- **React** 19.2.0 avec TypeScript
- **Vite** 7.2.4
- **React Router**

### Backend
- **PHP** avec Slim Framework 4
- **PHP-DI** pour l'injection de dépendances

## ✅ Fonctionnalités métier implémentées

- Gestion des armoires à vin
- Enregistrement des bouteilles (dans une armoire)
- Enregistrement des cartons (hors armoire)
- Présentation des vins disponibles (stock total)
- Gestion du millésime :
  - millésime explicite s'il est saisi
  - sinon fallback automatique au **mois/année d'enregistrement**
- Persistance locale (localStorage) pour fonctionnement hors connexion
- Synchronisation automatique de la cave avec l'API quand la connexion est disponible (dont retour en ligne)
- Manifest + service worker pour usage PWA

## 📋 Prérequis

- **Node.js** 20+ avec [Corepack](https://nodejs.org/api/corepack.html) activé (`corepack enable`)
- **PHP** 8.1+ avec les extensions `pdo_sqlite`, `gd` et `sodium`
- **Composer**

Le gestionnaire de paquets est **Yarn 4**, épinglé par le champ `packageManager`
de `package.json` : Corepack installe la bonne version automatiquement.

## 🔧 Installation

1. **Cloner le projet**
2. **Installer les dépendances Frontend**
   ```bash
   yarn install
   ```

3. **Installer les dépendances Backend**
   ```bash
   composer install
   ```

## ⚡ Démarrage

### Démarrer le frontend
```bash
yarn dev
```
Accès: http://localhost:5173

### Démarrer l'API backend (Slim)
```bash
php -S localhost:8080 -t public public/router.php
```
Accès: http://localhost:8080/api

> Le script `public/router.php` est optionnel : `php -S localhost:8080 -t public`
> suffit, le serveur intégré de PHP remontant le chemin jusqu'à
> `public/api/index.php`. Le passer rend simplement le routage explicite.

## 📁 Structure du projet

```
├── app/                    # Code source React
│   ├── components/         # Composants réutilisables
│   ├── pages/             # Pages de l'application
│   ├── hooks/             # Hooks personnalisés
│   └── stores/            # Stores Zustand
├── api/                   # Code source PHP
│   ├── bootstrap.php      # Point d'entrée de l'API
│   ├── container.php      # Configuration DI
│   ├── router.php         # Définition des routes
│   └── Invintory/  # Code métier organisé par domaine
└── public/                # Fichiers publics
    └── api/
        └── index.php      # Point d'entrée API
```

## 🛠️ Scripts disponibles

### Frontend
- `yarn dev` - Serveur de développement
- `yarn build` - Build de production
- `yarn lint` - Linting et formatage Biome
- `yarn preview` - Prévisualiser le build

### API (documentation OpenAPI)
- `yarn api:check` - Vérifie que `openapi.yaml` correspond aux routes de `api/router.php`
- `yarn api:lint` - Valide la spécification
- `yarn api:docs` - Régénère `public/openapi.html` (non versionné)

Un `docker compose up` régénère la documentation au démarrage et la sert sur
**http://localhost:5173/openapi.html**.

## 🐳 Les deux modes Docker

### Développement — deux serveurs

```bash
docker compose up
```

Vite sur **5173** avec rechargement à chaud, API PHP sur **8080**, Vite
relayant `/api` vers l'API. C'est le mode de travail au quotidien.

### Mono-serveur — un seul port

```bash
cp .env.sample .env        # puis y renseigner JWT_SECRET
docker compose -f docker-compose.preview.yml up --build
```

Un unique conteneur sert le front construit sur **http://localhost/** et l'API
sur **http://localhost/api**. Utile pour vérifier le build tel qu'il sera
servi : bundles minifiés, service worker, routes React Router au rechargement
direct.

Les deux modes n'ont aucun port en commun et peuvent tourner en parallèle.

> `php -S` est le serveur intégré de PHP, mono-thread et explicitement non
> destiné à la production. Ce mode sert à valider un build, pas à exposer le
> service : un déploiement réel demande nginx ou Apache avec PHP-FPM devant.

### Backend
- `composer dump-autoload` - Régénérer l'autoloader

## 🔐 Authentification

- Les endpoints `POST /api/auth/register` et `POST /api/auth/login` renvoient un **JWT** signé.
- Durée de vie du JWT : **1 heure** (`exp`), sans refresh token.
- Endpoint sécurisé : `GET /api/auth/me` (header Authorization avec un bearer JWT).
- Endpoints sécurisés de cave : `GET /api/cellar` et `PUT /api/cellar` (JWT requis).
- Secret de signature configurable via la variable d'environnement `JWT_SECRET` (valeur de développement par défaut si absente).
- La génération/validation JWT backend s'appuie sur la librairie externe `lcobucci/jwt`.

## 🖼️ Illustrations bouteilles/cartons

- Upload temporaire sécurisé : `POST /api/images/temp` (multipart, champ `image`, JWT requis).
- Les images de bouteilles sont standardisées côté backend via GD2 en `512x1024`, exportées en `JPEG` qualité `85`, avec bandes noires latérales si nécessaire ou recadrage centré horizontalement.
- Lecture d'une image via route sécurisée passe-plat : `GET /api/images/{imageId}` (JWT requis).
- La bascule temporaire → finale est gérée en interne par le backend lors de l'accès sécurisé à l'image, avec nettoyage des autres images temporaires utilisateur.
- Les fichiers image sont stockés côté serveur dans `data/images/` (à la racine du dépôt, répertoire ignoré par git) et ne sont pas exposés en accès statique public.
- Dans le front, les champs illustration utilisent `accept="image/*"` et `capture="environment"` pour faciliter l'usage de la caméra.

## 📝 Licence

MIT 