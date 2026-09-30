# Suivi de l'implémentation — Invintory

Tableau de bord du plan `docs/plan-implementation.md`. À mettre à jour à chaque fin
d'étape (ou de sous-étape) et à chaque décision prise.

Légende : ⬜ à faire · 🟨 en cours · ✅ terminé (tous les critères prouvés) · ⛔ bloqué

## Vue d'ensemble

| Étape | Intitulé | État | Branche | Commit | Bloquée par |
|---|---|---|---|---|---|
| Socle | Squelette API, PWA, doublure Docker | ✅ | `feat/socle` | edc3aae | — |
| 0 | Mise à niveau documentaire | 🟨 | — | 18720e5 (docs) | — |
| 0b | Outillage de tests | ⬜ | | | 0 |
| 1 | Schéma et migrations | ⬜ | | | 0b |
| 2 | Authentification (backend, simulé) | ⬜ | | | 1, P2, P3 |
| 3.0 | Contrat d'API | ⬜ | | | 2 |
| 3a | Emplacements | ⬜ | | | 3.0, P5 |
| 3b | Bouteilles | ⬜ | | | 3a, P1 |
| 3c | Mouvements et catégories | ⬜ | | | 3b, P6 |
| 3d | Sync, photos, export | ⬜ | | | 3c, P7, C2 |
| 4 | Composants du design system | ⬜ | | | socle |
| 5 | Fondations front (session, offline, sync) | ⬜ | | | 2, 3, 4, P3 |
| 6 | Cave, emplacements, fiche bouteille | ⬜ | | | 5 |
| 7 | Ajout de bouteilles | ⬜ | | | 6, P1, P4 |
| 8 | Repas, manques, catégories, réglages, export | ⬜ | | | 6, 7 |
| 9 | Déploiement continu et recette finale | ⬜ | | | 8, C1, P2, identifiants auth-service |

## Tests — règle et mesures

Règle : un maximum de tests, **écrits avant** l'implémentation ou le correctif, vus en
échec pour la bonne raison, puis au vert (détail : plan, « Stratégie de tests »).
Chaque étape ci-dessous porte implicitement ces cases :
- [ ] Tests de l'étape écrits et vus en échec **avant** l'implémentation
- [ ] Scénarios de fin automatisés (Playwright) quand l'étape a une interface
- [ ] `README.md` et `CHANGELOG.md` mis à jour, ce fichier de suivi aussi

| Étape | Tests PHP ajoutés | Tests front ajoutés | Tests e2e ajoutés | Couverture PHP | Couverture front |
|---|---|---|---|---|---|
| Socle | 6 | 3 | 0 | non mesurée | non mesurée |

## Critères de fin par étape

### Étape 0 — Mise à niveau documentaire
- [x] `docs/` et `CLAUDE.md` commités et poussés (18720e5)
- [x] `PROMPT.md` supprimé
- [ ] `docs/schema-mysql-cave-a-vin.md` restauré, identique à 91a8e0b
- [ ] `CLAUDE.md` corrigé (`docs/`, PHP 8.5, schéma présent)
- [ ] Branche locale `feat/socle` supprimée (après confirmation)
- [ ] `git status` propre

### Étape 0b — Outillage de tests
- [ ] Suites PHPUnit `unit` / `integration` / `http` + base MySQL de test dans Docker
- [ ] `composer test:coverage` (Xdebug local ; pcov/Xdebug dans l'image Docker)
- [ ] `@vitest/coverage-v8` (même version que `vitest`), `fake-indexeddb`, `npm run test:coverage`
- [ ] Playwright + `npm run e2e` ; vérifications du socle réécrites en e2e
- [ ] Un test volontairement faux échoue dans chaque suite, puis est retiré
- [ ] README : commandes de test

### Étape 1 — Schéma et migrations
- [ ] Base vide → migrate → 11 tables + `migration_story`
- [ ] Relance = aucune exécution
- [ ] Sans jeton / mauvais jeton → 401 enveloppe
- [ ] Test PHPUnit `information_schema` = schéma v1.0
- [ ] Qualité (lint/stan/test PHP + front, build) au vert

### Étape 2 — Authentification
- [ ] JWT : valide / expiré / mauvais `aud` / mauvais `iss` / signature falsifiée / `kid` inconnu
- [ ] Refresh nominal
- [ ] Deux refresh concurrents → un seul appel au service
- [ ] Rejeu → toutes les sessions révoquées
- [ ] Callback : chaque couple `type`/`status`, `reset_token` retiré de l'URL, `Referrer-Policy`
- [ ] Carve-out : refus testés (y compris `HEAD`) et `HEAD /health` → 200
- [ ] Route protégée sous Docker via `.htaccess` → 200
- [ ] Qualité au vert

### Étape 3 — Contrat d'API et API métier
- [ ] 3.0 `docs/contrat-api.md` rédigé **et validé par l'utilisateur**
- [ ] 3a Emplacements (CRUD, suppression non vide → hors rangement, suggestion)
- [ ] 3b Bouteilles (édition, référentiels, référence, recherche, DLC)
- [ ] 3c Mouvements et catégories (entrée/masse, déplacement, sortie, horloge logique, catégories, repas, manques)
- [ ] 3d Sync, photos, export
- [ ] Test d'isolation : B → 404 sur chaque ressource de A, chaque route
- [ ] Même lot `/sync` ×2 → aucun doublon
- [ ] Conflit deux appareils → état = mouvement le plus récent, deux mouvements en historique
- [ ] Export ouvert et vérifié
- [ ] Qualité au vert

### Étape 4 — Composants du design system
- [ ] Button, Badge/Pastille, BottleCard, ShelfGrid, Field, SegmentedControl, BottomNav, Banner, Sheet, icônes
- [ ] Un test par composant (ARIA, états, clavier)
- [ ] Catalogue absent de `dist/` (grep)
- [ ] `/catalogue` contrôlé dans Chrome, clair et sombre
- [ ] Aucune couleur/police en dur hors `app/design/` (grep)
- [ ] Cibles ≥ 44 px, textes conformes au guide de style
- [ ] Qualité au vert

### Étape 5 — Fondations front
- [ ] Écrans connexion, inscription, oubli, nouveau mot de passe, retours callback
- [ ] Client API (refresh unique côté client)
- [ ] Dexie : cache de lecture, file de mutations versionnée, photos en Blob
- [ ] Tests Vitest : migrations de file, idempotence, refresh unique, reprise
- [ ] Scénario Chrome hors ligne → retour réseau → mutation envoyée une fois
- [ ] Qualité au vert

### Étape 6 — Cave, emplacements, fiche bouteille
- [ ] Scénarios Chrome en ligne **et** hors ligne (armoire, déplacement, sortie, suppression non vide, recherche par référence)
- [ ] Tests Vitest des écrans clés
- [ ] Qualité au vert

### Étape 7 — Ajout de bouteilles
- [ ] Ajout en masse ×6 hors ligne avec photo → 6 références, 6 photos + miniatures
- [ ] Blocage de capacité vérifié
- [ ] Tests Vitest (formulaire, compression)
- [ ] Qualité au vert

### Étape 8 — Repas, manques, catégories, réglages, export
- [ ] Catégorie sous seuil → pastille + écran Manques
- [ ] Durée de garde modifiée → DLC et tri mis à jour
- [ ] Export téléchargé et vérifié
- [ ] Qualité au vert

### Étape 9 — Déploiement continu et recette
- [ ] Commit déployé par la CI sans action manuelle
- [ ] Smoke test `GET` et `HEAD /api/health`
- [ ] Parcours Auth §5 avec les vrais identifiants
- [ ] `Authorization` vérifié en production
- [ ] Parcours complet sur les deux comptes + isolation
- [ ] Bandeau de mise à jour après un second déploiement
- [ ] Matrice de couverture entièrement prouvée

## Contradictions et points ouverts

| Id | Sujet | Bloque | Décision | Date |
|---|---|---|---|---|
| C1 | Transport de déploiement : FTP en clair (Arch, Héb) vs SFTP (Relevé 26/09) | 9 | | |
| C2 | Photos stockées : JPEG (Arch §5.2) vs WebP (Relevé) — plan : JPEG | 3d | | |
| P1 | Référence d'une bouteille créée hors ligne (générée par le serveur) | 3b, 7 | | |
| P2 | Sous-domaine de l'app et `redirect_uri` | 2, 9 | | |
| P3 | Durée de vie de l'identifiant opaque (proposé : 30 j glissants) | 2, 5 | | |
| P4 | Brouillon de saisie persisté en continu | 7 | | |
| P5 | Capacité réduite sous l'occupation actuelle | 3a | | |
| P6 | Seuil générique : compte-t-il les bouteilles d'une catégorie spécifique ? | 3c | | |
| P7 | Emplacements et catégories en ligne uniquement ? | 3d, 5 | | |
| P8 | Rotation des journaux (fichier unique ou par jour) | 2 | | |
| P9 | Même compte OVH qu'auth-service ? | 9 | | |
| P10 | Version MySQL 8.0.x exacte (CHECK ≥ 8.0.16) | 1 | Pas de CHECK en attendant | |
| P11 | Sauvegarde MySQL automatique OVH | 9 | | |
| P12 | Icônes PWA à fournir | 5 | | |
| P13 | Identifiants auth-service (`client_id`, `client_secret`) demandés à l'exploitant | 9 | | |

Décisions déjà actées :
- auth-service simulé en développement, test réel en recette (écart assumé à Arch §6.6).
- Composants : tests Testing Library + `/catalogue` en dev uniquement.
- ShelfGrid : occupation par compte, sans position d'alvéole (le schéma n'en a pas).
- Mot de passe : via le flux de réinitialisation d'auth-service (seul flux disponible).
- Tests d'abord et en maximum (2026-09-30) : tests écrits et vus en échec avant toute
  implémentation ou correctif ; scénarios de fin automatisés en Playwright.

## Journal

| Date | Étape | Événement |
|---|---|---|
| 2026-09-30 | Socle | Livré, fusionné dans `main` (edc3aae), poussé |
| 2026-09-30 | 0 | `docs/` et `CLAUDE.md` commités et poussés (18720e5) ; `PROMPT.md` supprimé |
| 2026-09-30 | — | Plan v2 revérifié contre la documentation, enregistré dans `docs/` |
| 2026-09-30 | — | Règle « tests d'abord, un maximum » ajoutée ; nouvelle étape 0b (outillage de tests) |
| 2026-09-30 | — | Règle « README et CHANGELOG à jour à chaque étape » ; README et CHANGELOG remis à jour |
