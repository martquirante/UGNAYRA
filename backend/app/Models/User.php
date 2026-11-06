<?php

declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Helpers\Security;
use App\Services\SupabaseClient;
use PDO;

class User
{
    public static function findById(string $id): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $stmt = $pdo->prepare('SELECT * FROM profiles WHERE id = :id AND is_active = true LIMIT 1');
            $stmt->execute(['id' => $id]);
            $u = $stmt->fetch();
            return $u ?: null;
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $res = $sb->queryTable('profiles', ['id' => 'eq.' . $id, 'is_active' => 'eq.true', 'limit' => 1]);
            return (!empty($res) && isset($res[0])) ? $res[0] : null;
        }

        return null;
    }

    public static function findByIdentifier(string $identifier): ?array
    {
        $clean = trim($identifier);
        $pdo = Database::getConnection();

        if ($pdo !== null) {
            $stmt = $pdo->prepare(
                'SELECT * FROM profiles 
                 WHERE (LOWER(email) = LOWER(:id1) OR LOWER(username) = LOWER(:id2) OR school_id_number = :id3) 
                   AND is_active = true 
                 LIMIT 1'
            );
            $stmt->execute(['id1' => $clean, 'id2' => $clean, 'id3' => $clean]);
            $u = $stmt->fetch();
            return $u ?: null;
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $res = $sb->queryTable('profiles', ['email' => 'ilike.' . $clean, 'is_active' => 'eq.true', 'limit' => 1]);
            if (empty($res)) {
                $res = $sb->queryTable('profiles', ['username' => 'ilike.' . $clean, 'is_active' => 'eq.true', 'limit' => 1]);
            }
            return (!empty($res) && isset($res[0])) ? $res[0] : null;
        }

        return null;
    }

    public static function findByUsername(string $username): ?array
    {
        $clean = trim($username);
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $stmt = $pdo->prepare('SELECT * FROM profiles WHERE LOWER(username) = LOWER(:u) AND is_active = true LIMIT 1');
            $stmt->execute(['u' => $clean]);
            $u = $stmt->fetch();
            return $u ?: null;
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $res = $sb->queryTable('profiles', ['username' => 'ilike.' . $clean, 'limit' => 1]);
            return (!empty($res) && isset($res[0])) ? $res[0] : null;
        }

        return null;
    }

    public static function create(array $data): ?array
    {
        $id = $data['id'] ?? Security::generateUuid();
        $hash = isset($data['password']) ? Security::hashPassword($data['password']) : ($data['password_hash'] ?? '');
        $prefsJson = isset($data['preferences']) && is_array($data['preferences']) 
            ? json_encode($data['preferences']) 
            : json_encode([
                'show_online_status' => true,
                'notify_comments' => true,
                'notify_likes' => true,
                'notify_messages' => true,
            ]);

        $params = [
            'id' => $id,
            'email' => strtolower(trim($data['email'])),
            'username' => strtolower(trim($data['username'])),
            'password_hash' => $hash,
            'full_name' => trim($data['full_name']),
            'role' => $data['role'] ?? 'student',
            'school_id_number' => !empty($data['school_id_number']) ? trim($data['school_id_number']) : null,
            'department' => trim($data['department'] ?? 'General Education'),
            'year_or_grade' => !empty($data['year_or_grade']) ? trim($data['year_or_grade']) : null,
            'section' => !empty($data['section']) ? trim($data['section']) : null,
            'bio' => !empty($data['bio']) ? trim($data['bio']) : '',
            'avatar_url' => !empty($data['avatar_url']) ? trim($data['avatar_url']) : null,
            'preferences' => $prefsJson,
        ];

        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $sql = 'INSERT INTO profiles (id, email, username, password_hash, full_name, role, school_id_number, department, year_or_grade, section, bio, avatar_url, preferences)
                    VALUES (:id, :email, :username, :password_hash, :full_name, :role, :school_id_number, :department, :year_or_grade, :section, :bio, :avatar_url, :preferences::jsonb)
                    RETURNING *';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetch() ?: null;
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $params['preferences'] = json_decode($prefsJson, true);
            $res = $sb->queryTable('profiles', [], 'POST', $params);
            return (!empty($res) && isset($res[0])) ? $res[0] : null;
        }

        return null;
    }

    public static function update(string $id, array $fields): ?array
    {
        $allowed = ['username', 'password_hash', 'role', 'is_active', 'school_id_number', 'full_name', 'department', 'year_or_grade', 'section', 'bio', 'avatar_url', 'cover_url', 'preferences', 'last_seen_at'];
        $updates = [];
        $params = ['id' => $id];

        foreach ($fields as $k => $v) {
            if (in_array($k, $allowed, true)) {
                if ($k === 'preferences' && is_array($v)) {
                    $updates[] = "preferences = :pref::jsonb";
                    $params['pref'] = json_encode($v);
                } else {
                    $updates[] = "{$k} = :{$k}";
                    $params[$k] = $v;
                }
            }
        }

        if (empty($updates)) {
            return self::findById($id);
        }

        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $sql = 'UPDATE profiles SET ' . implode(', ', $updates) . ', updated_at = NOW() WHERE id = :id RETURNING *';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetch() ?: null;
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $res = $sb->queryTable('profiles', ['id' => 'eq.' . $id], 'PATCH', $fields);
            return (!empty($res) && isset($res[0])) ? $res[0] : null;
        }

        return null;
    }

    public static function listActive(int $limit = 10, ?string $excludeId = null): array
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $sql = 'SELECT id, full_name, username, role, department, avatar_url, last_seen_at 
                    FROM profiles 
                    WHERE is_active = true' . ($excludeId ? ' AND id != :ex' : '') . '
                    ORDER BY last_seen_at DESC NULLS LAST, created_at DESC 
                    LIMIT :lim';
            $stmt = $pdo->prepare($sql);
            if ($excludeId) {
                $stmt->bindValue(':ex', $excludeId);
            }
            $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
            $stmt->execute();
            return $stmt->fetchAll() ?: [];
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $params = [
                'select' => 'id,full_name,username,role,department,avatar_url,last_seen_at',
                'is_active' => 'eq.true',
                'order' => 'last_seen_at.desc.nullslast',
                'limit' => $limit,
            ];
            if ($excludeId) {
                $params['id'] = 'neq.' . $excludeId;
            }
            return $sb->queryTable('profiles', $params) ?? [];
        }

        return [];
    }
}
