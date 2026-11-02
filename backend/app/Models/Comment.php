<?php

declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Helpers\Security;
use App\Services\SupabaseClient;
use PDO;

class Comment
{
    public static function listForPost(string $postId, int $limit = 50): array
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $sql = 'SELECT c.*,
                           u.full_name AS author_name,
                           u.username AS author_username,
                           u.role AS author_role,
                           u.avatar_url AS author_avatar
                    FROM comments c
                    JOIN profiles u ON u.id = c.author_id
                    WHERE c.post_id = :pid
                    ORDER BY c.created_at ASC
                    LIMIT :lim';
            $stmt = $pdo->prepare($sql);
            $stmt->bindValue(':pid', $postId);
            $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll();

            return array_map(function ($r) {
                return [
                    'id' => $r['id'],
                    'post_id' => $r['post_id'],
                    'parent_comment_id' => $r['parent_comment_id'] ?? null,
                    'content' => $r['content'],
                    'created_at' => $r['created_at'],
                    'author' => [
                        'id' => $r['author_id'],
                        'full_name' => $r['author_name'] ?? 'Classmate',
                        'username' => $r['author_username'] ?? 'user',
                        'role' => $r['author_role'] ?? 'student',
                        'avatar_url' => $r['author_avatar'] ?? null,
                    ],
                ];
            }, $rows);
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $rows = $sb->queryTable('comments', [
                'select' => '*,author:profiles!comments_author_id_fkey(id,full_name,username,role,avatar_url)',
                'post_id' => 'eq.' . $postId,
                'order' => 'created_at.asc',
                'limit' => $limit,
            ]);
            return $rows ?? [];
        }

        return [];
    }

    public static function create(array $data): ?array
    {
        $id = $data['id'] ?? Security::generateUuid();
        $pdo = Database::getConnection();

        $params = [
            'id' => $id,
            'post_id' => $data['post_id'],
            'author_id' => $data['author_id'],
            'parent_comment_id' => !empty($data['parent_comment_id']) ? $data['parent_comment_id'] : null,
            'content' => $data['content'],
        ];

        if ($pdo !== null) {
            $sql = 'INSERT INTO comments (id, post_id, author_id, parent_comment_id, content)
                    VALUES (:id, :post_id, :author_id, :parent_comment_id, :content)
                    RETURNING *';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $row = $stmt->fetch();

            $u = User::findById($data['author_id']);
            return [
                'id' => $id,
                'post_id' => $data['post_id'],
                'content' => $data['content'],
                'created_at' => $row['created_at'] ?? (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM),
                'author' => [
                    'id' => $u['id'] ?? $data['author_id'],
                    'full_name' => $u['full_name'] ?? 'Classmate',
                    'username' => $u['username'] ?? 'user',
                    'role' => $u['role'] ?? 'student',
                    'avatar_url' => $u['avatar_url'] ?? null,
                ],
            ];
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $res = $sb->queryTable('comments', [], 'POST', $params);
            $createdRow = (!empty($res) && isset($res[0])) ? $res[0] : null;
            if ($createdRow !== null) {
                $u = User::findById($data['author_id']);
                $createdRow['author'] = [
                    'id' => $u['id'] ?? $data['author_id'],
                    'full_name' => $u['full_name'] ?? 'Campus Member',
                    'username' => $u['username'] ?? 'user',
                    'role' => $u['role'] ?? 'student',
                    'avatar_url' => $u['avatar_url'] ?? null,
                    'department' => $u['department'] ?? null,
                ];
                return $createdRow;
            }
            return null;
        }

        return null;
    }

    public static function delete(string $id): bool
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $stmt = $pdo->prepare('DELETE FROM comments WHERE id = :id');
            return $stmt->execute(['id' => $id]);
        }
        return false;
    }

    public static function findById(string $id): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $stmt = $pdo->prepare('SELECT * FROM comments WHERE id = :id LIMIT 1');
            $stmt->execute(['id' => $id]);
            return $stmt->fetch() ?: null;
        }
        return null;
    }
}
