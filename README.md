# Template PHP React

Template d'application full-stack moderne combinant React et PHP.

## 🚀 Stack technique

### Frontend
- **React** 19.2.0 avec TypeScript
- **Vite** 7.2.4 (build tool)
- **React Router** pour le routing
- **Zustand** pour la gestion d'état

### Backend
- **PHP** avec Slim Framework 4.15
- **PHP-DI** pour l'injection de dépendances
- **SQLite** avec PDO
- Architecture REST API

## 📋 Prérequis

- **Node.js** 18+ et npm
- **PHP** 8.1+
- **Composer**

## 🔧 Installation

1. **Cloner le projet**
   ```bash
   git clone <repository-url>
   cd template-php-react
   ```

2. **Installer les dépendances Frontend**
   ```bash
   npm install
   ```

3. **Installer les dépendances Backend**
   ```bash
   composer install
   ```

## ⚡ Démarrage

### Démarrer le serveur de développement Frontend
```bash
npm run dev
```
Accès: http://localhost:5173

### Démarrer le serveur API Backend
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

## 📚 Documentation

Pour plus de détails sur l'architecture et les conventions, consultez [AI_CONTEXT.md](AI_CONTEXT.md).

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