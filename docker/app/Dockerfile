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

CMD ["sh", "-c", "yarn install --immutable && yarn dev --host"]
