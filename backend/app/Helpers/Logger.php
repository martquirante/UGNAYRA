<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * UGNAYRA — Sanitized Diagnostic File Logger
 */
class Logger
{
    private static ?string $logFile = null;

    private static function getPath(): string
    {
        if (self::$logFile === null) {
            $dir = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'logs';
            if (!is_dir($dir)) {
                @mkdir($dir, 0755, true);
            }
            self::$logFile = $dir . DIRECTORY_SEPARATOR . 'app.log';
        }
        return self::$logFile;
    }

    public static function info(string $message, array $context = []): void
    {
        self::log('INFO', $message, $context);
    }

    public static function warning(string $message, array $context = []): void
    {
        self::log('WARNING', $message, $context);
    }

    public static function error(string $message, array $context = []): void
    {
        self::log('ERROR', $message, $context);
    }

    private static function log(string $level, string $message, array $context = []): void
    {
        $sanitized = self::sanitizeContext($context);
        $time = (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Manila')))->format('Y-m-d H:i:s');
        $json = empty($sanitized) ? '' : ' ' . json_encode($sanitized, JSON_UNESCAPED_SLASHES);
        $entry = sprintf("[%s] [%s] %s%s\n", $time, $level, $message, $json);

        @file_put_contents(self::getPath(), $entry, FILE_APPEND | LOCK_EX);
    }

    private static function sanitizeContext(array $data): array
    {
        $redactedKeys = ['password', 'password_confirmation', 'token', 'csrf_token', 'secret', 'key', 'service_role_key'];
        $clean = [];

        foreach ($data as $k => $v) {
            if (is_array($v)) {
                $clean[$k] = self::sanitizeContext($v);
            } elseif (in_array(strtolower((string)$k), $redactedKeys, true)) {
                $clean[$k] = '***REDACTED***';
            } else {
                $clean[$k] = $v;
            }
        }

        return $clean;
    }
}
