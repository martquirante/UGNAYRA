<?php

declare(strict_types=1);

namespace App\Config;

/**
 * UGNAYRA — Centralized Application Configuration
 */
class Config
{
    public static function app(): array
    {
        return [
            'name' => (string)Env::get('APP_NAME', 'UGNAYRA'),
            'env' => (string)Env::get('APP_ENV', 'development'),
            'debug' => (bool)Env::get('APP_DEBUG', true),
            'url' => (string)Env::get('APP_URL', 'http://localhost:8080'),
            'timezone' => (string)Env::get('APP_TIMEZONE', 'Asia/Manila'),
        ];
    }

    public static function corsOrigins(): array
    {
        $raw = (string)Env::get('FRONTEND_ORIGIN', 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5500,http://127.0.0.1:5500');
        $parts = array_map('trim', explode(',', $raw));
        return array_values(array_filter($parts, fn($o) => $o !== ''));
    }

    public static function database(): array
    {
        return [
            'connection' => (string)Env::get('DB_CONNECTION', 'pgsql'),
            'host' => (string)Env::get('DB_HOST', 'aws-0-ap-southeast-1.pooler.supabase.com'),
            'port' => (int)Env::get('DB_PORT', 5432),
            'database' => (string)Env::get('DB_DATABASE', 'postgres'),
            'username' => (string)Env::get('DB_USERNAME', 'postgres'),
            'password' => (string)Env::get('DB_PASSWORD', ''),
            'sslmode' => (string)Env::get('DB_SSLMODE', 'require'),
            'pool_mode' => (string)Env::get('DB_POOL_MODE', 'session'),
            'connect_timeout' => (int)Env::get('DB_CONNECT_TIMEOUT', 10),
        ];
    }

    public static function session(): array
    {
        return [
            'name' => (string)Env::get('SESSION_NAME', 'ugnayra_sid'),
            'lifetime' => (int)Env::get('SESSION_LIFETIME', 604800), // 7 days
            'secure' => (bool)Env::get('SESSION_SECURE', false),
            'httponly' => (bool)Env::get('SESSION_HTTP_ONLY', true),
            'samesite' => (string)Env::get('SESSION_SAME_SITE', 'Lax'),
            'secret_key' => (string)Env::get('APP_SECRET_KEY', 'ugnayra-default-secret-change-in-production-64char-hex'),
        ];
    }

    public static function rateLimits(): array
    {
        return [
            'auth_max' => (int)Env::get('RATE_LIMIT_AUTH_MAX', 15),
            'auth_window' => (int)Env::get('RATE_LIMIT_AUTH_WINDOW', 60),
            'api_max' => (int)Env::get('RATE_LIMIT_API_MAX', 180),
            'api_window' => (int)Env::get('RATE_LIMIT_API_WINDOW', 60),
        ];
    }

    public static function storage(): array
    {
        return [
            'driver' => (string)Env::get('STORAGE_DRIVER', 'local'),
            'max_bytes' => (int)Env::get('UPLOAD_MAX_BYTES', 5242880), // 5 MB
            'bucket' => (string)Env::get('SUPABASE_STORAGE_BUCKET', 'ugnayra-media'),
            'local_dir' => dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'uploads',
        ];
    }

    public static function supabase(): array
    {
        return [
            'url' => rtrim((string)Env::get('SUPABASE_URL', ''), '/'),
            'publishable_key' => (string)Env::get('SUPABASE_PUBLISHABLE_KEY', ''),
            'secret_key' => (string)Env::get('SUPABASE_SECRET_KEY', ''),
            'service_role_key' => (string)Env::get('SUPABASE_SERVICE_ROLE_KEY', ''),
        ];
    }

    public static function google(): array
    {
        return [
            'client_id' => trim((string)Env::get('GOOGLE_CLIENT_ID', '')),
        ];
    }

    public static function firebase(): array
    {
        return [
            'api_key' => trim((string)Env::get('FIREBASE_API_KEY', '')),
            'auth_domain' => trim((string)Env::get('FIREBASE_AUTH_DOMAIN', '')),
            'project_id' => trim((string)Env::get('FIREBASE_PROJECT_ID', '')),
            'storage_bucket' => trim((string)Env::get('FIREBASE_STORAGE_BUCKET', '')),
            'messaging_sender_id' => trim((string)Env::get('FIREBASE_MESSAGING_SENDER_ID', '')),
            'app_id' => trim((string)Env::get('FIREBASE_APP_ID', '')),
            'measurement_id' => trim((string)Env::get('FIREBASE_MEASUREMENT_ID', '')),
        ];
    }
}
