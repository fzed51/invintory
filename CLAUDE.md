# CLAUDE.md — Invintory (cave à vin)

Application personnelle de gestion de cave à vin. PWA offline-first + API REST PHP,
déployée sur hébergement mutualisé OVH. Deux utilisateurs, isolation stricte (un compte =
une cave, aucun partage).

## Documentation de référence (source de vérité)

Lire le document concerné **avant** de coder une fonctionnalité. En cas de contradiction
entre le code et ces documents, s'arrêter et signaler — ne pas trancher seul.

| Sujet | Fichier |
|---|---|
| Périmètre fonctionnel | `DOCS/cahier-des-charges-fonctionnel-cave-a-vin.md` |
| Architecture technique (décisions tranchées) | `DOCS/architecture-technique-cave-a-vin.md` |
| Design system | `DOCS/design-systeme-invintory.md`, `DOCS/invintory-design-system/invintory-design/` |
| Intégration auth-service | `DOCS/ressources/auth-service-integration.md` |
| Hébergement OVH, CD, doublure Docker | `DOCS/ressources/hebergement-mutualise-et-doublure-docker.md` |
| Contraintes PHP sur mutualisé OVH | `DOCS/ressources/rapport-php-mutualise-ovh.md` |

`schema-mysql-cave-a-vin.md` est cité par l'architecture mais absent du dépôt : ne pas
inventer le schéma, demander.

## Stack

- **Frontend** (`app/`) : React + TypeScript + Vite, `vite-plugin-pwa` en mode `prompt`
  (+ `registration.update()` périodique), Dexie.js (IndexedDB) pour l'offline.
- **Backend** (`api/`) : PHP 8.2+, Slim + PHP-DI (`php-di/slim-bridge`), PDO MySQL,
  `fzed51/migration` v3.
- **Structure** : reprise de `fzed51/template-php-react` (dossiers uniquement, pas SQLite).
  `api/` et `dist/` doivent rester **frères** au déploiement.
- **Design** : importer `tokens.css`, `components.css`, `wine-types.ts` et les polices
  fournies tels quels ; ne pas redéfinir couleurs/typos en dur.

## Règles non négociables

- Toute requête SQL filtre par `user_id` (via la classe de base Repository).
- Couches : Contrôleur (HTTP uniquement) → Action (métier, PHP pur) → Repository.
- JWT : vérifier signature **+ `aud` + `iss`**. Refresh_token uniquement côté serveur
  (`user_sessions`), rotation sérialisée par verrou.
- Correctif `Authorization` CGI/FastCGI dès le départ (`.htaccess` + repli
  `REDIRECT_HTTP_AUTHORIZATION` dans le front controller).
- Erreurs API : enveloppe `{"error": {"code": "...", "message": "..."}}`.
- Migrations : **une instruction SQL par fichier**, strictement additives.
- Mutations offline : `client_ref` (UUID) + `schemaVersion` sur chaque entrée de file.
- Aucun secret versionné ; `.env` hors webroot.
- Pas de CRON, pas de processus long, pas de WebSocket.

## Façon de travailler

- Faire **uniquement** ce qui est demandé, en une passe ; pas d'extension de périmètre
  ni de refactor non sollicité.
- Réponses et résumés courts. Code, noms de domaine et commentaires en français
  (cohérent avec la doc : `bouteilles`, `etageres`, `CreerBouteilleAction`...).
- Tests d'abord, et un maximum : écrire le test avant l'implémentation ou le correctif,
  le voir échouer pour la bonne raison, puis le faire passer. Un correctif commence par
  un test qui reproduit le défaut.
- Avant de terminer une tâche : `lint`, analyse statique et tests passent ; `README.md`,
  `CHANGELOG.md` et `docs/suivi-implementation.md` sont à jour.
- Plan et avancement : `docs/plan-implementation.md`, `docs/suivi-implementation.md`.
- Point ouvert ou ambiguïté bloquante (cf. §8 de l'architecture) → poser la question
  plutôt que supposer.
