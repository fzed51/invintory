#!/usr/bin/env bash
# Après l'envoi (ou sur la doublure Docker) : attend l'API, applique les migrations, puis
# smoke test GET et HEAD /api/health (architecture §6.6).
#
# Usage : DEPLOY_TOKEN=... deploy/verifier.sh <URL de base, ex. https://invintory.fr>
#
# Le jeton passe par l'entrée standard de curl (pas dans la liste des processus) et n'est jamais
# affiché ; seuls les codes HTTP et la liste des migrations exécutées le sont.
set -euo pipefail

base="${1:?Usage : DEPLOY_TOKEN=... deploy/verifier.sh <URL de base>}"
base="${base%/}"
: "${DEPLOY_TOKEN:?DEPLOY_TOKEN est requis (jeton de POST /api/internal/migrate)}"
tentatives="${VERIFIER_TENTATIVES:-30}"
pause="${VERIFIER_PAUSE:-2}"

corps="$(mktemp)"
trap 'rm -f "$corps"' EXIT

# Code HTTP de la requête (0 : pas de réponse). Le corps est écrit dans $corps.
requete() {
  curl -sS --max-time 30 -o "$corps" -w '%{http_code}' "$@" 2> /dev/null || true
}

echo "Attente de l'API sur ${base}/api/health"
code=000
for ((i = 1; i <= tentatives; i++)); do
  code="$(requete "${base}/api/health")"
  [[ "$code" == 200 ]] && break
  sleep "$pause"
done
if [[ "$code" != 200 ]]; then
  echo "::error::GET /api/health n'a pas répondu 200 après ${tentatives} tentatives (dernier code : ${code})."
  exit 1
fi

echo "Migrations : POST /api/internal/migrate"
code="$(printf 'X-Deploy-Token: %s\n' "$DEPLOY_TOKEN" | requete -X POST -H @- "${base}/api/internal/migrate")"
if [[ "$code" != 200 ]]; then
  echo "::error::POST /api/internal/migrate a répondu ${code} au lieu de 200."
  exit 1
fi
echo "Migrations exécutées : $(cat "$corps")"

echo "Smoke test : GET et HEAD /api/health"
code="$(requete "${base}/api/health")"
if [[ "$code" != 200 ]] || ! grep -q '"status":"ok"' "$corps"; then
  echo "::error::GET /api/health a répondu ${code} (200 et {\"status\":\"ok\"} attendus)."
  exit 1
fi
code="$(requete -I "${base}/api/health")"
if [[ "$code" != 200 ]]; then
  echo "::error::HEAD /api/health a répondu ${code} au lieu de 200."
  exit 1
fi
echo "Déploiement vérifié : GET 200, HEAD 200."
