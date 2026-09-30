# Le mutualisé et sa doublure
 
*auth-service · note d'exploitation — offre `hosting-perso`, cluster `cluster128` — état au 11 septembre 2026*
 
Ce que l'hébergement OVH impose à `auth-service`, ce que la pile Docker en reproduit fidèlement, et les trois endroits précis où la copie s'arrête — dont celui qui a fait tomber la production.
 
> Note figée à la date indiquée : plusieurs points listés en « zones d'ombre » plus bas (quota CRON, rattachement orphelin) sont depuis clos par la V2/V2.1 (voir CLAUDE.md, « Clôture de la V2.1 »). Conservée comme trace historique de la recette du 11/09, pas comme état courant.
 
## La machine — ce qu'on loue exactement
 
Un hébergement mutualisé OVH de l'offre PERSO, ouvert en octobre 2019, qui héberge six sites. Le service vit dans `auth-service/`, et le sous-domaine pointe sur `./auth-service/public` via Multisite — tout le reste du projet est physiquement hors du docroot.
 
Le sous-domaine `auth.fzed51.com` a été créé le 5 septembre 2026, SSL et pare-feu activés, les champs DNS `A` et `AAAA` posés automatiquement par OVH. Le motif n'est pas inédit sur ce compte : `cv.fzed51.com` pointait déjà sur `cv/public` de la même façon. Le même jour, le compte technique `auth@fzed51.com` a été ouvert sur le MX Plan du domaine — son mot de passe n'a jamais transité par autre chose que le Manager et les secrets GitHub.
 
| Fiche technique | Valeur |
|---|---|
| Offre | PERSO (renouvellement sept. 2027) |
| Cluster | cluster128 (datacentre eu-west-gra, filer 788) |
| IPv4 | 51.91.236.193 |
| IPv6 | 2001:41d0:301::28 |
| Espace disque | 15 Mo / 100 Go — la pression disque n'est pas la contrainte |
| Bases de données | 1 / 5 — MySQL 8.0, pas MariaDB |
| Version PHP | 8.5 — imposée, `php.ini` non éditable |
| Docroot | `./auth-service/public` — Multisite, SSL actif |
| Compte SMTP | `auth@fzed51.com` — `smtp.mail.ovh.net`, authentifié |
| Messagerie | MX Plan — 10 comptes possibles sur le domaine |
| Sites hébergés | 6 — dont `cv.fzed51.com`, même motif Multisite |
| Tâche planifiée | `50 23 * * *` — purge quotidienne, PHP 8.5 |
 
## Contraintes — ce que l'offre interdit, et ce que l'architecture en a fait
 
Presque chaque décision structurante du projet est la réponse à une chose que ce plan ne sait pas faire. La colonne de droite n'est pas une liste de contournements subis : c'est la forme que l'hébergeur a donnée au service.
 
| Ce qui manque | La conséquence, dans le code |
|---|---|
| Ni SSH, ni accès CLI | Composer ne peut pas tourner sur le serveur. `vendor/` est construit en CI en `--no-dev --optimize-autoloader` et déployé avec le code. |
| MySQL injoignable depuis l'extérieur | Aucune IP externe ne peut se connecter à la base d'un mutualisé PERSO. Les migrations passent donc par `POST /internal/migrate`, protégé par `X-Deploy-Token` et appelé par la CI juste après l'upload. |
| Pas de variables d'environnement serveur | Impossible sans SSH, et `SetEnv` en `.htaccess` ne fonctionne pas. Un fichier `.env` reste la seule option ; il est généré par la CI depuis les GitHub Actions Secrets. |
| FTPS refusé par le cluster | Le serveur rejette `AUTH TLS` avant toute authentification — `500 This security scheme is not implemented`. Pas de SSH donc pas de SFTP non plus : le code, le `.env` et le registre transitent en clair. Contrainte de plateforme, pas un choix. |
| Aucun daemon ni worker | Pas de file d'attente, pas de traitement différé. Tout se fait dans le cycle HTTP ou dans la tâche planifiée. |
| CRON plafonné à 1×/h et 3600 s | La minute n'est même pas choisissable — OVH a fixé `50`. La purge supprime par lots bornés de 500 lignes plutôt qu'en une transaction unique. |
| Ni `logrotate`, ni accès disque | La rotation est faite par l'application : Monolog `RotatingFileHandler`, un fichier par jour, 14 jours de rétention. |
| Version PHP imposée | La contrainte Composer est verrouillée sur `"php": "~8.5.0"` : on ne peut pas merger une dépendance qui ne tournerait pas en production. |
 
## La doublure — ce que Docker reproduit
 
Trois conteneurs, décrits dans `docker-compose.yml`, dont l'objectif déclaré est la parité avec OVH plutôt qu'un confort de développement. L'image web est construite depuis `docker/php/Dockerfile` : `php:8.5-apache`, `pdo_mysql`, `a2enmod rewrite`, et un vhost qui place le docroot sur `public/` avec `AllowOverride All` — c'est cette dernière ligne qui rend `public/.htaccess` réellement actif, donc testable.
 
```
web      php:8.5-apache      → 8080    code monté en direct, healthcheck sur /health
db       mysql:8.0           → 3307    3306 est souvent déjà pris sur l'hôte
mailpit  axllent/mailpit     → 1025 SMTP, 8025 interface web
```
 
### Registre de correspondance
 
Chaque ligne dit ce que la pile locale vaut réellement comme preuve avant un déploiement.
 
| Élément | Production OVH | Pile locale | Parité |
|---|---|---|---|
| Serveur web | Apache + `mod_rewrite` | Apache + `mod_rewrite` | **exacte** |
| Réécriture d'URL | `public/.htaccess` | même fichier, `AllowOverride All` | **exacte** |
| Docroot | Multisite `./auth-service/public` | `DocumentRoot .../public` | **exacte** |
| Version PHP | 8.5 | 8.5 | **exacte** |
| Base de données | MySQL 8.0 | `mysql:8.0` | **exacte** |
| **SAPI PHP** | CGI / FastCGI | `mod_php` | **rompue** |
| Envoi d'emails | SMTP authentifié OVH | Mailpit, interception locale | approchée |
| Registre d'applications | généré par la CI depuis un secret | fichier local écrit à la main | approchée |
| Délivrabilité | SPF, DKIM, DMARC, réputation d'IP | — | non simulée |
| Quota SQL | plafonné | illimité | non simulée |
| Tâches planifiées | interface CRON du Manager | — | non simulée |
| Transfert FTP | cluster OVH, en clair | — | non simulée |
| Certificat SSL | actif sur le sous-domaine | HTTP en clair | non simulée |
 
## Le point de rupture — une seule ligne de ce registre a coûté cher
 
**Défaut de production — 11 septembre 2026 : l'en-tête `Authorization` n'atteignait pas PHP**
 
`POST /sessions` émettait bien une paire de jetons, mais `GET /users/me` refusait ce jeton pourtant valide en `INVALID_ACCESS_TOKEN`. Le `kid`, l'`aud`, l'`iss` et la fenêtre `exp`/`iat` étaient tous corrects, et les horloges concordaient.
 
PHP ne tourne pas en `mod_php` sur le mutualisé. En CGI/FastCGI, Apache traite `Authorization` comme sa propre authentification et le retire de l'environnement transmis au script. Le middleware ne voyait donc aucun en-tête. **Les trois routes authentifiées du service étaient inutilisables en production** — alors que la suite `e2e` les couvre et passe.
 
Le correctif tient en deux volets, l'un inopérant sans l'autre : une règle en tête de `public/.htaccess` qui réinjecte l'en-tête, et un repli dans `public/index.php` parce qu'Apache préfixe la variable de `REDIRECT_` en franchissant la redirection interne vers le front controller.
 
```apache
RewriteCond %{HTTP:Authorization} .
RewriteRule ^ - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
```
 
**La règle à retenir :** la pile locale reproduit fidèlement *le serveur web*, pas *le SAPI*. Tout ce qui dépend de la façon dont Apache parle à PHP — et non de la façon dont Apache route une requête — échappe à la fois aux tests d'intégration et à la suite `e2e`, qui tournent tous contre cette pile. Les en-têtes applicatifs quelconques (`X-Client-Id`, `X-Client-Secret`, `X-Deploy-Token`) passaient sans encombre ; seul `Authorization`, traité à part par Apache, était concerné.
 
### Le second défaut n'était pas un problème de parité
 
La même recette a montré que `HEAD /health` répondait `401` : le carve-out du middleware ne déclare que `GET` et comparait la méthode par égalité stricte, alors que `HEAD` est par définition un `GET` sans corps. Une sonde de disponibilité configurée en `HEAD` aurait lu une panne permanente.
 
Celui-là aurait pu être trouvé en local. Il ne l'a pas été parce que le smoke test interroge `/health` en `GET`, la suite `e2e` n'émet que des méthodes métier, et le test unitaire du carve-out n'énumérait que les couples réellement utilisés. **Un carve-out se teste sur ce qu'il refuse autant que sur ce qu'il laisse passer.**
 
## Chaîne de déploiement — comment le code arrive sur la machine
 
`deploy.yml` se déclenche sur **chaque push sur `main`**. Le déploiement n'est jamais un acte distinct à planifier — la documentation du projet a longtemps affirmé l'inverse, faute d'avoir tiré la conséquence de ce déclencheur.
 
- **Vérification** — `lint`, `stan`, `test` rejoués sur le commit exact expédié, plutôt que de se fier au run de `ci.yml`.
- **Build** — `vendor/` supprimé puis réinstallé sans les dépendances de développement.
- **Secrets** — `.env` et `config/applications.json` écrits depuis quinze secrets GitHub, aucune valeur journalisée.
- **Upload FTP** vers `auth-service/`, la racine du projet et non `public/`.
- **Migrations** puis **smoke test** sur `GET /health`.
**Deux pièges appris à l'usage :**
- Un changement de secret ne se propage qu'au prochain run. Il n'existe pas de `workflow_dispatch` : modifier une valeur dans les secrets ne touche pas la production tant qu'aucun déploiement n'a lieu. Il faut soit un merge, soit `gh run rerun`.
- Une exclusion ajoutée après coup n'efface pas l'existant. Les exclusions FTP reposent sur le suffixe de fichier, ce qui laissait passer l'échafaudage de test — des classes `.php` ordinaires. Les exclure les a empêchées de repartir, mais pas supprimées du serveur : il a fallu un ménage manuel.
### L'option écartée : « Associer Git »
 
Le Manager propose un déploiement Git intégré, découvert en configurant le sous-domaine : Multisite → le menu d'une ligne de domaine → **Associer Git**. On y renseigne un dépôt (HTTPS s'il est public, SSH sinon, avec la clé générée par OVH à déposer côté GitHub) et une branche ; le dossier d'installation doit être vide avant l'association, et un webhook resynchronise à chaque push.
 
Il a été écarté pour une raison simple : **ce mécanisme fait un `git clone` brut, il n'exécute pas `composer install`** — cohérent avec l'absence de CLI sur l'offre. L'utiliser supposerait soit de committer `vendor/`, soit de maintenir une branche de déploiement pré-buildée par la CI. C'est de la complexité ajoutée pour éviter de gérer un couple d'identifiants FTP, déjà nécessaires par ailleurs.
 
## Délivrabilité — la partie qui ne se teste que pour de vrai
 
La fonction native `mail()` a été écartée dès le départ au profit du SMTP authentifié, sur recommandation d'OVH : sans authentification de l'expéditeur, pas de garantie SPF/DKIM, et en cas d'abus c'est l'IP partagée du cluster qui est bloquée — pour tous les clients qui la partagent.
 
Le premier email de production est malgré tout arrivé en spam chez Yahoo. Le diagnostic était net : SPF et DKIM passaient tous les deux, mais `_dmarc.fzed51.com` n'existait pas du tout en DNS. Depuis leurs règles de 2024, les grands fournisseurs pénalisent l'absence totale de DMARC même avec SPF et DKIM valides.
 
| Date | Enregistrement `_dmarc` | Effet observé |
|---|---|---|
| avant le 06/09 | — (NXDOMAIN) | classement en spam chez Yahoo, `dmarc=unknown` |
| 06/09/2026 | `p=none; rua=…` | Gmail en boîte de réception, les trois alignements verts |
| 11/09/2026 | `p=quarantine; pct=25; rua=…` | Gmail et La Poste en boîte de réception principale |
 
**Ce que le durcissement protège, et ce qu'il risque :** il n'améliore pas la délivrabilité — elle est déjà bonne. Il ferme une autre porte : avec `p=none`, n'importe qui peut envoyer un courrier se prétendant de `auth@fzed51.com`. Pour un service d'authentification, le courriel de hameçonnage s'écrit tout seul, et le produit entraîne lui-même ses utilisateurs à cliquer ce type de lien.
 
Le risque ne porte pas sur `auth-service`, dont le courrier est aligné, mais sur **tout autre expéditeur du domaine** hors SPF. D'où le `pct=25` : un expéditeur oublié se signale sans que tout son courrier disparaisse.
 
## Zones d'ombre — ce qui restait inconnu ou non vérifié au 11/09
 
Consigné ici plutôt que passé sous silence — chacun de ces points a été cherché, aucun n'avait de réponse à cette date.
 
| Point | État au 11/09/2026 |
|---|---|
| Quota de tâches CRON | Le nombre inclus dans l'offre n'est documenté ni dans le guide, ni sur la fiche produit, ni dans le Manager — vérifié sur la page des tâches planifiées et sur les informations générales. La seule façon de le découvrir serait d'en créer jusqu'au refus. Sans conséquence tant qu'une seule suffit. |
| Rattachement orphelin en base | Un `user_application` porte un `application_id` qui ne correspond à aucune entrée du registre courant, hérité d'une application supprimée. Ni visible ni nettoyable sans backoffice — argument direct pour la V2, et raison de ne pas supposer la base saine au moment d'y importer le registre. *(Depuis nettoyé le 2026-09-16 via `ops:orphans:clean` — voir CLAUDE.md, « Clôture de la V2.1 ».)* |
| Délivrabilité chez Yahoo | Validée en boîte de réception principale chez Gmail et La Poste. Non retestée chez Yahoo, là où le classement en spam s'était pourtant produit : l'adresse porte déjà un compte confirmé dont le mot de passe est perdu, et Yahoo refuse l'adressage par `+`. Le vrai levier n'est pas un test de plus mais le durcissement DMARC, passé en `p=quarantine; pct=25`. |
 
---
*auth-service · état arrêté au 11 septembre 2026, après la recette de production du slice login.*
