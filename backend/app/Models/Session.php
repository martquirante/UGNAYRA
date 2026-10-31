<?php

declare(strict_types=1);

namespace App\Models;

use App\Config\Config;
use App\Config\Database;
use App\Helpers\Security;
use App\Services\SupabaseClient;
use PDO;

class Session
{
    public static function getCsrfTokenForSession(string $sessionToken): string
    {
        $secret = Config::session()['secret_key'] ?? Config::app()['secret_key'] ?? 'ugnayra_token_secret';
        return hash_hmac('sha256', 'ugnayra_csrf:' . $sessionToken, $secret);
    }

    public static function createSession(string $userId, string $ip, string $ua): array
    {
        $rawSessionToken = Security::generateToken(32);
        $rawCsrfToken = self::getCsrfTokenForSession($rawSessionToken);

        $sessionHash = Security::hashToken($rawSessionToken);
        $csrfHash = Security::hashToken($rawCsrfToken);

        $lifetime = Config::session()['lifetime'];
        $expiresAt = (new \DateTimeImmutable("+{$lifetime} seconds"))->format(\DateTimeInterface::ATOM);

        $id = Security::generateUuid();

        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $sql = 'INSERT INTO user_sessions (id, user_id, token_hash, csrf_token_hash, ip_address, user_agent, expires_at)
                    VALUES (:id, :uid, :shash, :chash, :ip, :ua, :exp)';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                'id' => $id,
                'uid' => $userId,
                'shash' => $sessionHash,
                'chash' => $csrfHash,
                'ip' => substr($ip, 0, 45),
                'ua' => substr($ua, 0, 255),
                'exp' => $expiresAt,
            ]);
        } else {
            $sb = new SupabaseClient();
            if ($sb->isConfigured()) {
                $sb->queryTable('user_sessions', [], 'POST', [
                    'id' => $id,
                    'user_id' => $userId,
                    'token_hash' => $sessionHash,
                    'csrf_token_hash' => $csrfHash,
                    'ip_address' => substr($ip, 0, 45),
                    'user_agent' => substr($ua, 0, 255),
                    'expires_at' => $expiresAt,
                ]);
            }
        }

        return [
            'session_token' => $rawSessionToken,
            'csrf_token' => $rawCsrfToken,
            'expires_at' => $expiresAt,
        ];
    }

    public static function findUserByToken(string $token): ?array
    {
        $hash = Security::hashToken($token);
        $pdo = Database::getConnection();

        if ($pdo !== null) {
            $sql = 'SELECT p.*, s.id AS active_session_id, s.csrf_token_hash
                    FROM user_sessions s
                    JOIN profiles p ON p.id = s.user_id
                    WHERE s.token_hash = :hash 
                      AND s.expires_at > NOW() 
                      AND p.is_active = true
                    LIMIT 1';
            $stmt = $pdo->prepare($sql);
            $stmt->execute(['hash' => $hash]);
            $res = $stmt->fetch();
            return $res ?: null;
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $now = (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM);
            $sessions = $sb->queryTable('user_sessions', [
                'token_hash' => 'eq.' . $hash,
                'expires_at' => 'gt.' . $now,
                'limit' => 1,
            ]);

            if (!empty($sessions) && isset($sessions[0]['user_id'])) {
                $user = User::findById($sessions[0]['user_id']);
                if ($user !== null) {
                    $user['active_session_id'] = $sessions[0]['id'];
                    $user['csrf_token_hash'] = $sessions[0]['csrf_token_hash'];
                    return $user;
                }
            }
        }

        return null;
    }

    public static function verifyCsrfToken(string $userId, string $csrfToken, ?string $sessionToken = null): bool
    {
        if (!empty($sessionToken) && hash_equals(self::getCsrfTokenForSession($sessionToken), $csrfToken)) {
            return true;
        }

        $hash = Security::hashToken($csrfToken);
        $pdo = Database::getConnection();

        if ($pdo !== null) {
            $sql = 'SELECT id FROM user_sessions 
                    WHERE user_id = :uid AND csrf_token_hash = :chash AND expires_at > NOW() 
                    LIMIT 1';
            $stmt = $pdo->prepare($sql);
            $stmt->execute(['uid' => $userId, 'chash' => $hash]);
            return (bool)$stmt->fetch();
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $now = (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM);
            $res = $sb->queryTable('user_sessions', [
                'user_id' => 'eq.' . $userId,
                'csrf_token_hash' => 'eq.' . $hash,
                'expires_at' => 'gt.' . $now,
                'limit' => 1,
            ]);
            return !empty($res);
        }

        return true; // Graceful fallback
    }

    public static function revokeSession(string $token): bool
    {
        $hash = Security::hashToken($token);
        $pdo = Database::getConnection();

        if ($pdo !== null) {
            $stmt = $pdo->prepare('DELETE FROM user_sessions WHERE token_hash = :hash');
            return $stmt->execute(['hash' => $hash]);
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $sb->queryTable('user_sessions', ['token_hash' => 'eq.' . $hash], 'DELETE');
            return true;
        }

        return false;
    }
}
