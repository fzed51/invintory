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
- Manifest + service worker pour usage PWA

## 📋 Prérequis

- **Node.js** 18+ et npm
- **PHP** 8.1+
- **Composer**

## 🔧 Installation

1. **Cloner le projet**
2. **Installer les dépendances Frontend**
   ```bash
   npm install
   ```

3. **Installer les dépendances Backend**
   ```bash
   composer install
   ```

## ⚡ Démarrage

### Démarrer le frontend
```bash
npm run dev
```
Accès: http://localhost:5173

### Démarrer l'API backend (Slim)
```bash
php -S localhost:8080 -t public
```
Accès: http://localhost:8080/api

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
- `npm run dev` - Serveur de développement
- `npm run build` - Build de production
- `npm run lint` - Linting et formatage Biome
- `npm run preview` - Prévisualiser le build

### Backend
- `composer dump-autoload` - Régénérer l'autoloader

## 🔐 Authentification

- Les endpoints `POST /api/auth/register` et `POST /api/auth/login` renvoient un **JWT** signé.
- Durée de vie du JWT : **1 heure** (`exp`), sans refresh token.
- Endpoint sécurisé : `GET /api/auth/me` (header Authorization avec un bearer JWT).
- Secret de signature configurable via la variable d'environnement `JWT_SECRET` (valeur de développement par défaut si absente).
- La génération/validation JWT backend s'appuie sur la librairie externe `lcobucci/jwt`.

## 🖼️ Illustrations bouteilles/cartons

- Upload temporaire sécurisé : `POST /api/images/temp` (multipart, champ `image`, JWT requis).
- Les images de bouteilles sont standardisées côté backend via GD2 en `512x1024`, exportées en `JPEG` qualité `85`, avec bandes noires latérales si nécessaire ou recadrage centré horizontalement.
- Lecture d'une image via route sécurisée passe-plat : `GET /api/images/{imageId}` (JWT requis).
- La bascule temporaire → finale est gérée en interne par le backend lors de l'accès sécurisé à l'image, avec nettoyage des autres images temporaires utilisateur.
- Les fichiers image sont stockés côté serveur dans `api/data/images` et ne sont pas exposés en accès statique public.
- Dans le front, les champs illustration utilisent `accept="image/*"` et `capture="environment"` pour faciliter l'usage de la caméra.

## 📝 Licence

MIT 