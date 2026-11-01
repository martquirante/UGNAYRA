<?php

declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Helpers\Security;
use App\Services\SupabaseClient;
use PDO;

class Conversation
{
    public static function listUserConversations(string $userId, int $limit = 30): array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) {
            $sb = new SupabaseClient();
            if ($sb->isConfigured()) {
                $memberships = $sb->queryTable('conversation_members', [
                    'user_id' => 'eq.' . $userId,
                    'limit' => $limit,
                ]) ?: [];
                if (empty($memberships)) {
                    return [];
                }
                $convList = [];
                foreach ($memberships as $mem) {
                    $cid = $mem['conversation_id'] ?? null;
                    if ($cid) {
                        $conv = self::findById($cid, $userId);
                        if ($conv) {
                            $convList[] = $conv;
                        }
                    }
                }
                return $convList;
            }
            return [];
        }

        $sql = "SELECT c.id, c.is_group, c.last_message_at, c.created_at,
                       m.body AS last_message_body,
                       m.created_at AS last_message_time,
                       m.sender_id AS last_message_sender_id,
                       peer.id AS peer_id,
                       peer.full_name AS peer_name,
                       peer.username AS peer_username,
                       peer.role AS peer_role,
                       peer.department AS peer_department,
                       peer.avatar_url AS peer_avatar,
                       peer.last_seen_at AS peer_last_seen,
                       my_mem.typing_until AS my_typing_until,
                       peer_mem.typing_until AS peer_typing_until,
                       (
                           SELECT COUNT(*) 
                           FROM messages unread_m 
                           WHERE unread_m.conversation_id = c.id 
                             AND unread_m.sender_id != :uid1
                             AND (my_mem.last_read_message_id IS NULL OR unread_m.created_at > (
                                 SELECT created_at FROM messages WHERE id = my_mem.last_read_message_id
                             ))
                       ) AS unread_count
                FROM conversations c
                JOIN conversation_members my_mem ON my_mem.conversation_id = c.id AND my_mem.user_id = :uid2
                LEFT JOIN conversation_members peer_mem ON peer_mem.conversation_id = c.id AND peer_mem.user_id != :uid3
                LEFT JOIN profiles peer ON peer.id = peer_mem.user_id
                LEFT JOIN LATERAL (
                    SELECT body, created_at, sender_id 
                    FROM messages 
                    WHERE conversation_id = c.id 
                    ORDER BY created_at DESC 
                    LIMIT 1
                ) m ON true
                ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
                LIMIT :lim";

        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':uid1', $userId);
        $stmt->bindValue(':uid2', $userId);
        $stmt->bindValue(':uid3', $userId);
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();

        return array_map(function ($r) use ($userId) {
            $isTyping = !empty($r['peer_typing_until']) && strtotime($r['peer_typing_until']) > time();
            return [
                'id' => $r['id'],
                'is_group' => (bool)$r['is_group'],
                'unread_count' => (int)($r['unread_count'] ?? 0),
                'last_message' => !empty($r['last_message_body']) ? [
                    'body' => $r['last_message_body'],
                    'created_at' => $r['last_message_time'],
                    'is_mine' => ($r['last_message_sender_id'] === $userId),
                ] : null,
                'peer' => !empty($r['peer_id']) ? [
                    'id' => $r['peer_id'],
                    'full_name' => $r['peer_name'] ?? 'Classmate',
                    'username' => $r['peer_username'] ?? 'user',
                    'role' => $r['peer_role'] ?? 'student',
                    'department' => $r['peer_department'] ?? null,
                    'avatar_url' => $r['peer_avatar'] ?? null,
                    'last_seen_at' => $r['peer_last_seen'] ?? null,
                    'is_online' => !empty($r['peer_last_seen']) && (time() - strtotime($r['peer_last_seen']) < 180),
                    'is_typing' => $isTyping,
                ] : null,
            ];
        }, $rows);
    }

    public static function getOrCreateDirect(string $user1, string $user2): ?array
    {
        if ($user1 === $user2) {
            return null;
        }

        $minId = min($user1, $user2);
        $maxId = max($user1, $user2);
        $directKey = $minId . ':' . $maxId;

        $pdo = Database::getConnection();
        if ($pdo === null) {
            $sb = new SupabaseClient();
            if ($sb->isConfigured()) {
                $existing = $sb->queryTable('conversations', ['direct_key' => 'eq.' . $directKey, 'limit' => 1]);
                if (!empty($existing) && isset($existing[0]['id'])) {
                    return self::findById($existing[0]['id'], $user1);
                }
                $id = Security::generateUuid();
                $now = (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM);
                $sb->queryTable('conversations', [], 'POST', [
                    'id' => $id,
                    'is_group' => false,
                    'direct_key' => $directKey,
                    'created_at' => $now,
                    'last_message_at' => $now,
                ]);
                $sb->queryTable('conversation_members', [], 'POST', [
                    ['conversation_id' => $id, 'user_id' => $user1],
                    ['conversation_id' => $id, 'user_id' => $user2],
                ]);
                return self::findById($id, $user1);
            }
            return null;
        }

        // Check if conversation already exists
        $stmt = $pdo->prepare('SELECT id FROM conversations WHERE direct_key = :k LIMIT 1');
        $stmt->execute(['k' => $directKey]);
        $existing = $stmt->fetch();

        if ($existing) {
            return self::findById($existing['id'], $user1);
        }

        // Create new conversation
        $id = Security::generateUuid();
        $pdo->beginTransaction();
        try {
            $ins = $pdo->prepare('INSERT INTO conversations (id, is_group, direct_key) VALUES (:id, false, :k)');
            $ins->execute(['id' => $id, 'k' => $directKey]);

            $mem = $pdo->prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (:cid, :uid)');
            $mem->execute(['cid' => $id, 'uid' => $user1]);
            $mem->execute(['cid' => $id, 'uid' => $user2]);

            $pdo->commit();
            return self::findById($id, $user1);
        } catch (\Throwable $e) {
            $pdo->rollBack();
            // In case of race condition, re-query by directKey
            $re = $pdo->prepare('SELECT id FROM conversations WHERE direct_key = :k LIMIT 1');
            $re->execute(['k' => $directKey]);
            $found = $re->fetch();
            return $found ? self::findById($found['id'], $user1) : null;
        }
    }

    public static function findById(string $id, string $currentUserId): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) {
            $sb = new SupabaseClient();
            if ($sb->isConfigured()) {
                $convs = $sb->queryTable('conversations', ['id' => 'eq.' . $id, 'limit' => 1]);
                if (empty($convs)) {
                    return null;
                }
                $c = $convs[0];
                $members = $sb->queryTable('conversation_members', ['conversation_id' => 'eq.' . $id]) ?: [];
                $peerId = null;
                $peerMem = null;
                foreach ($members as $m) {
                    if (($m['user_id'] ?? '') !== $currentUserId) {
                        $peerId = $m['user_id'];
                        $peerMem = $m;
                        break;
                    }
                }
                $peer = $peerId ? User::findById($peerId) : null;
                $isTyping = !empty($peerMem['typing_until']) && strtotime($peerMem['typing_until']) > time();
                return [
                    'id' => $c['id'],
                    'is_group' => (bool)($c['is_group'] ?? false),
                    'peer' => $peer ? [
                        'id' => $peer['id'],
                        'full_name' => $peer['full_name'] ?? 'Classmate',
                        'username' => $peer['username'] ?? 'user',
                        'role' => $peer['role'] ?? 'student',
                        'department' => $peer['department'] ?? null,
                        'avatar_url' => $peer['avatar_url'] ?? null,
                        'last_seen_at' => $peer['last_seen_at'] ?? null,
                        'is_online' => !empty($peer['last_seen_at']) && (time() - strtotime($peer['last_seen_at']) < 180),
                        'is_typing' => $isTyping,
                    ] : null,
                ];
            }
            return null;
        }

        $sql = "SELECT c.id, c.is_group, c.last_message_at, c.created_at,
                       peer.id AS peer_id,
                       peer.full_name AS peer_name,
                       peer.username AS peer_username,
                       peer.role AS peer_role,
                       peer.department AS peer_department,
                       peer.avatar_url AS peer_avatar,
                       peer.last_seen_at AS peer_last_seen,
                       peer_mem.typing_until AS peer_typing_until
                FROM conversations c
                JOIN conversation_members my_mem ON my_mem.conversation_id = c.id AND my_mem.user_id = :uid1
                LEFT JOIN conversation_members peer_mem ON peer_mem.conversation_id = c.id AND peer_mem.user_id != :uid2
                LEFT JOIN profiles peer ON peer.id = peer_mem.user_id
                WHERE c.id = :cid
                LIMIT 1";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            'cid' => $id,
            'uid1' => $currentUserId,
            'uid2' => $currentUserId,
        ]);
        $r = $stmt->fetch();
        if (!$r) {
            return null;
        }

        $isTyping = !empty($r['peer_typing_until']) && strtotime($r['peer_typing_until']) > time();
        return [
            'id' => $r['id'],
            'is_group' => (bool)$r['is_group'],
            'peer' => !empty($r['peer_id']) ? [
                'id' => $r['peer_id'],
                'full_name' => $r['peer_name'] ?? 'Classmate',
                'username' => $r['peer_username'] ?? 'user',
                'role' => $r['peer_role'] ?? 'student',
                'department' => $r['peer_department'] ?? null,
                'avatar_url' => $r['peer_avatar'] ?? null,
                'last_seen_at' => $r['peer_last_seen'] ?? null,
                'is_online' => !empty($r['peer_last_seen']) && (time() - strtotime($r['peer_last_seen']) < 180),
                'is_typing' => $isTyping,
            ] : null,
        ];
    }
}
