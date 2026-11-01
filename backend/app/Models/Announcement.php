<?php

declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Helpers\Security;
use App\Services\SupabaseClient;
use PDO;

class Announcement
{
    public static function listAnnouncements(?string $category = null, int $limit = 30): array
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $where = ['1=1'];
            $params = [];

            if ($category !== null && $category !== '' && $category !== 'all') {
                $where[] = 'a.category = :cat';
                $params['cat'] = $category;
            }

            $whereSql = implode(' AND ', $where);

            $sql = "SELECT a.*,
                           u.full_name AS author_name,
                           u.username AS author_username,
                           u.role AS author_role,
                           u.department AS author_department,
                           u.avatar_url AS author_avatar
                    FROM announcements a
                    JOIN profiles u ON u.id = a.author_id
                    WHERE {$whereSql}
                    ORDER BY a.is_pinned DESC, 
                             CASE a.priority WHEN 'urgent' THEN 1 WHEN 'important' THEN 2 ELSE 3 END,
                             a.published_at DESC
                    LIMIT :lim";

            $stmt = $pdo->prepare($sql);
            foreach ($params as $k => $v) {
                $stmt->bindValue(':' . $k, $v);
            }
            $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll();

            return array_map(function ($r) {
                return [
                    'id' => $r['id'],
                    'title' => $r['title'],
                    'body' => $r['body'],
                    'category' => $r['category'],
                    'priority' => $r['priority'],
                    'target_department' => $r['target_department'] ?? null,
                    'is_pinned' => (bool)$r['is_pinned'],
                    'published_at' => $r['published_at'] ?? $r['created_at'],
                    'author' => [
                        'id' => $r['author_id'],
                        'full_name' => $r['author_name'] ?? 'School Office',
                        'role' => $r['author_role'] ?? 'personnel',
                        'department' => $r['author_department'] ?? null,
                        'avatar_url' => $r['author_avatar'] ?? null,
                    ],
                ];
            }, $rows);
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            return $sb->queryTable('announcements', ['order' => 'published_at.desc', 'limit' => $limit]) ?? [];
        }

        return [];
    }

    public static function create(array $data): ?array
    {
        $id = $data['id'] ?? Security::generateUuid();
        $pdo = Database::getConnection();

        $params = [
            'id' => $id,
            'author_id' => $data['author_id'],
            'title' => trim($data['title']),
            'body' => trim($data['body']),
            'category' => $data['category'],
            'priority' => $data['priority'],
            'target_department' => !empty($data['target_department']) ? trim($data['target_department']) : null,
            'is_pinned' => !empty($data['is_pinned']),
        ];

        if ($pdo !== null) {
            $sql = 'INSERT INTO announcements (id, author_id, title, body, category, priority, target_department, is_pinned)
                    VALUES (:id, :author_id, :title, :body, :category, :priority, :target_department, :is_pinned)
                    RETURNING *';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $a = $stmt->fetch();

            $u = User::findById($data['author_id']);
            return [
                'id' => $id,
                'title' => $params['title'],
                'body' => $params['body'],
                'category' => $params['category'],
                'priority' => $params['priority'],
                'target_department' => $params['target_department'],
                'is_pinned' => $params['is_pinned'],
                'published_at' => $a['published_at'] ?? (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM),
                'author' => [
                    'id' => $data['author_id'],
                    'full_name' => $u['full_name'] ?? 'School Faculty',
                    'role' => $u['role'] ?? 'teacher',
                    'department' => $u['department'] ?? null,
                ],
            ];
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $now = (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM);
            $insertData = array_merge($params, ['published_at' => $now]);
            $res = $sb->queryTable('announcements', [], 'POST', $insertData);
            $a = (!empty($res) && isset($res[0])) ? $res[0] : $insertData;
            $u = User::findById($data['author_id']);
            return [
                'id' => $id,
                'title' => $params['title'],
                'body' => $params['body'],
                'category' => $params['category'],
                'priority' => $params['priority'],
                'target_department' => $params['target_department'],
                'is_pinned' => $params['is_pinned'],
                'published_at' => $a['published_at'] ?? $now,
                'author' => [
                    'id' => $data['author_id'],
                    'full_name' => $u['full_name'] ?? 'School Faculty',
                    'role' => $u['role'] ?? 'teacher',
                    'department' => $u['department'] ?? null,
                ],
            ];
        }

        return null;
    }

    public static function delete(string $id): bool
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $stmt = $pdo->prepare('DELETE FROM announcements WHERE id = :id');
            return $stmt->execute(['id' => $id]);
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $sb->queryTable('announcements', ['id' => 'eq.' . $id], 'DELETE');
            return true;
        }

        return false;
    }

    public static function findById(string $id): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $stmt = $pdo->prepare('SELECT * FROM announcements WHERE id = :id LIMIT 1');
            $stmt->execute(['id' => $id]);
            return $stmt->fetch() ?: null;
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $res = $sb->queryTable('announcements', ['id' => 'eq.' . $id, 'limit' => 1]);
            return (!empty($res) && isset($res[0])) ? $res[0] : null;
        }

        return null;
    }
}
