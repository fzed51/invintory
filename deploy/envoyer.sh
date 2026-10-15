#!/usr/bin/env bash
# Envoi par SFTP du dossier préparé par deploy/preparer.php (architecture §6.6, décision C1 : SFTP).
#
# Usage : deploy/envoyer.sh <dossier d'envoi>
#
# Variables d'environnement (secrets GitHub, jamais affichés) :
#   SFTP_HOST         hôte du cluster OVH
#   SFTP_PORT         port (défaut 22)
#   SFTP_USER         identifiant du compte
#   SFTP_PASSWORD     mot de passe, transmis à lftp par son entrée standard (jamais en argument)
#   SFTP_DIR          racine du projet sur le serveur, frère d'auth-service/ (api/ et dist/ en dessous)
#   SFTP_KNOWN_HOSTS  ligne(s) known_hosts de l'hôte (ssh-keyscan -p 22 <hôte>) : la clé d'hôte est
#                     toujours contrôlée, jamais StrictHostKeyChecking=no
#
# `mirror --delete` ne porte que sur api/ et dist/ : le .env, logs/, cache/ et photos/ à la racine
# du projet, et les dossiers voisins (auth-service/), ne sont jamais supprimés. Les fichiers
# obsolètes de api/ et dist/ le sont (une exclusion ajoutée après coup n'effacerait rien).
set -euo pipefail

envoi="${1:?Usage : deploy/envoyer.sh <dossier d'envoi>}"
: "${SFTP_HOST:?SFTP_HOST est requis}"
: "${SFTP_USER:?SFTP_USER est requis}"
: "${SFTP_PASSWORD:?SFTP_PASSWORD est requis}"
: "${SFTP_DIR:?SFTP_DIR est requis}"
: "${SFTP_KNOWN_HOSTS:?SFTP_KNOWN_HOSTS est requis (clé d'hôte du serveur)}"
port="${SFTP_PORT:-22}"

case "$SFTP_DIR" in
  / | . | .. | ~ | '')
    echo "::error::SFTP_DIR doit désigner le dossier du projet, pas « ${SFTP_DIR} »."
    exit 1
    ;;
esac
for element in api dist .env; do
  if [[ ! -e "${envoi}/${element}" ]]; then
    echo "::error::${envoi}/${element} est absent : lancer deploy/preparer.php d'abord."
    exit 1
  fi
done

known_hosts="$(mktemp)"
trap 'rm -f "$known_hosts"' EXIT
printf '%s\n' "$SFTP_KNOWN_HOSTS" > "$known_hosts"

# lftp 4.9 ne lit pas le mot de passe dans l'environnement : il est donné dans le script, lu sur
# l'entrée standard (jamais dans la ligne de commande, donc absent de la liste des processus).
# Entre guillemets, seuls \ et " sont à échapper.
mot_de_passe="${SFTP_PASSWORD//\\/\\\\}"
mot_de_passe="${mot_de_passe//\"/\\\"}"

# Dans le script lftp, `mkdir -p` échoue sur un dossier déjà là (sftp) : le `|| cd` distingue ce cas d'un échec réel.
echo "Envoi SFTP vers ${SFTP_USER}@${SFTP_HOST}:${port}${SFTP_DIR}"
lftp <<LFTP
set cmd:fail-exit yes
set net:max-retries 3
set net:reconnect-interval-base 5
set net:timeout 30
set sftp:auto-confirm no
set sftp:connect-program "ssh -a -x -oStrictHostKeyChecking=yes -oUserKnownHostsFile=${known_hosts} -oPubkeyAuthentication=no -oPreferredAuthentications=password,keyboard-interactive"
open -u "${SFTP_USER}","${mot_de_passe}" -p ${port} sftp://${SFTP_HOST}
mkdir -p "${SFTP_DIR}" || cd "${SFTP_DIR}"
mkdir -p "${SFTP_DIR}/logs" || cd "${SFTP_DIR}/logs"
mkdir -p "${SFTP_DIR}/cache" || cd "${SFTP_DIR}/cache"
mkdir -p "${SFTP_DIR}/photos" || cd "${SFTP_DIR}/photos"
put -O "${SFTP_DIR}" "${envoi}/.env"
chmod 600 "${SFTP_DIR}/.env"
mirror -R --delete --no-perms --parallel=4 --verbose=1 "${envoi}/api" "${SFTP_DIR}/api"
mirror -R --delete --no-perms --parallel=4 --verbose=1 "${envoi}/dist" "${SFTP_DIR}/dist"
bye
LFTP
echo "Envoi terminé."
