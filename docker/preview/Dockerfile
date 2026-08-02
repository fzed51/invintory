# Mode mono-serveur : un seul conteneur sert le front construit à la racine
# et l'API sur /api, contrairement au mode développement qui fait tourner
# Vite et PHP séparément.
#
# L'image est autonome, à la différence du dossier dist/ seul : dist/api/index.php
# require ../../api/bootstrap.php, hors de dist/, et vendor/ n'y est pas non
# plus. Les trois sont donc rassemblés ici.

# --- Étape 1 : construction du front -----------------------------------------
FROM node:22-alpine AS front

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /build

# Les dépendances d'abord, pour que le cache de couches survive à une simple
# modification du code.
COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack install && yarn install --immutable

COPY . .

# api:docs AVANT build : il écrit dans public/openapi.html, que Vite recopie
# ensuite dans dist/.
RUN yarn api:docs && yarn build

# --- Étape 2 : dépendances PHP de production ---------------------------------
FROM composer:latest AS deps

WORKDIR /build
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --optimize-autoloader --ignore-platform-req=ext-sodium

# --- Étape 3 : image d'exécution ---------------------------------------------
FROM php:8.3-cli-alpine

RUN apk add --no-cache sqlite-dev libjpeg-turbo-dev libpng-dev libwebp-dev \
	&& docker-php-ext-configure gd --with-jpeg --with-webp \
	&& docker-php-ext-install pdo_sqlite gd

WORKDIR /app

COPY api ./api
COPY --from=deps /build/vendor ./vendor
COPY --from=front /build/dist ./dist

EXPOSE 8080

# dist/router.php dispatche /api vers Slim et rend la main au serveur pour
# tout le reste, ce qui sert aussi index.html sur les routes React Router.
CMD ["php", "-S", "0.0.0.0:8080", "-t", "dist", "dist/router.php"]
