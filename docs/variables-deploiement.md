# Variables du déploiement

Secrets et variables à créer dans GitHub (Settings > Secrets and variables > Actions) pour que
`.github/workflows/deploiement.yml` envoie Invintory sur l'hébergement mutualisé OVH. Aucune valeur
n'est versionnée : ce document ne contient que des noms et des exemples.

État : à remplir au fil de la mise en service (étape 9). Cocher chaque ligne une fois la valeur saisie
dans GitHub. La colonne « Obtention » renvoie à la section du même nom plus bas.

## Secrets

| Fait | Nom | Contenu | Obtention |
|---|---|---|---|
| [ ] | `SFTP_HOST` | hôte SFTP du cluster | [A](#a-compte-sftp) |
| [ ] | `SFTP_USER` | identifiant du compte SFTP | [A](#a-compte-sftp) |
| [ ] | `SFTP_PASSWORD` | mot de passe du compte SFTP | [A](#a-compte-sftp) |
| [ ] | `SFTP_KNOWN_HOSTS` | ligne `known_hosts` du serveur : `<hôte> ssh-ed25519 AAAA…` | [B](#b-cle-dhote-du-serveur) |
| [ ] | `DB_HOST` | hôte de la base MySQL | [C](#c-base-mysql-dediee) |
| [ ] | `DB_NAME` | nom de la base | [C](#c-base-mysql-dediee) |
| [ ] | `DB_USER` | utilisateur de la base | [C](#c-base-mysql-dediee) |
| [ ] | `DB_PASSWORD` | mot de passe de la base | [C](#c-base-mysql-dediee) |
| [ ] | `DEPLOY_TOKEN` | jeton de `POST /api/internal/migrate` (en-tête `X-Deploy-Token`) | [D](#d-jeton-de-migration) |
| [ ] | `AUTH_CLIENT_ID` | identifiant d'Invintory dans auth-service | [E](#e-identifiants-auth-service) |
| [ ] | `AUTH_CLIENT_SECRET` | secret d'Invintory dans auth-service | [E](#e-identifiants-auth-service) |

## Variables

| Fait | Nom | Valeur | Obligatoire | Obtention |
|---|---|---|---|---|
| [ ] | `DEPLOIEMENT_ACTIF` | `true` pour activer l'envoi ; absente ou autre : le job d'envoi est ignoré | oui | [G](#g-activation) |
| [ ] | `APP_URL` | adresse publique sans `/` final, par exemple `https://invintory.fr` | oui | [F](#f-domaine-et-dossier-du-projet) |
| [ ] | `AUTH_SERVICE_URL` | `https://auth.fzed51.com` | oui | [E](#e-identifiants-auth-service) |
| [ ] | `SFTP_DIR` | racine du projet sur le serveur, à côté d'`auth-service/` (`api/` et `dist/` en dessous) ; jamais `/` ni `.` | oui | [F](#f-domaine-et-dossier-du-projet) |
| [ ] | `SFTP_PORT` | port SFTP | non (22 par défaut) | [A](#a-compte-sftp) |

## Obtention

Ce qui vient des documents du projet est indiqué comme tel. Les intitulés exacts des écrans du
Manager OVH ne sont dans aucun document du projet : ils sont donnés à titre indicatif et n'ont pas été
vérifiés ici.

### A. Compte SFTP

Hébergement : offre PERSO, cluster128 (`docs/ressources/hebergement-mutualise-et-doublure-docker.md`).
Le relevé du 26/09 indique que le FTP en clair y est refusé et que le SFTP fonctionne, sur le port 22
(`docs/ressources/rapport-php-mutualise-ovh.md`, issue #28).

1. Dans le Manager OVH, ouvrir l'hébergement et chercher l'écran des accès FTP/SSH. Il donne l'**hôte**
   du serveur, l'**identifiant** de connexion et permet de **définir ou réinitialiser le mot de passe**.
2. Reporter : hôte → `SFTP_HOST`, identifiant → `SFTP_USER`, mot de passe → `SFTP_PASSWORD`. Laisser
   `SFTP_PORT` vide (22) sauf indication contraire.
3. Vérifier avant de continuer, depuis ton poste : `sftp <identifiant>@<hôte>` puis `ls`. Le dossier
   `auth-service/` doit apparaître. Le serveur peut refuser la connexion depuis l'extérieur : c'est
   exactement ce que l'issue #28 demande de constater ; dans ce cas, s'arrêter et le signaler.

Si le mot de passe du compte est déjà utilisé par le pipeline d'`auth-service`, le réutiliser ou le
changer a une conséquence sur ce pipeline : à décider avant de le réinitialiser.

### B. Clé d'hôte du serveur

Le déploiement refuse tout serveur dont la clé n'est pas celle-ci (`StrictHostKeyChecking=yes`, jamais
désactivé).

```sh
ssh-keyscan -t ed25519 -p 22 <hôte>              # la ligne à copier : <hôte> ssh-ed25519 AAAA…
ssh-keyscan -t ed25519 <hôte> | ssh-keygen -lf -  # empreinte, à comparer à celle publiée par OVH
```

- Le nom d'hôte de la ligne doit être **identique** à `SFTP_HOST` (le script se connecte par ce nom).
- Si `ed25519` ne répond pas, essayer `-t rsa` (ou `-t ecdsa`).
- Une clé relevée par `ssh-keyscan` est prise sur la foi du réseau à cet instant ; la comparaison avec
  l'empreinte donnée par OVH (si OVH en publie une, non vérifié) est ce qui la valide.
- Coller la ligne entière comme valeur du secret `SFTP_KNOWN_HOSTS`.

### C. Base MySQL dédiée

Décision P9 (issue #22) : une base propre à Invintory, avec son utilisateur, distincte de celle
d'`auth-service` (historique `migration_story` et table `users` en collision sinon). Le compte OVH
autorise 5 bases et en utilise 1 (relevé du 11/09).

1. Dans le Manager OVH, sur l'hébergement, créer une base de données : nom, utilisateur et mot de
   passe sont à choisir à la création. Reporter dans `DB_NAME`, `DB_USER` et `DB_PASSWORD`.
2. Relever l'**hôte** affiché sur la fiche de la base (ne pas supposer `localhost`) → `DB_HOST`. Le port est 3306 et n'est pas à saisir.
3. Activer la **sauvegarde automatique** à la création (décision P11).
4. Relever la version exacte (`SELECT VERSION();`, par exemple depuis phpMyAdmin) pour la décision P10 :
   si elle est ≥ 8.0.16, ouvrir une issue pour proposer des contraintes `CHECK`.

La base n'est pas joignable depuis l'extérieur : les migrations passent par `POST /api/internal/migrate`,
jamais par une connexion directe.

### D. Jeton de migration

Valeur à inventer, pas à récupérer : une chaîne longue et aléatoire.

```sh
php -r "echo bin2hex(random_bytes(32));"
# ou : openssl rand -hex 32
```

La coller dans le secret `DEPLOY_TOKEN`. Elle sert à la fois à écrire le `.env` de production et à
appeler la route de migration : le workflow lit le même secret aux deux endroits.

### E. Identifiants auth-service

D'après `docs/ressources/auth-service-integration.md` (§ « Ce dont vous avez besoin pour démarrer »), il
n'existe aucun libre-service : l'entrée d'Invintory est créée **par l'exploitant d'auth-service**
(ici, toi), qui obtient trois valeurs.

| Valeur | Réglage pour Invintory |
|---|---|
| `client_id` | à choisir à l'enregistrement → `AUTH_CLIENT_ID` (la doublure de développement utilise `invintory-dev`) |
| `client_secret` | chaîne longue et aléatoire (`openssl rand -hex 32`) → `AUTH_CLIENT_SECRET` |
| `redirect_uri` | `https://invintory.fr/api/auth/callback` |

1. Déclarer Invintory dans le registre d'applications d'auth-service (`config/applications.json`, généré
   par la CI du dépôt auth-service depuis un secret de ce dépôt, issue #22). Le format exact d'une entrée
   est dans le dépôt auth-service : il n'est pas décrit dans les documents d'Invintory.
2. **Relancer le déploiement d'auth-service** : un changement de secret ne s'applique qu'au run suivant.
3. Mettre `AUTH_CLIENT_ID` et `AUTH_CLIENT_SECRET` (mêmes valeurs) dans les secrets d'Invintory.
4. `AUTH_SERVICE_URL` : `https://auth.fzed51.com` (adresse du service en production, issue #22).

Symptôme d'une erreur de configuration : `401 UNAUTHORIZED` dès le premier appel d'auth-service
(`client_id` inconnu ou secret faux).

### F. Domaine et dossier du projet

Décision P2 : domaine racine `invintory.fr` (issue #22).

1. **DNS** : enregistrements `A` 51.91.236.193 et `AAAA` 2001:41d0:301::28 (adresses de cluster128
   relevées le 11/09, à revérifier dans le Manager), pour `invintory.fr` et éventuellement `www`.
   Si la zone DNS est chez OVH, le Multisite peut les poser seul ; sinon, les saisir chez le
   registraire (question #22 en attente : le registraire est-il OVH ?).
2. **Multisite** : rattacher `invintory.fr` à l'hébergement, dossier racine → `<SFTP_DIR>/dist` (même
   principe que `auth.fzed51.com` → `./auth-service/public`), SSL actif. Le certificat ne s'émet qu'une
   fois le DNS propagé.
3. `APP_URL` = `https://invintory.fr` (sans `/` final).
4. `SFTP_DIR` : chemin, vu par le compte SFTP, d'un dossier **frère** d'`auth-service/`, par exemple
   `/invintory` ou `invintory` selon la racine de connexion. Le repérer avec `sftp` : `pwd` puis `ls`
   montre où se trouve `auth-service/` ; le dossier d'Invintory se place au même niveau. Il est créé par
   le premier envoi, avec `logs/`, `cache/` et `photos/`.

### G. Activation

`DEPLOIEMENT_ACTIF` se pose **en dernier**, quand tout le reste est saisi et vérifié (A, B, C, E, F) :
tant qu'elle n'est pas `true`, le job d'envoi est ignoré. Ensuite, un push sur `main` ou « Run workflow »
lance le premier déploiement.

```sh
gh variable set DEPLOIEMENT_ACTIF --body "true"
```

## Ce que le workflow écrit dans le `.env` de production

Le fichier `.env` est généré par `deploy/preparer.php` depuis les valeurs ci-dessus, envoyé à la
racine du projet (hors webroot, en `600`) et jamais journalisé.

| Variable du `.env` | Origine |
|---|---|
| `APP_DEBUG` | fixée à `false` par le script |
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | secrets du même nom |
| `DB_PORT` | 3306 (le workflow ne le transmet pas) |
| `DEPLOY_TOKEN` | secret du même nom |
| `AUTH_SERVICE_URL` | variable du même nom |
| `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET` | secrets du même nom |

Absentes du `.env` de production, car sans objet ou à défaut sûr :

- `DB_ROOT_PASSWORD` : doublure Docker uniquement ;
- `APP_LOG_FILE`, `APP_CACHE_DIR`, `APP_PHOTOS_DIR` : par défaut `logs/`, `cache/` et `photos/` à la
  racine du projet, hors webroot ; à ne définir que pour d'autres emplacements (dans ce cas, ajouter
  la variable à `deploy/Preparation.php`).

Une variable obligatoire absente ou vide arrête la préparation avec un message qui nomme la variable
(jamais sa valeur).

## Saisie en ligne de commande (facultatif)

```sh
# secret : la valeur est lue sur l'entrée standard, jamais écrite dans l'historique du shell
gh secret set SFTP_PASSWORD
# variable
gh variable set APP_URL --body "https://invintory.fr"
# vérifier ce qui existe (noms seulement)
gh secret list
gh variable list
```

Un changement de secret ne se propage qu'au déploiement suivant : relancer le workflow (« Run
workflow ») ou fusionner un commit.

## Voir aussi

- `README.md`, section « Déploiement » : fonctionnement du workflow et ce qui est prouvé ou non.
- Issues #22 (hébergement, base, DNS, identifiants auth-service) et #28 (SFTP, clé d'hôte).
