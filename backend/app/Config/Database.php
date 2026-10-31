<?php

declare(strict_types=1);

namespace App\Config;

use PDO;
use PDOException;
use App\Helpers\Logger;

/**
 * UGNAYRA — Database Connection Manager & PDO Singleton
 * Supports Supabase PostgreSQL via direct PDO (Session/Transaction Pooler)
 * with graceful error containment and health diagnostics.
 */
class Database
{
    private static ?PDO $instance = null;
    private static bool $connectionAttempted = false;
    private static ?string $lastError = null;

    public static function getConnection(): ?PDO
    {
        if (self::$instance !== null) {
            return self::$instance;
        }

        if (self::$connectionAttempted) {
            return null;
        }

        self::$connectionAttempted = true;
        $cfg = Config::database();

        // Check if database password has been provided
        if (empty($cfg['password']) || $cfg['password'] === 'your_database_password_here') {
            self::$lastError = 'Database password is not yet configured in backend/.env.';
            return null;
        }

        $dsn = sprintf(
            '%s:host=%s;port=%d;dbname=%s;sslmode=%s',
            $cfg['connection'],
            $cfg['host'],
            $cfg['port'],
            $cfg['database'],
            $cfg['sslmode']
        );

        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => ($cfg['pool_mode'] === 'transaction'),
            PDO::ATTR_TIMEOUT => $cfg['connect_timeout'],
        ];

        try {
            self::$instance = new PDO($dsn, $cfg['username'], $cfg['password'], $options);
            return self::$instance;
        } catch (PDOException $e) {
            self::$lastError = $e->getMessage();
            Logger::error('Database connection failed', ['error' => $e->getMessage()]);
            return null;
        }
    }

    public static function pdo(): PDO
    {
        $conn = self::getConnection();
        if ($conn === null) {
            throw new \RuntimeException(self::$lastError ?? 'Unable to establish database connection.');
        }
        return $conn;
    }

    public static function isConnected(): bool
    {
        try {
            $pdo = self::getConnection();
            if ($pdo === null) {
                return false;
            }
            $stmt = $pdo->query('SELECT 1');
            return $stmt !== false;
        } catch (\Throwable $e) {
            self::$lastError = $e->getMessage();
            return false;
        }
    }

    public static function getLastError(): ?string
    {
        return self::$lastError;
    }

    public static function reset(): void
    {
        self::$instance = null;
        self::$connectionAttempted = false;
        self::$lastError = null;
    }
}
