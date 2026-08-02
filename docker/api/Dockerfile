FROM php:8.3-cli-alpine

# Install SQLite and image library development headers, then compile the
# PDO SQLite and GD extensions. GD is required by the bottle illustration
# pipeline (Invintory\Image\UploadTemporaryImageAction).
RUN apk add --no-cache sqlite-dev libjpeg-turbo-dev libpng-dev libwebp-dev \
	&& docker-php-ext-configure gd --with-jpeg --with-webp \
	&& docker-php-ext-install pdo_sqlite gd

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /app

EXPOSE 8080

CMD ["sh", "-c", "composer install && php -S 0.0.0.0:8080 -t public public/router.php"]
