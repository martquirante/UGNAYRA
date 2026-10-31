<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * UGNAYRA — Cryptographic & Security Helpers
 */
class Security
{
    public static function hashPassword(string $password): string
    {
        return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    public static function verifyPassword(string $password, string $hash): bool
    {
        return password_verify($password, $hash);
    }

    public static function generateToken(int $bytes = 32): string
    {
        return bin2hex(random_bytes($bytes));
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    public static function generateUuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40); // set version to 0100 (v4)
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80); // set bits 6-7 to 10 (variant RFC 4122)

        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    public static function sanitizeString(?string $str): string
    {
        if ($str === null) {
            return '';
        }
        return trim(strip_tags($str));
    }
}
