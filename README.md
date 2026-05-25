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
│   └── TemplatePhpReact/  # Code métier organisé par domaine
└── public/                # Fichiers publics
    └── api/
        └── index.php      # Point d'entrée API
```

## 🛠️ Scripts disponibles

### Frontend
- `npm run dev` - Serveur de développement
- `npm run build` - Build de production
- `npm run lint` - Linting ESLint
- `npm run preview` - Prévisualiser le build

### Backend
- `composer dump-autoload` - Régénérer l'autoloader

## 📝 Licence

MIT 