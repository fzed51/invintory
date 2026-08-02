# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Invintory** — offline-capable PWA for managing a wine cellar (cabinets, bottles, cartons). React 19 + TypeScript SPA on the front, PHP/Slim 4 REST API on the back, SQLite for persistence. UI text and most commit messages are in French.

`AI_CONTEXT.md` is a complementary (French) design document inherited from the `template-php-react` starter this repo was forked from; some of it describes the template rather than the current code.

## Commands

```bash
# Frontend
npm install
npm run dev        # Vite dev server on :5173, proxies /api -> API_TARGET (default http://localhost:8080)
npm run build      # tsc -b && vite build
npm run lint       # biome check .  (lint + format check; add --write to fix)
npm run preview

# Backend
composer install
php -S localhost:8080 -t public public/router.php   # router.php is REQUIRED (see below)

# Both, containerised
docker compose up   # api :8080, app :5173; runs composer install / npm install on start
```

`public/router.php` dispatches `/api/*` to Slim and lets everything else fall through to static files. Starting the built-in server without it (as `README.md` suggests) makes every API route 404.

There is **no test framework** in this project — neither PHPUnit nor a JS test runner is installed. Verify changes by running the app.

Both `package-lock.json` and `yarn.lock` are committed; the Docker image and the documented workflow use **npm**.

## Backend architecture (`api/`)

- **PSR-4 namespace is `Invintory\` → `api/Invintory/`** (renamed from the starter's `TemplatePhpReact\`; the composer/npm *package* names still read `fzed51/template-php-react`).
- `public/api/index.php` → `api/bootstrap.php` → builds the PHP-DI container, creates Slim via `DI\Bridge\Slim\Bridge`, calls `setBasePath('/api')`, applies `api/router.php`.
- **Because of `setBasePath('/api')`, routes in `api/router.php` are declared without the `/api` prefix** (`$app->post('/auth/login', ...)` serves `POST /api/auth/login`).
- Layering per domain folder (`api/Invintory/<Domain>/`): `*Controller` is bound 1:1 to routes and handles HTTP; `*Action` holds business logic; `*Repository` owns persistence (raw PDO, prepared statements).
- **Every new class must be registered explicitly in `api/container.php`** — the container lists each repository/action/controller with `\DI\autowire()`. Follow that convention rather than relying on implicit autowiring.
- **The database schema lives inline in the `\PDO::class` factory in `api/container.php`** as `CREATE TABLE IF NOT EXISTS` statements executed on every boot. There is no migration system — schema changes go there, and altering an existing column requires handling already-created SQLite files yourself.
- SQLite file: `data/database.sqlite`; uploaded images: `data/images/{tmp,final}/`. Both are created on demand and the whole `/data/` directory is gitignored. (`README.md` says `api/data/images` — the actual path resolves to the repo-root `data/`.)
- CORS is a closure middleware at the top of `api/router.php` (`Allow-Origin: *`).

### Auth

- `JwtService` (lcobucci/jwt, HS256, 1h TTL, no refresh) signs with `JWT_SECRET` from the environment, falling back to a hardcoded dev secret in `api/container.php`. Copy `.env.sample` when needed.
- Protection is **per-route**, not global: `->add(\Invintory\User\JwtAuthMiddleware::class)`. The middleware re-checks the user exists in DB and sets the `authUser` request attribute (`['id', 'email']`) — controllers read it via `$request->getAttribute('authUser')`.
- `users.token` and `UserRepository::findByToken()` are remnants of a pre-JWT session scheme; JWTs are stateless and this column is not part of validation.

### Images

`POST /api/images/temp` normalises any upload through GD2 to 512×1024 JPEG q85 (letterboxed with black bars, or centre-cropped horizontally) and stores it as **temporary** in `data/images/tmp/`.

The temp → final promotion is implicit: it happens inside `StreamImageAction` on the first authenticated `GET /api/images/{imageId}`, which moves the file to `data/images/final/` and — in the same transaction — **deletes all the user's other temporary images**. Nothing is served statically; reads always go through the JWT-protected passthrough route.

## Frontend architecture (`app/`)

- `main.tsx` (BrowserRouter + service worker registration) → `App.tsx` (`useRoutes` inside `DefaultLayout`) → `routes.tsx`.
- Route guards are components, not loaders: `ProtectedRoute` (renders `<Login/>` in place when unauthenticated or the JWT is expired) and `PublicOnlyRoute`. Routes are lazy-loaded except `Login`.
- **State is split in two, deliberately inconsistent ways:**
  - Auth lives in a zustand store with `persist` (`app/stores/authStore.ts`, localStorage key `invintory-auth`). JWT expiry is checked client-side by decoding the payload (`isJwtExpired`).
  - Cellar data (cabinets/bottles/cartons) is **not** in a store — it is `useState` inside `app/pages/Home.tsx`, read/written directly to localStorage under `invintory-cellar-<userId>`. Loaded values pass through `normalize*` functions so older persisted shapes keep working; extend those when adding fields.
- API calls are inline `fetch` against relative `/api/...` paths (no client wrapper); authenticated calls set `Authorization: Bearer ${token}` manually.
- Offline: `public/sw.js` is hand-written, cache-first, falling back to `/index.html`. Bump `CACHE_NAME` when changing cached app-shell assets.

## Conventions

- **Biome** (not ESLint/Prettier) formats and lints everything: tabs, double quotes, auto-organised imports. `noExplicitAny` and `useHookAtTopLevel` are errors; `useExhaustiveDependencies` is a warning.
- TypeScript is strict with `noUnusedLocals`/`noUnusedParameters`/`erasableSyntaxOnly` — `npm run build` will fail on unused symbols.
- Frontend naming: components PascalCase, stores `*Store.ts`, pages default-export.
- Backend naming: `*Controller`, `*Action`, `*Repository`, one folder per domain; PHP error responses are `{"error": "message"}` JSON with the message in French.
- History is PR-based (`… (#N)`) with mostly conventional-commit prefixes, in French or English.
