# Variables du déploiement

Secrets et variables à créer dans GitHub (Settings > Secrets and variables > Actions) pour que
`.github/workflows/deploiement.yml` envoie Invintory sur l'hébergement mutualisé OVH. Aucune valeur
n'est versionnée : ce document ne contient que des noms et des exemples.

État : à remplir au fil de la mise en service (étape 9). Cocher chaque ligne une fois la valeur saisie
dans GitHub.

## Secrets

| Fait | Nom | Contenu | Où le trouver |
|---|---|---|---|
| [ ] | `SFTP_HOST` | hôte SFTP du cluster | Manager OVH (FTP-SSH de l'hébergement) |
| [ ] | `SFTP_USER` | identifiant du compte SFTP | Manager OVH |
| [ ] | `SFTP_PASSWORD` | mot de passe du compte SFTP | Manager OVH |
| [ ] | `SFTP_KNOWN_HOSTS` | ligne `known_hosts` du serveur : `<hôte> ssh-ed25519 AAAA…` | `ssh-keyscan -t ed25519 <hôte>` ; le nom d'hôte doit être identique à `SFTP_HOST` ; comparer l'empreinte (`ssh-keygen -lf`) à celle donnée par OVH |
| [ ] | `DB_HOST` | hôte de la base MySQL | Manager OVH, base dédiée à Invintory (issue #22) |
| [ ] | `DB_NAME` | nom de la base | idem |
| [ ] | `DB_USER` | utilisateur de la base | idem |
| [ ] | `DB_PASSWORD` | mot de passe de la base | idem |
| [ ] | `DEPLOY_TOKEN` | jeton de `POST /api/internal/migrate` (en-tête `X-Deploy-Token`) | à générer : `php -r "echo bin2hex(random_bytes(32));"` |
| [ ] | `AUTH_CLIENT_ID` | identifiant d'Invintory dans auth-service | registre d'applications d'auth-service (décision P13, valeur fournie par l'exploitant) |
| [ ] | `AUTH_CLIENT_SECRET` | secret d'Invintory dans auth-service | idem |

## Variables

| Fait | Nom | Valeur | Obligatoire |
|---|---|---|---|
| [ ] | `DEPLOIEMENT_ACTIF` | `true` pour activer l'envoi ; absente ou autre : le job d'envoi est ignoré | oui |
| [ ] | `APP_URL` | adresse publique sans `/` final, par exemple `https://invintory.fr` | oui |
| [ ] | `AUTH_SERVICE_URL` | `https://auth.fzed51.com` | oui |
| [ ] | `SFTP_DIR` | racine du projet sur le serveur, à côté d'`auth-service/` (`api/` et `dist/` en dessous) ; jamais `/` ni `.` | oui |
| [ ] | `SFTP_PORT` | port SFTP | non (22 par défaut) |

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
