# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Invintory** — offline-capable PWA for managing a wine cellar (cabinets, bottles, cartons). React 19 + TypeScript SPA on the front, PHP/Slim 4 REST API on the back, SQLite for persistence. UI text and most commit messages are in French.

`AI_CONTEXT.md` is a complementary (French) design document inherited from the `template-php-react` starter this repo was forked from; some of it describes the template rather than the current code.

## Commands

```bash
# Frontend
yarn install
yarn dev        # Vite dev server on :5173, proxies /api -> API_TARGET (default http://localhost:8080)
yarn build      # tsc -b && vite build
yarn lint       # biome check .  (lint + format check; add --write to fix)
yarn preview

# Backend
composer install
php -S localhost:8080 -t public public/router.php   # router script optional — see below

# Both, containerised
docker compose up   # api :8080, app :5173; runs composer install / yarn install --immutable on start
```

`public/router.php` dispatches `/api/*` to Slim and returns `false` for everything else so the built-in server handles it as a static file. **It is optional, not required** — verified empirically: `php -S localhost:8080 -t public` alone serves the API correctly, because PHP's built-in server walks the request path until it finds a PHP file, lands on `public/api/index.php`, and passes the remainder as `PATH_INFO` (`SCRIPT_NAME=/api/index.php`, `PATH_INFO=/auth/login`), which Slim routes from. The router script just makes that dispatch explicit instead of leaning on the fallback; `docker/api/Dockerfile` uses it.

There is **no test framework** in this project — neither PHPUnit nor a JS test runner is installed. Verify changes by running the app.

**Package manager: Yarn 4 everywhere — do not use npm.** `"packageManager": "yarn@4.18.0"` in `package.json` is enforced by Corepack, `yarn.lock` is Yarn 4 format, and there is no `package-lock.json`. `docker/app/Dockerfile` enables Corepack, bakes the pinned Yarn in at build time (`corepack install`) and starts with `yarn install --immutable`, so the container and the host resolve from the same lockfile.

`.yarnrc.yml` sets `nodeLinker: node-modules` — Yarn 4 would otherwise use Plug'n'Play, which breaks `node_modules/.bin` resolution and the Docker `node_modules` volume. It deliberately omits the `npmMinimalAgeGate: 0` / `approvedGitRepositories: "**"` keys Yarn writes by default; they weaken supply-chain checks and nothing here needs them.

`yarn install` warns that esbuild's build scripts are disabled. That is expected and harmless — esbuild ships its platform binary as an optional dependency, so `vite build` works without running them. Do not "fix" it by setting `enableScripts: true`.

## `openapi.yaml` is part of the API contract — keep it in sync

`openapi.yaml` (repo root) documents every route. **It is maintained by hand and nothing enforces it at build time, so it silently rots unless you update it in the same change as the code.** Treat it as part of the diff whenever you touch:

- `api/router.php` — a route added, removed, renamed, or its method changed
- a controller's status codes, error messages, or response shape
- a request body or query/path parameter
- whether a route carries `->add(JwtAuthMiddleware::class)` (this flips `security` in the spec)
- a shared shape already described under `components.schemas` (`Cellar`, `Bottle`, `Carton`, …)

Then verify — the spec must both be valid *and* actually match the router:

```bash
yarn api:check         # spec vs api/router.php: same routes, same JWT protection (exits 1 on drift)
yarn api:lint          # @redocly/cli lint: spec validity, unresolved $refs
yarn api:docs          # regenerates the browsable HTML into docs/ (gitignored)
```

**`api:check` is the one that catches rot** (`scripts/check-openapi-routes.mjs`): it parses `api/router.php` and diffs it against the spec, reporting routes missing on either side and any route whose JWT protection disagrees. `api:lint` only judges the spec in isolation — it happily passes a spec that documents routes that no longer exist. Paths in the spec omit the `/api` prefix, matching `router.php` (see `setBasePath` below).

All three pull `@redocly/cli` through `yarn dlx` on demand rather than as a dependency, so the first run needs network and the lockfile stays untouched.

Do not commit generated HTML — `/docs/*.html` is gitignored and rebuilt from the spec. What `api:docs` emits is *not* self-contained (Redoc and its fonts load from a CDN), so it is for local reading, not for publishing to a strict-CSP host.

## Backend architecture (`api/`)

- **PSR-4 namespace is `Invintory\` → `api/Invintory/`** (renamed from the starter's `TemplatePhpReact\`; the composer/npm *package* names still read `fzed51/template-php-react`).
- `public/api/index.php` → `api/bootstrap.php` → builds the PHP-DI container, creates Slim via `DI\Bridge\Slim\Bridge`, calls `setBasePath('/api')`, applies `api/router.php`.
- **Because of `setBasePath('/api')`, routes in `api/router.php` are declared without the `/api` prefix** (`$app->post('/auth/login', ...)` serves `POST /api/auth/login`).
- Layering per domain folder (`api/Invintory/<Domain>/`) — currently `User`, `Image`, `Cellar`: `*Controller` is bound 1:1 to routes and handles HTTP; `*Action` holds business logic; `*Repository` owns persistence (raw PDO, prepared statements). Not every domain needs all three — `Cellar` has no action.
- Controllers extend `Invintory\AbstractController` (at the namespace root, not in a domain folder) for `jsonResponse()`, `jsonError()`, `getUserId()` and `getJsonBody()`. Prefer these over hand-rolling responses, so the `{"error": …}` shape stays uniform.
- **php-di/slim-bridge injects route placeholders by name, not as a positional `array $args`.** A route `/images/{imageId}` means the method signature takes `string $imageId`; declaring `array $args` throws `NotEnoughParametersException` at request time.
- **Every new class must be registered explicitly in `api/container.php`** — the container lists each repository/action/controller with `\DI\autowire()`. Follow that convention rather than relying on implicit autowiring.
- **The database schema lives inline in the `\PDO::class` factory in `api/container.php`** as `CREATE TABLE IF NOT EXISTS` statements executed on every boot. There is no migration system — schema changes go there, and altering an existing column requires handling already-created SQLite files yourself.
- SQLite file: `data/database.sqlite`; uploaded images: `data/images/{tmp,final}/`. Both are created on demand and the whole `/data/` directory is gitignored. Note the paths resolve to the **repo root**, not under `api/`, despite the `__DIR__` traversal starting in `api/Invintory/<Domain>/`.
- CORS is a closure middleware at the top of `api/router.php` (`Allow-Origin: *`).

### Auth

- `JwtService` (lcobucci/jwt, HS256, 1h TTL, no refresh) signs with `JWT_SECRET` from the environment, falling back to a hardcoded dev secret in `api/container.php`. Copy `.env.sample` when needed.
- Protection is **per-route**, not global: `->add(\Invintory\User\JwtAuthMiddleware::class)`. The middleware re-checks the user exists in DB and sets the `authUser` request attribute (`['id', 'email']`) — controllers read it via `$request->getAttribute('authUser')`.
- `users.token` and `UserRepository::findByToken()` are remnants of a pre-JWT session scheme; JWTs are stateless and this column is not part of validation.

### Images

`POST /api/images/temp` normalises any upload through GD2 to 512×1024 JPEG q85 (letterboxed with black bars, or centre-cropped horizontally) and stores it as **temporary** in `data/images/tmp/`.

The temp → final promotion is implicit: it happens inside `StreamImageAction` on the first authenticated `GET /api/images/{imageId}`, which moves the file to `data/images/final/` and — in the same transaction — **deletes all the user's other temporary images**. Nothing is served statically; reads always go through the JWT-protected passthrough route.

### Cellar

One row per user in the `cellars` table, holding the whole cellar as an opaque JSON blob (`payload`) plus an `updatedAt`. `PUT /api/cellar` is a **full replace** (`INSERT … ON CONFLICT DO UPDATE`), never a merge.

The backend keeps only the `cabinets`/`bottles`/`cartons` keys and checks only that each is an array — item contents are stored unvalidated. So the `Bottle`/`Carton` shapes in `openapi.yaml` describe what the frontend produces, not a contract the API enforces; changing them is a frontend-side decision that still belongs in the spec.

## Frontend architecture (`app/`)

- `main.tsx` (BrowserRouter + service worker registration) → `App.tsx` (`useRoutes` inside `DefaultLayout`) → `routes.tsx`.
- Route guards are components, not loaders: `ProtectedRoute` (renders `<Login/>` in place when unauthenticated or the JWT is expired) and `PublicOnlyRoute`. Routes are lazy-loaded except `Login`.
- **State is split in two, deliberately inconsistent ways:**
  - Auth lives in a zustand store with `persist` (`app/stores/authStore.ts`, localStorage key `invintory-auth`). JWT expiry is checked client-side by decoding the payload (`isJwtExpired`).
  - Cellar data (cabinets/bottles/cartons) is **not** in a store — it is `useState` inside `app/pages/Home.tsx`, mirrored to localStorage under `invintory-cellar-<userId>` and synced to `GET`/`PUT /api/cellar`. Loaded values pass through `normalize*` functions so older persisted shapes keep working; extend those when adding fields.
- **Cellar sync is last-write-wins on `updatedAt`**, in `syncCellar()` (`app/pages/Home.tsx`). It runs on mount and on the `online` event: fetch the remote cellar, adopt it if its `updatedAt` is newer, otherwise push the local one. A failed request is swallowed and the local cellar kept, so the app stays usable offline. `syncInFlightRef` prevents overlapping runs. There is no field-level merge — concurrent edits on two devices lose the older side wholesale.
- API calls are inline `fetch` against relative `/api/...` paths (no client wrapper); authenticated calls set `Authorization: Bearer ${token}` manually.
- Offline: `public/sw.js` is hand-written, cache-first, falling back to `/index.html`. Bump `CACHE_NAME` when changing cached app-shell assets.

## Conventions

- **Biome** (not ESLint/Prettier) formats and lints everything: tabs, double quotes, auto-organised imports. `noExplicitAny` and `useHookAtTopLevel` are errors; `useExhaustiveDependencies` is a warning.
- TypeScript is strict with `noUnusedLocals`/`noUnusedParameters`/`erasableSyntaxOnly` — `yarn build` will fail on unused symbols.
- Frontend naming: components PascalCase, stores `*Store.ts`, pages default-export.
- Backend naming: `*Controller`, `*Action`, `*Repository`, one folder per domain; PHP error responses are `{"error": "message"}` JSON with the message in French.
- History is PR-based (`… (#N)`) with mostly conventional-commit prefixes, in French or English.
