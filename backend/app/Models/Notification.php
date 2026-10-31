<?php

declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Helpers\Security;
use App\Services\SupabaseClient;
use PDO;

class Notification
{
    public static function listForUser(string $userId, string $filter = 'all', int $limit = 40): array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) {
            return ['items' => [], 'unread_count' => 0];
        }

        $where = ['n.recipient_id = :uid'];
        $params = ['uid' => $userId];

        if ($filter === 'unread') {
            $where[] = 'n.is_read = false';
        }

        $whereSql = implode(' AND ', $where);

        $sql = "SELECT n.*,
                       u.full_name AS actor_name,
                       u.avatar_url AS actor_avatar
                FROM notifications n
                LEFT JOIN profiles u ON u.id = n.actor_id
                WHERE {$whereSql}
                ORDER BY n.created_at DESC
                LIMIT :lim";

        $stmt = $pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue(':' . $k, $v);
        }
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();

        // Get unread count
        $cntStmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE recipient_id = :uid AND is_read = false');
        $cntStmt->execute(['uid' => $userId]);
        $unreadCount = (int)$cntStmt->fetchColumn();

        $items = array_map(function ($r) {
            return [
                'id' => $r['id'],
                'type' => $r['type'],
                'entity_type' => $r['entity_type'] ?? null,
                'entity_id' => $r['entity_id'] ?? null,
                'title' => $r['title'],
                'preview' => $r['preview'] ?? null,
                'is_read' => (bool)$r['is_read'],
                'created_at' => $r['created_at'],
                'actor' => !empty($r['actor_id']) ? [
                    'id' => $r['actor_id'],
                    'full_name' => $r['actor_name'] ?? 'Classmate',
                    'avatar_url' => $r['actor_avatar'] ?? null,
                ] : null,
            ];
        }, $rows);

        return [
            'items' => $items,
            'unread_count' => $unreadCount,
        ];
    }

    public static function create(array $data): ?array
    {
        $id = $data['id'] ?? Security::generateUuid();
        $pdo = Database::getConnection();

        $params = [
            'id' => $id,
            'recipient_id' => $data['recipient_id'],
            'actor_id' => !empty($data['actor_id']) ? $data['actor_id'] : null,
            'type' => $data['type'],
            'entity_type' => $data['entity_type'] ?? null,
            'entity_id' => !empty($data['entity_id']) ? $data['entity_id'] : null,
            'title' => $data['title'],
            'preview' => $data['preview'] ?? null,
        ];

        if ($pdo !== null) {
            $sql = 'INSERT INTO notifications (id, recipient_id, actor_id, type, entity_type, entity_id, title, preview)
                    VALUES (:id, :recipient_id, :actor_id, :type, :entity_type, :entity_id, :title, :preview)';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $params;
        }

        return null;
    }

    public static function markRead(string $id, string $userId): bool
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $stmt = $pdo->prepare('UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = :id AND recipient_id = :uid');
            return $stmt->execute(['id' => $id, 'uid' => $userId]);
        }
        return false;
    }

    public static function markAllRead(string $userId): bool
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $stmt = $pdo->prepare('UPDATE notifications SET is_read = true, read_at = NOW() WHERE recipient_id = :uid AND is_read = false');
            return $stmt->execute(['uid' => $userId]);
        }
        return false;
    }

    public static function getUnreadCount(string $userId): int
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE recipient_id = :uid AND is_read = false');
            $stmt->execute(['uid' => $userId]);
            return (int)$stmt->fetchColumn();
        }
        return 0;
    }
}
