# PHP-FPM : même SAPI (fpm-fcgi) que le mutualisé OVH, version alignée sur la note d'hébergement.
FROM php:8.5-fpm

RUN docker-php-ext-install pdo_mysql

# pcov : couverture de code des tests lancés dans le conteneur. Absent de la production,
# donc désactivé par défaut ; activé à la demande (php -d pcov.enabled=1).
RUN pecl install pcov \
    && docker-php-ext-enable pcov \
    && echo 'pcov.enabled=0' > /usr/local/etc/php/conf.d/zz-pcov.ini
