# Cahier des Charges Fonctionnel — Gestion de Cave à Vin

**Version 1.0**

---

## 1. Contexte et objectifs

Application personnelle de gestion de cave à vin, permettant de suivre les bouteilles achetées ou reçues en cadeau, stockées dans des armoires (étagères) ou des cartons.

**Objectifs fonctionnels** :
1. Avoir une vue claire de la cave pour savoir quel vin est disponible pour un repas
2. Simplifier au maximum les entrées et sorties de bouteilles
3. Identifier automatiquement les types de vin manquants pour orienter les achats

**Usage** : application mobile (PWA), utilisée par deux personnes distinctes, chacune avec son propre compte et sa propre cave (pas de partage de données entre comptes).

---

## 2. Modèle fonctionnel

### 2.1 Entités de stockage

| Entité | Description |
|---|---|
| **Armoire** | Meuble de rangement. Possède un nom et une liste d'Étagères. |
| **Étagère** | Appartient à une Armoire. Capacité définie en nombre d'alvéoles (1 bouteille par alvéole). |
| **Carton** | Contenant indépendant, hors armoire. Capacité définie en nombre de bouteilles. |
| **Hors rangement** | Emplacement transitoire unique et générique, sans capacité. Représente une bouteille physiquement sortie de son rangement (ex : posée pour un repas) mais pas encore définitivement sortie du système. |

Un **Emplacement** est une Étagère (rattachée à une Armoire), un Carton, ou la zone "Hors rangement".

**Règle de capacité** : la capacité d'une Étagère ou d'un Carton est **bloquante** — l'application refuse l'ajout d'une bouteille au-delà de la capacité définie et alerte l'utilisateur. La zone "Hors rangement" n'a pas de capacité.

### 2.2 Bouteille

| Attribut | Détail |
|---|---|
| Référence | Code court généré automatiquement (voir §2.3) |
| Type | Liste fixe : rouge, blanc, rosé, effervescent, doux, autre |
| Région / Appellation | Liste évolutive avec autocomplétion (créée à la volée si nouvelle valeur) |
| Cépage | Liste évolutive avec autocomplétion (idem) |
| Domaine | Texte libre |
| Millésime | Année (optionnel — certains vins, notamment effervescents, sont non millésimés) |
| Date d'entrée | Année + mois. Valeur par défaut = date de création de la fiche (mouvement d'Entrée), modifiable manuellement (utile notamment lors de l'import initial pour indiquer une date d'acquisition antérieure à la saisie dans l'app) |
| Photo | Image jointe |
| Origine | Achetée / Offerte |
| Note libre | Texte (ex : "offert par...", "réservé pour...", "acheté à...") |
| Tag souvenir | Booléen — bouteille conservée sans intention de consommation programmée |
| Emplacement | Étagère, Carton, ou "Hors rangement" (actuel) |
| Statut | En cave / Sortie |
| Date limite de consommation *(calculée)* | Millésime + durée de garde de la Catégorie correspondante (ou Date d'entrée + durée de garde, si pas de millésime) — voir §2.5 |

### 2.3 Référence bouteille

Code alphanumérique court, généré automatiquement à la création de la fiche, destiné à être recopié à la main sur l'étiquette de la bouteille.

**Format** :
- 1er caractère : lettre `a-z` (hors `o`, `i`)
- Caractères suivants : `0-9` et `a-z` (hors `o`, `i`) — exclusion pour éviter les confusions manuscrites (o/0, i/1/l)
- Génération séquentielle, longueur variable : démarre à 2 caractères, s'incrémente automatiquement (3, puis 4...) une fois l'espace de codes de la longueur courante épuisé

Un champ de recherche dédié permet de retrouver instantanément une fiche bouteille en saisissant son code (pas de scan caméra — la fiabilité d'une reconnaissance optique sur du texte manuscrit étant jugée insuffisante).

### 2.4 Mouvement

| Type | Déclencheur | Effet |
|---|---|---|
| **Entrée** | Une bouteille rejoint la cave pour la première fois (achat ou cadeau) | Crée la/les Bouteille(s), statut "en cave" |
| **Sortie** | Un motif définitif est confirmé : consommée, offerte, ou perdue/cassée | Motif obligatoire, statut passe à "sortie", libère l'alvéole d'origine — **opération irréversible, seule sortie possible du système** |
| **Déplacement** | Changement de position d'une bouteille qui reste "en cave" (rangement différent, ou sortie physique temporaire type repas) | Met à jour l'emplacement (y compris vers/depuis "Hors rangement"), sans créer d'Entrée ni de Sortie, sans impact sur le stock ni l'historique de consommation |

**Point clé** : il n'existe pas de symétrie Entrée/Sortie pour une bouteille qui quitte physiquement son étagère sans être consommée (ex : sortie pour un repas). Tant qu'aucun motif définitif n'est confirmé, la bouteille reste au statut "en cave" du début à la fin — seule sa position (Emplacement) change, via un Déplacement vers "Hors rangement" puis, le cas échéant, vers son rangement définitif. Une Sortie n'est jamais "annulée" par un Déplacement : elle n'a simplement jamais eu lieu.

L'historique des mouvements (dates + motifs) constitue une traçabilité basique suffisante pour la V1 — une fonctionnalité de notes de dégustation est envisageable en V2 mais n'est pas retenue pour le périmètre actuel.

### 2.5 Catégorie, seuils et durée de garde

- Une **Catégorie** est définie par un **Type** (obligatoire) et éventuellement une **Région/Appellation** (optionnelle) — modèle hiérarchique.
- Chaque Catégorie peut avoir un **seuil minimum** de bouteilles (pour l'alerte de manque, §3.7).
- Chaque Catégorie peut avoir une **durée de garde** (en années), utilisée pour calculer la date limite de consommation d'une bouteille (§3.6).
- **Règle de résolution** (s'applique au seuil comme à la durée de garde) : si une valeur existe à la fois au niveau générique (type seul) et spécifique (type + région), la valeur spécifique prime pour cette sous-catégorie.

---

## 3. Fonctionnalités

### 3.1 Gestion des emplacements

- CRUD complet des Armoires : nom + liste d'Étagères, chacune avec son nombre d'alvéoles (modifiable après création)
- CRUD complet des Cartons : identifiant + capacité
- **Vue cave globale** : liste hiérarchique (Armoire > Étagère > bouteilles, + section Cartons)
- **Vue visuelle** : représentation en grille/plan, disponible **au niveau d'une armoire** (étagères avec alvéoles occupées/libres) — pas de vue visuelle pour la cave entière
- *Suppression d'un emplacement non vide* : les bouteilles qu'il contient sont automatiquement déplacées vers la zone "Hors rangement" (aucun blocage de la suppression)

### 3.2 Suggestion d'emplacement au rangement

Lors de tout rangement d'une bouteille (ajout ou déplacement), la sélection de l'emplacement se fait ainsi :
1. L'application **propose automatiquement** un emplacement libre (premier trouvé selon le compteur de capacité)
2. Un bouton **"Autre emplacement"** permet de demander une nouvelle proposition, pour le cas où la suggestion ne convient pas physiquement (ex : alvéole comptée libre mais occupée en pratique par une bouteille plus grande que la normale)
3. Une option **"Choisir manuellement"** permet de sélectionner soi-même l'emplacement, sans passer par la suggestion

**Règle de capacité inchangée** : le compteur de capacité reste bloquant même en sélection manuelle — impossible de choisir un emplacement déjà marqué complet, y compris à la main.

### 3.3 Ajout de bouteille

- Déclenchable depuis un bouton global "+" (emplacement choisi via la suggestion, §3.2) **ou** depuis la vue d'un emplacement précis (pré-rempli)
- **Ajout unitaire** ou **ajout en masse** (N bouteilles identiques en une seule saisie), disponible pour Étagère et Carton
  - Un seul formulaire (type, appellation, cépage, domaine, millésime, origine, photo, note) génère N bouteilles individuelles, chacune avec son propre statut et sa propre référence
  - Note commune à tout le lot au moment de l'ajout, éditable individuellement ensuite
- Blocage si la capacité de l'emplacement est dépassée

### 3.4 Sortie de bouteille

- Déclenchable uniquement depuis la fiche bouteille (bouton dédié "Sortir")
- Motif obligatoire : **Consommée / Offerte / Perdue-cassée**
- Libère l'alvéole de l'emplacement, clôt le mouvement

### 3.5 Déplacement de bouteille

- Action dédiée "Déplacer", distincte de l'entrée/sortie
- Change l'emplacement (rangement différent, ou vers/depuis la zone "Hors rangement"), via la suggestion d'emplacement (§3.2), sans créer de mouvement d'entrée/sortie, sans perte de la référence
- **Zone "Hors rangement"** : destination dédiée pour une bouteille physiquement sortie (ex : plusieurs bouteilles amenées pour un repas), sans capacité limite
- **Vue dédiée "Hors rangement"** : liste filtrée sur cette zone, pour retrouver immédiatement les quelques bouteilles concernées sans chercher parmi toute la cave. Depuis cette vue, actions directes possibles : Déplacer vers le rangement définitif, ou Sortir (motif Consommée/Offerte/Perdue-cassée)

### 3.6 Recherche pour un repas

- Filtre par **Type + Région/Appellation + Cépage**
- Les bouteilles taggées "souvenir" sont incluses dans les résultats mais visuellement signalées (badge), pour éviter une consommation par erreur sans les masquer de l'inventaire
- **Modes de tri des résultats** :
  - **"À boire en priorité"** : les 20 premières bouteilles dont la date limite de consommation est la plus proche d'aujourd'hui apparaissent en tête ; plus une bouteille est éloignée de sa date limite, plus elle apparaît loin dans la liste
  - **"Par âge"** : tri par ancienneté (millésime ou date d'entrée), les plus vieilles en premier, les plus récentes en dernier
- **Badge "À boire d'urgence"** : signale visuellement toute bouteille ayant dépassé sa date limite de consommation, quel que soit le mode de tri actif

### 3.7 Alerte de manque

- **Badge/pastille** dans l'app dès qu'au moins une catégorie passe sous son seuil
- **Écran dédié** listant les catégories en manque, avec :
  - la quantité manquante
  - des suggestions de vins déjà eus dans cette catégorie (basées sur l'historique des mouvements), triées du plus récent au plus ancien

### 3.8 Import initial de la cave

Aucune fonctionnalité dédiée : la saisie de la cave existante se fait via le parcours d'ajout standard (unitaire ou en masse), répété autant que nécessaire.

### 3.9 Administration

- **Emplacements** : CRUD Armoires/Étagères/Cartons et leurs capacités
- **Catégories, seuils & durées de garde** : CRUD complet
- **Référentiels Région/Cépage** : auto-enrichis par la saisie avec autocomplétion, pas d'écran d'administration dédié
- **Types de vin** : liste fixe, non modifiable par l'utilisateur
- **Compte** : gestion du profil, mot de passe, déconnexion
- **Données** : export/sauvegarde manuelle de la cave

---

## 4. Exigences non-fonctionnelles

- **Fonctionnement 100% hors-ligne** : consultation ET ajout/sortie/déplacement de mouvements doivent fonctionner sans réseau, avec synchronisation automatique au retour de la connexion
- Les photos peuvent être prises hors-ligne ; leur upload est différé jusqu'au retour réseau
- **Isolation stricte par compte** : chaque utilisateur ne voit que sa propre cave, aucun partage de données entre comptes

---

## 5. Architecture technique (synthèse)

| Composant | Choix |
|---|---|
| Frontend | PWA — React + TypeScript + Vite (`vite-plugin-pwa` pour service worker/manifest) |
| Backend | API REST PHP + MySQL, hébergée sur serveur mutualisé OVH |
| Stockage hors-ligne | IndexedDB (ex : Dexie.js) + file d'attente de synchronisation |
| Photos | Upload serveur, stockage fichier avec chemin référencé en base |
| Authentification | **Point ouvert** — voir §6 |

---

## 6. Points ouverts

- **Authentification** : intégration prévue d'un service tiers personnel (dépôt `fzed51/auth-service`), documentation à fournir ultérieurement pour définir le protocole d'intégration
- **Schéma détaillé des tables MySQL et endpoints API** : non couverts par ce document, à traiter dans une spécification technique dédiée
