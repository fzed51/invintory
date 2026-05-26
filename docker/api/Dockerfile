FROM php:8.3-cli-alpine

# Install SQLite extension (for PDO SQLite)
RUN docker-php-ext-install pdo_sqlite

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /app

EXPOSE 8080

CMD ["sh", "-c", "composer install && php -S 0.0.0.0:8080 -t public public/router.php"]
