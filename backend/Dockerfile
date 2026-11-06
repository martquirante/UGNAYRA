FROM php:8.2-apache

# Install PostgreSQL client development libraries and image utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    libpng-dev \
    libjpeg-dev \
    libwebp-dev \
    libfreetype6-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
    && docker-php-ext-install -j$(nproc) pdo pdo_pgsql gd \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Configure Apache DocumentRoot to point to public/
ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf
RUN sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

# Enable Apache mod_rewrite for REST routing
RUN a2enmod rewrite headers

# Copy application files
WORKDIR /var/www/html
COPY . /var/www/html/

# Create runtime storage directories and grant write permissions
RUN mkdir -p storage/logs storage/rate_limits storage/uploads \
    && chown -R www-data:www-data storage \
    && chmod -R 775 storage

EXPOSE 80

CMD ["sh", "-c", "if [ \"$SEED_DEMO_ACCOUNTS\" = \"true\" ]; then php scripts/seed_demo_accounts.php; fi; exec apache2-foreground"]
