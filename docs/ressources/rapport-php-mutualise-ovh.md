# Relevé de configuration PHP — mutualisé OVH (fzed51.com)
 
Relevé du 2026-09-26 (`result.json`, `result-htaccess.json`, `phpinfo.html`).
 
| Question | Réponse | Valeur relevée |
|---|---|---|
| Export ZIP possible ? | **Oui** | ext `zip` chargée, classe `ZipArchive` présente |
| Traitement photo — GD | **Oui** (JPEG + WebP, pas AVIF) | GD bundled 2.1.0 : JPEG ✓, PNG ✓, WebP ✓ (`imagewebp`), AVIF ✗, FreeType ✓ |
| Traitement photo — Imagick | **Oui** (WebP, pas AVIF) | ImageMagick **6.9.10-23 (2019)** : WEBP ✓, JPEG ✓, HEIC ✓, AVIF ✗ |
| Mode d'exécution PHP | **PHP-FPM** | SAPI `fpm-fcgi` (Server API « FPM/FastCGI »), PHP **8.3.31** |
| En-tête `Authorization` transmis ? | **Non** sans correctif / **Oui** avec | Sans `.htaccess` : absent partout (`HTTP_AUTHORIZATION`, `REDIRECT_…`, `getallheaders()`). Avec le correctif `RewriteRule … [E=HTTP_AUTHORIZATION:…]` : présent dans `HTTP_AUTHORIZATION` et `getallheaders()` |
| Version MySQL (CHECK ⇒ 8.0.16+) | **Non relevé** | pas d'identifiants de base fournis |
| Cache JWKS en mémoire ? | **Non via APCu** / OPcache oui | APCu **absent**. OPcache « Up and Running » (`opcache.enable=On`), mais c'est un cache d'opcodes, pas de données |
| `exec()` disponible ? | **Oui** | `disable_functions` = `dl` + 2 noms factices ; `exec`, `shell_exec`, `proc_open` utilisables |
| Limites | — | `memory_limit` 512M, `max_execution_time` 165 s, `upload_max_filesize` 128M, `post_max_size` 130M, `max_file_uploads` 20 |
| Divers | — | temp `/tmp`, `open_basedir` non défini, `date.timezone` Europe/Paris, `pdo_mysql` ✓ (+ pgsql, sqlite) ; openssl, sodium, curl, intl, mbstring, fileinfo, exif ✓ |
 
## Points bloquants ou surprenants
 
- **Le correctif `.htaccess` pour `Authorization` est obligatoire** : sans lui l'en-tête
  est supprimé avant PHP, même en FPM. Avec, il arrive dans `HTTP_AUTHORIZATION` (pas
  besoin de lire `REDIRECT_HTTP_AUTHORIZATION` quand le script est appelé directement ;
  derrière une réécriture de front controller, prévoir les deux).
- **Pas d'APCu** : le cache JWKS en mémoire partagée n'est pas possible. Solutions :
  cache fichier (dans un dossier hors docroot, `open_basedir` n'étant pas restreint) ou
  table MySQL. Les extensions `redis` et `memcached` sont chargées, mais aucun serveur
  correspondant n'est fourni sur le mutualisé.
- **Pas d'AVIF** ni avec GD ni avec Imagick → retenir **WebP** comme format de sortie.
  ImageMagick date de 2019 (6.9.10) : préférer GD pour les traitements simples.
- **OPcache** : `opcache_get_status()` renvoie `false` car `opcache.restrict_api` est
  limité à un script OVH ; le cache tourne pourtant (vérifié dans `phpinfo`).
- **`exec()` n'est pas désactivé** — utile ponctuellement, mais ne pas bâtir dessus
  (comportement mutualisé non garanti dans le temps).
- **Transport** : contrairement à l'hypothèse de départ, le FTP en clair est refusé ;
  **SFTP** fonctionne (ext-curl + libssh2 depuis `deploy.php`).
- **Incident rencontré** : `www/.htaccess` contenait `Alias` + `<Directory>`, directives
  interdites en `.htaccess` → **HTTP 500 sur tout le site**. Fichier désactivé
  (`.htaccess.off`) ; `/cv` n'est plus servi et devra passer par un sous-domaine
  Multisite, un lien symbolique ou un déplacement.
- **Version MySQL à relever** séparément (identifiants de base non fournis) pour trancher
  la question des CHECK constraints.
