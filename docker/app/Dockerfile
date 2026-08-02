FROM node:22-alpine

# Corepack télécharge la version de Yarn déclarée dans le champ
# packageManager de package.json. Sans cette variable il demande une
# confirmation interactive, impossible ici.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable

WORKDIR /app

# Pré-installe Yarn à la construction de l'image : le démarrage du conteneur
# ne dépend alors plus d'un téléchargement. Le montage de compose remplacera
# ce package.json, mais le cache corepack reste dans l'image.
COPY package.json ./
RUN corepack install

EXPOSE 5173

# La documentation OpenAPI est régénérée au démarrage, pas à la construction :
# openapi.yaml n'arrive dans le conteneur qu'avec le montage de compose, et
# elle doit refléter la spec courante à chaque `docker compose up`.
#
# Sa génération ne doit jamais empêcher le serveur de dev de démarrer : en cas
# d'échec on prévient et on continue. Elle est servie par Vite depuis public/,
# à l'adresse http://localhost:5173/openapi.html
CMD ["sh", "-c", "yarn install --immutable \
&& { yarn api:docs || echo '[app] generation de la doc OpenAPI en echec, on continue sans'; } \
&& yarn dev --host"]
