<?php

declare(strict_types=1);

namespace App\Config;

/**
 * UGNAYRA — Lightweight Environment Variable Loader
 * Parses .env files into putenv, $_ENV, and $_SERVER without third-party dependencies.
 */
class Env
{
    private static bool $loaded = false;

    public static function load(string $filePath): void
    {
        if (self::$loaded || !file_exists($filePath)) {
            return;
        }

        $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            return;
        }

        foreach ($lines as $line) {
            $line = trim($line);
            // Skip empty lines and comment lines
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }

            // Find first '=' character
            $eqPos = strpos($line, '=');
            if ($eqPos === false) {
                continue;
            }

            $key = trim(substr($line, 0, $eqPos));
            $val = trim(substr($line, $eqPos + 1));

            // Strip surrounding single or double quotes
            if (
                (str_starts_with($val, '"') && str_ends_with($val, '"')) ||
                (str_starts_with($val, "'") && str_ends_with($val, "'"))
            ) {
                $val = substr($val, 1, -1);
            }

            // Put into environment if not already set by host system
            if (getenv($key) === false) {
                putenv("{$key}={$val}");
            }
            if (!isset($_ENV[$key])) {
                $_ENV[$key] = $val;
            }
            if (!isset($_SERVER[$key])) {
                $_SERVER[$key] = $val;
            }
        }

        self::$loaded = true;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $val = $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key);
        if ($val === false || $val === null) {
            return $default;
        }

        // Cast common boolean and null representations
        $lower = strtolower((string)$val);
        if ($lower === 'true' || $lower === '(true)') {
            return true;
        }
        if ($lower === 'false' || $lower === '(false)') {
            return false;
        }
        if ($lower === 'null' || $lower === '(null)') {
            return null;
        }
        if ($lower === 'empty' || $lower === '(empty)') {
            return '';
        }

        return $val;
    }
}
