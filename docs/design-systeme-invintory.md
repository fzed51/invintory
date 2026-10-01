# Design system Invintory

Ressource à apporter au projet : le style visuel de l'application (couleurs claires et sombres, typographies, espacements, composants). Palette **lie-de-vin en thème clair, doré sourd en thème sombre** ; titres en **EB Garamond**, interface en **Albert Sans**.

## Contenu du paquet

```
src/design/
  tokens.css          jetons (variables CSS, thèmes clair et sombre, @font-face)
  components.css      composants (classes ivt-*)
  wine-types.ts       liste typée des six types de vin + utilitaire cx()
  fonts/              EB Garamond et Albert Sans (woff2 latin, variables) + licences OFL
```

## Intégration (Vite + React + TypeScript)

1. Copier `src/design/` dans le projet.
2. Importer les deux feuilles une seule fois, dans `main.tsx` :
   ```ts
   import "./design/tokens.css";
   import "./design/components.css";
   ```
3. Choisir le thème avec l'attribut `data-theme` sur `<html>` (`light` par défaut, `dark`) : d'après `prefers-color-scheme`, avec un réglage manuel prioritaire dans Réglages.
   ```ts
   const saved = localStorage.getItem("theme"); // "light" | "dark" | null
   const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
   document.documentElement.dataset.theme = saved ?? (dark ? "dark" : "light");
   ```
4. Hors-ligne : précacher les polices dans `vite-plugin-pwa`, par exemple `workbox: { globPatterns: ["**/*.{js,css,html,woff2}"] }`.
5. Les composants sont des **classes CSS** `ivt-*` ; il n'y a pas de composants React fournis. L'application les enveloppe dans ses propres composants (`Button`, `Badge`, `BottleCard`, `ShelfGrid`, `Field`, `SegmentedControl`, `BottomNav`, `Banner`) avec les gabarits HTML ci-dessous.

`components.css` contient aussi une remise à zéro légère : `box-sizing: border-box`, marges du `body` à 0, fond `--surface`, police `--font-sans`.

## Guide de style

Invintory est une application mobile personnelle de suivi de cave à vin : on y range, on y cherche et on en sort des bouteilles, souvent debout devant une armoire, dans une lumière moyenne, parfois sans réseau. Le style est celui d'une belle carte des vins : lie-de-vin sur gris mauve en clair, doré sourd sur prune sombre, sobre, lisible d'un coup d'œil, sans décor.

### Contenu

- Écrire en français, en casse de phrase, sans point d'exclamation ni emoji. Les actions sont des verbes à l'infinitif de un ou deux mots : « Ajouter », « Déplacer », « Sortir », « Autre emplacement », « Choisir manuellement ».
- Garder le vocabulaire du métier, sans synonymes : Armoire, Étagère, Alvéole, Carton, Hors rangement ; mouvements Entrée, Sortie, Déplacement ; motifs de sortie « Consommée », « Offerte », « Perdue-cassée » ; types Rouge, Blanc, Rosé, Effervescent, Doux, Autre.
- Un message dit l'état, puis quoi faire. Un refus cite la règle et le maximum : « Étagère complète : 12 alvéoles sur 12 sont occupées. Choisissez un autre emplacement. » Une alerte cite la quantité : « Il manque 2 bouteilles pour atteindre 6. »
- Un millésime absent s'écrit « non millésimé », jamais un tiret. La référence d'une bouteille s'affiche en minuscules dans `reference`, telle qu'on la recopie sur l'étiquette.

### Couleur et thèmes

- Poser le contenu sur `surface` ; les cartes, champs et la barre d'onglets sur `surface-raised` ; ce qui est en creux (alvéole libre, piste d'un contrôle segmenté, bannière hors ligne) sur `surface-sunken`. Texte courant en `ink`, texte secondaire en `ink-muted`.
- `brand` (lie-de-vin en clair, doré en sombre) est réservé à l'action principale et à l'onglet actif : une fois par écran. Le texte posé dessus est `on-brand`, jamais du blanc littéral.
- `success` (vert sauge), `warning` (ambre) et `danger` (rouge) disent un état : synchronisé, en manque, urgent ou bloquant. Chacun est toujours accompagné d'un mot ou d'une icône ; leurs fonds doux sont `success-tint`, `warning-tint`, `danger-tint`.
- Deux thèmes, `light` (repli) et `dark`. Appliquer `data-theme="dark"` selon `prefers-color-scheme`, avec un réglage manuel qui prime dans Réglages ; le thème sombre est un vrai thème de travail, pas un bonus : la cave est un lieu peu éclairé. Il reste feutré : accents poussiéreux, texte blanc cassé chaud, aucune teinte vive.
- Le `focus` est un anneau plein de 2px, décalé de 2px du contrôle, sur tous les éléments interactifs.

### Type de vin

Chaque type a un repère `wine-<type>` (`wine-rouge`, `wine-blanc`, `wine-rose`, `wine-effervescent`, `wine-doux`, `wine-autre`) et un fond `wine-<type>-tint` pour son badge. Le repère colore la pastille du badge et l'alvéole occupée. `wine-rouge` est volontairement plus sombre que `brand` : ne pas les substituer l'un à l'autre. L'effervescent prend la couleur du blanc et se distingue par des bulles. Le type se dit toujours par son libellé : ne jamais compter sur la couleur pour distinguer un blanc d'un effervescent.

### Typographie

- Titres en serif EB Garamond (petit œil : jamais sous 20px) : `display` une fois par écran d'accueil, `title-1` pour le titre d'écran et le domaine sur une fiche, `title-2` pour un nom d'armoire ou d'étagère.
- Interface en Albert Sans : `body` (16px) pour le texte courant, `body-strong` pour une quantité ou un nom d'emplacement, `label` pour boutons, libellés de champ et segments, `caption` pour badges et onglets. Rien sous 12px.
- La référence d'une bouteille est la seule chasse fixe : `reference`, espacée, pour lever les confusions l/1 et 0/O.
- Les polices sont des fichiers woff2 (`src/design/fonts/`), embarquées dans l'application et précachées par le service worker : l'application fonctionne sans réseau, aucune police ne se charge depuis un CDN.

### Espace, forme, profondeur

- Marge latérale de l'écran `space-4` ; entre blocs `space-5` ; toute cible tactile fait au moins `tap-target` (44px) de haut.
- Rayons : `radius-sm` pour badges et puces, `radius-md` pour boutons, champs et bannières, `radius-lg` pour cartes et étagères, `radius-pill` pour les pastilles, `radius-round` pour les alvéoles.
- Les surfaces se séparent par une bordure, pas par une ombre : `line` pour un simple filet entre deux lignes, `line-strong` pour tout contrôle. Seule la feuille basse porte `shadow-sheet`.
- Pas d'animation nécessaire au sens : respecter `prefers-reduced-motion` pour toute transition ajoutée.

### Iconographie

Icônes en SVG inline, 24px, trait de 1,75px, `currentColor`, extrémités arrondies ; 16px (`ivt-icon--sm`) dans un badge ou un message. Jamais d'emoji. Le jeu actuel (grille d'alvéoles, loupe, plus, triangle d'alerte, curseurs, cercle barré, coche, marque-page) est dessiné pour les aperçus : il pourra être remplacé par une bibliothèque complète au même trait sans changer les composants. Il n'y a pas de logo : le nom se compose en `display`.

## Jetons

### Couleurs

Toutes les paires texte/fond citées sont vérifiées à 4,5:1 minimum ; bordures de contrôle, focus et repères de vin à 3:1 minimum, dans les deux thèmes.

| Jeton | Clair | Sombre | Usage |
|---|---|---|---|
| `surface` | `#f0e9ec` | `#171015` | Fond de page : gris mauve clair (clair), prune-noir feutré (sombre). Porte `ink`, `ink-muted`, `brand`, `success`, `warning`, `danger` en texte à 4,5:1 minimum dans les deux thèmes. |
| `surface-raised` | `#faf6f8` | `#21171f` | Cartes (fiche bouteille, étagère), barre de navigation, feuilles et champs de saisie. Mêmes textes admis que sur `surface`. |
| `surface-sunken` | `#e1d5db` | `#100a0e` | Fond en creux : alvéole libre, piste du contrôle segmenté, puce de référence, bannière hors ligne. Mêmes textes admis que sur `surface`. |
| `line` | `#cdbcc5` | `#372832` | Filet décoratif entre deux lignes de liste ou autour d'une carte. Trop léger pour porter du sens seul (< 3:1) : ne jamais s'en servir comme bordure de champ ou de bouton. |
| `line-strong` | `#705a68` | `#8a7684` | Bordure de contrôle : champs, bouton secondaire, alvéole libre, segment actif. Au moins 3:1 sur `surface`, `surface-raised` et `surface-sunken` dans les deux thèmes. |
| `ink` | `#25151f` | `#ece2e8` | Texte principal et titres sur `surface`, `surface-raised`, `surface-sunken`, `brand-tint` et toutes les teintes `*-tint`. |
| `ink-muted` | `#5f4855` | `#b1a0ab` | Texte secondaire (appellation, cépage, emplacement, aide de champ) sur `surface`, `surface-raised`, `surface-sunken` et `brand-tint`, à 4,5:1 minimum. |
| `brand` | `#5f1e45` | `#c9a85a` | Marque : lie-de-vin en clair, doré sourd en sombre. Fond des actions principales (texte `on-brand`) et texte de marque (liens, onglet actif) sur `surface` et `surface-raised`. Le doré du thème sombre reste sourd, jamais brillant. |
| `on-brand` | `#fbf2f6` | `#171015` | Texte et icône posés sur un fond `brand`. Jamais du blanc littéral : il s'inverse avec le thème. |
| `brand-tint` | `#e5c9d9` | `#372d17` | Fond de sélection : ligne active, bouteille cochée, segment choisi. Texte `ink` ou `ink-muted` dessus. |
| `success` | `#3e5d4a` | `#82a08d` | Vert sauge : état positif (synchronisé, ajout réussi) ; fond avec `on-success`, ou texte sur `surface` et `surface-raised`. |
| `on-success` | `#fbf6ef` | `#14200d` | Texte posé sur un fond `success`. |
| `success-tint` | `#dbe6d0` | `#232e1f` | Fond de bannière ou de badge de succès ; texte `ink` dessus. |
| `warning` | `#86500f` | `#d38f5f` | Ambre : alerte de manque (catégorie sous son seuil) et avertissements non bloquants ; fond avec `on-warning`, ou texte sur `surface` et `surface-raised`. Plus orangé que le doré de `brand` en sombre. |
| `on-warning` | `#fff8ee` | `#2a1706` | Texte posé sur un fond `warning`. |
| `warning-tint` | `#f2dcbc` | `#3a2914` | Fond de bannière d'alerte de manque ; texte `ink` dessus. |
| `danger` | `#a51737` | `#cf8a7a` | Rouge : « À boire d'urgence », capacité dépassée, sortie et erreurs bloquantes ; fond avec `on-danger`, ou texte sur `surface` et `surface-raised`. Toujours accompagné d'un mot ou d'une icône. |
| `on-danger` | `#fff6f2` | `#251009` | Texte posé sur un fond `danger` (bouton Sortir, badge d'urgence, pastille de manque). |
| `danger-tint` | `#f3d2c8` | `#3d201c` | Fond de bannière d'erreur bloquante ; texte `ink` dessus. |
| `focus` | `#25151f` | `#ece2e8` | Anneau de focus clavier : 2px pleins, décalés de 2px du contrôle. 3:1 minimum sur `surface`, `surface-raised` et `surface-sunken`. |
| `wine-rouge` | `#7a1a3a` | `#b04d75` | Repère du type « Rouge » (rouge vin profond, distinct de `brand`) : pastille du badge et alvéole occupée. 3:1 minimum sur les trois fonds. Le type n'est jamais porté par la couleur seule : le libellé « Rouge » l'accompagne. |
| `wine-rouge-tint` | `#e8c3d0` | `#3c1b2a` | Fond du badge de type « Rouge » ; texte `ink` dessus. |
| `wine-blanc` | `#8f7012` | `#cbbf8a` | Repère du type « Blanc » (paille) : pastille du badge et alvéole occupée. 3:1 minimum sur les trois fonds. Le type n'est jamais porté par la couleur seule : le libellé « Blanc » l'accompagne. |
| `wine-blanc-tint` | `#f0e2ab` | `#38331a` | Fond du badge de type « Blanc » ; texte `ink` dessus. |
| `wine-rose` | `#b53f6b` | `#c47895` | Repère du type « Rosé » (rose saumon) : pastille du badge et alvéole occupée. 3:1 minimum sur les trois fonds. Le type n'est jamais porté par la couleur seule : le libellé « Rosé » l'accompagne. |
| `wine-rose-tint` | `#f2cbd8` | `#402230` | Fond du badge de type « Rosé » ; texte `ink` dessus. |
| `wine-effervescent` | `#8f7012` | `#cbbf8a` | Repère du type « Effervescent » : même valeur que `wine-blanc`, distingué par des bulles (voir « Effervescent »). |
| `wine-effervescent-tint` | `#f0e2ab` | `#38331a` | Fond du badge « Effervescent » : même valeur que `wine-blanc-tint`. |
| `wine-doux` | `#ad5f14` | `#c4905a` | Repère du type « Doux » (ambre) : pastille du badge et alvéole occupée. 3:1 minimum sur les trois fonds. Le type n'est jamais porté par la couleur seule : le libellé « Doux » l'accompagne. |
| `wine-doux-tint` | `#efd6a9` | `#3b2d18` | Fond du badge de type « Doux » ; texte `ink` dessus. |
| `wine-autre` | `#4f6470` | `#91a3ae` | Repère du type « Autre » (ardoise) : pastille du badge et alvéole occupée. 3:1 minimum sur les trois fonds. Le type n'est jamais porté par la couleur seule : le libellé « Autre » l'accompagne. |
| `wine-autre-tint` | `#d3dce1` | `#242d33` | Fond du badge de type « Autre » ; texte `ink` dessus. |

Variables ajoutées par `components.css` : `--ivt-bubble` (anneau des bulles, blanc à 66 %) et `--ivt-bubble-fill` (intérieur des bulles, blanc à 12 %).

### Typographie

| Style | Famille | Taille / interligne | Graisse | Espacement | Usage |
|---|---|---|---|---|---|
| `display` | serif | 36px / 40px | 600 | 0em | Titre d'écran d'accueil et titres de section majeurs. Une fois par écran. Ne pas descendre sous 20px : l'œil de l'EB Garamond est petit. |
| `title-1` | serif | 28px / 34px | 600 | 0 | Titre d'écran (Hors rangement, Manques) et nom de domaine sur une fiche bouteille. |
| `title-2` | serif | 22px / 28px | 600 | 0 | Nom d'armoire, titre de carte, titre de feuille basse. |
| `body` | sans | 16px / 24px | 400 | 0 | Texte courant, valeur de champ, métadonnées d'une bouteille. |
| `body-strong` | sans | 16px / 24px | 600 | 0 | Valeur mise en avant : quantité manquante, nom d'emplacement dans une liste. |
| `label` | sans | 14px / 20px | 600 | 0 | Boutons, libellés de champ, segments. Phrase en casse de phrase, verbe à l'infinitif sur les actions. |
| `caption` | sans | 12px / 16px | 600 | 0 | Badges, libellés d'onglet, compteurs de capacité. Jamais sous 12px. |
| `reference` | mono | 18px / 24px | 600 | 0.08em | Code court de la bouteille à recopier sur l'étiquette (ex. k7) : chasse fixe et espacée pour lever les confusions l/1, 0/O. |

Familles : serif `"EB Garamond", Garamond, Georgia, "Times New Roman", serif` ; sans `"Albert Sans", system-ui, -apple-system, "Segoe UI", sans-serif` ; mono `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`. Chaque style existe en variable CSS (`--text-title-1`…) et en classe (`.display`, `.title-1`, `.title-2`, `.body`, `.body-strong`, `.label`, `.caption`, `.reference`).

### Espacement

| Jeton | Valeur | Usage |
|---|---|---|
| `space-1` | 4px | Écart minimal : entre une pastille et son libellé. |
| `space-2` | 8px | Écart interne d'un badge, entre deux badges, entre alvéoles. |
| `space-3` | 12px | Écart entre lignes d'une fiche bouteille ; padding vertical de ligne. |
| `space-4` | 16px | Marge latérale de l'écran mobile ; padding d'une carte. |
| `space-5` | 24px | Écart entre deux blocs d'une même page (étagères, sections). |
| `space-6` | 32px | Écart entre grandes sections ; marge de la couverture. |
| `space-7` | 48px | Réserve haute : haut d'un écran vide, état vide. |
| `tap-target` | 44px | Hauteur minimale de toute cible tactile (bouton, champ, ligne cliquable, onglet). |

### Rayons

| Jeton | Valeur | Usage |
|---|---|---|
| `radius-sm` | 6px | Badges, puce de référence, petites étiquettes. |
| `radius-md` | 10px | Boutons, champs, contrôle segmenté, bannières. |
| `radius-lg` | 16px | Cartes, étagères, feuilles basses. |
| `radius-pill` | 999px | Pastille de compteur et badges de type. |
| `radius-round` | 50% | Alvéoles : vue de face du cul de bouteille. |

### Ombre

`--shadow-sheet` : clair `0 8px 24px rgba(42,32,25,0.16)`, sombre `0 8px 24px rgba(0,0,0,0.55)`. Réservée à la feuille basse.

## Composants (gabarits HTML)

Icônes : SVG inline `class="ivt-icon"` (24 px) ou `ivt-icon ivt-icon--sm` (16 px), trait 1,75 px, `currentColor`.

### Button

Quatre variantes : `ivt-btn--primary` (au plus une par écran), `--secondary`, `--danger` (uniquement Sortir, opération irréversible), `--quiet`. `ivt-btn--block` pour la pleine largeur. Cible tactile 44 px ; le libellé est un verbe à l'infinitif.

```html
<button class="ivt-btn ivt-btn--primary" type="button">Ajouter</button>
<button class="ivt-btn ivt-btn--secondary" type="button">Déplacer</button>
<button class="ivt-btn ivt-btn--danger" type="button">Sortir</button>
<button class="ivt-btn ivt-btn--quiet" type="button">Autre emplacement</button>
```

### Badge

Le badge de type associe toujours la pastille colorée (1 em) et le libellé. `ivt-badge--<type>` avec `rouge`, `blanc`, `rose`, `effervescent`, `doux`, `autre`. `urgent` est le seul badge plein. La pastille `ivt-pastille` compte les catégories en manque, sur l'onglet Manques.

```html
<span class="ivt-badge ivt-badge--rouge"><span class="ivt-badge__dot"></span>Rouge</span>
<span class="ivt-badge ivt-badge--souvenir"><svg class="ivt-icon ivt-icon--sm" viewBox="0 0 24 24" aria-hidden="true">…</svg>Souvenir</span>
<span class="ivt-badge ivt-badge--urgent"><svg class="ivt-icon ivt-icon--sm" viewBox="0 0 24 24" aria-hidden="true">…</svg>À boire d'urgence</span>
<span class="ivt-pastille" aria-label="3 catégories en manque">3</span>
```

### BottleCard

Ligne de liste qui ouvre la fiche : domaine, appellation · cépage · millésime (« non millésimé » sans année), badges, emplacement, référence dans la puce `ivt-ref`. `ivt-bottle--selected` pour une sélection multiple.

```html
<a class="ivt-bottle" href="#">
  <div>
    <h3 class="ivt-bottle__title">Domaine Delaunay</h3>
    <p class="ivt-bottle__meta">Pommard · Pinot noir · 2016</p>
    <div class="ivt-bottle__badges">…badges…</div>
    <p class="ivt-bottle__where">Armoire de la cuisine › Étagère 2</p>
  </div>
  <span class="ivt-ref">k7</span>
</a>
```

### ShelfGrid

Une ligne = une étagère, vue de face : toutes ses alvéoles sur une seule ligne, réduites au besoin (`ivt-shelf__grid`, colonnes de 40 px au plus). Trois états d'alvéole : libre (creux + bordure), occupée (`data-wine="<type>"`, disque de la couleur du type), proposée (`ivt-alveole--suggested`, bordure pointillée). Les alvéoles sont un **dessin** de l'occupation (le schéma ne connaît pas la position d'une bouteille) : on range dans une étagère, pas dans une alvéole. Quand on peut choisir, **l'étagère entière est le bouton** (`button.ivt-shelf`, cible tactile de toute la largeur), `ivt-shelf--selected` marque le choix. Capacité bloquante : une étagère pleine est désactivée et le dit (« complète »). L'armoire (`ivt-armoire`) empile ses étagères de haut en bas et porte une seule légende.

```html
<section class="ivt-armoire" aria-label="Armoire de la cuisine">
  <h2 class="ivt-armoire__name">Armoire de la cuisine</h2>
  <button class="ivt-shelf" type="button" aria-pressed="false" aria-label="Étagère 2, 9 alvéoles occupées sur 12, emplacement proposé">
    <span class="ivt-shelf__head"><span class="ivt-shelf__name">Étagère 2</span><span class="ivt-shelf__count">9 / 12 alvéoles</span></span>
    <span class="ivt-shelf__grid" aria-hidden="true">
      <span class="ivt-alveole" data-wine="rouge"></span>
      <span class="ivt-alveole ivt-alveole--suggested"></span>
      <span class="ivt-alveole"></span>
    </span>
  </button>
  <ul class="ivt-legend"><li><i></i>Libre</li><li><i class="is-full"></i>Occupée</li><li><i class="is-suggested"></i>Proposée</li></ul>
</section>
```

### Field

Libellé toujours visible. `ivt-input--reference` pour la recherche par code (chasse fixe, minuscules, `autocapitalize="none"`). Erreur : `ivt-input--error` + message `ivt-field__error` relié par `aria-describedby`.

```html
<div class="ivt-field">
  <label class="ivt-field__label" for="ref">Référence</label>
  <input class="ivt-input ivt-input--reference" id="ref" autocapitalize="none" autocomplete="off">
  <p class="ivt-field__hint">Le code écrit sur l'étiquette de la bouteille.</p>
</div>
```

### SegmentedControl

Choix exclusif entre deux à trois options courtes (modes de tri). L'option active porte `aria-checked="true"`. Chaque option fait au moins `tap-target` (44 px) de haut.

```html
<div class="ivt-seg" role="radiogroup" aria-label="Trier par">
  <button class="ivt-seg__opt" role="radio" aria-checked="true" type="button">À boire en priorité</button>
  <button class="ivt-seg__opt" role="radio" aria-checked="false" type="button">Par âge</button>
</div>
```

### BottomNav

Cinq entrées : Cave, Repas, Ajouter (`ivt-nav__add`, sans libellé visible, `aria-label` obligatoire), Manques (avec `ivt-nav__pastille`), Réglages. L'onglet actif : `aria-current="page"`.

```html
<nav class="ivt-nav" aria-label="Navigation principale">
  <a class="ivt-nav__item" href="#" aria-current="page"><svg class="ivt-icon" viewBox="0 0 24 24" aria-hidden="true">…</svg>Cave</a>
  <a class="ivt-nav__item" href="#" aria-label="Ajouter une bouteille"><span class="ivt-nav__add"><svg class="ivt-icon" viewBox="0 0 24 24" aria-hidden="true">…</svg></span></a>
  <a class="ivt-nav__item" href="#"><svg class="ivt-icon" viewBox="0 0 24 24" aria-hidden="true">…</svg>Manques<span class="ivt-pastille ivt-nav__pastille" aria-label="3 en manque">3</span></a>
</nav>
```

### Banner

Message en ligne : neutre (hors ligne, en attente), `ivt-banner--success`, `--warning` (catégorie en manque), `--danger` (refus bloquant, capacité dépassée). Toujours une icône et un titre. `role="status"` pour l'information, `role="alert"` pour un refus. Pour une confirmation qui demande un choix, utiliser `ivt-sheet` (feuille basse).

```html
<div class="ivt-banner ivt-banner--warning" role="status">
  <svg class="ivt-icon" viewBox="0 0 24 24" aria-hidden="true">…</svg>
  <div><span class="ivt-banner__title">Blanc sec sous son seuil</span>Il manque 2 bouteilles pour atteindre 6.</div>
</div>
```

### Effervescent

L'effervescent a **exactement la couleur du blanc** (`wine-effervescent` = `wine-blanc`, clair et sombre). Il se distingue par des bulles : petits anneaux blancs (`--ivt-bubble`, 66 %) à intérieur presque transparent (`--ivt-bubble-fill`, 12 %), dessinés en dégradés radiaux sur la pastille du badge (4 bulles) et sur l'alvéole occupée (5 bulles). Si la couleur du blanc change, recopier ses valeurs dans `wine-effervescent` et `wine-effervescent-tint`.

## Points ouverts

- Le jeu d'icônes est un placeholder dessiné pour les maquettes (grille d'alvéoles, loupe, plus, triangle, curseurs, cercle barré, coche, marque-page) : à remplacer, ou à garder, sans toucher aux composants.
- Il n'y a pas de logo : le nom « Invintory » se compose en `display`.
- Pas de composants d'écran complets (formulaire d'ajout, feuille de choix d'emplacement, fiche bouteille) : à concevoir avec ces briques.
