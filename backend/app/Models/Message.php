<?php

declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Helpers\Security;
use App\Services\SupabaseClient;
use PDO;

class Message
{
    public static function listMessages(
        string $conversationId,
        ?string $afterTimestamp = null,
        ?string $beforeCursor = null,
        int $limit = 40
    ): array {
        $pdo = Database::getConnection();
        if ($pdo === null) {
            return [];
        }

        $where = ['m.conversation_id = :cid'];
        $params = ['cid' => $conversationId];

        if ($afterTimestamp !== null && $afterTimestamp !== '') {
            $where[] = 'm.created_at > :after';
            $params['after'] = $afterTimestamp;
        }

        if ($beforeCursor !== null && $beforeCursor !== '') {
            $where[] = 'm.created_at < :before';
            $params['before'] = $beforeCursor;
        }

        $whereSql = implode(' AND ', $where);

        $sql = "SELECT m.*,
                       u.full_name AS sender_name,
                       u.avatar_url AS sender_avatar
                FROM messages m
                JOIN profiles u ON u.id = m.sender_id
                WHERE {$whereSql}
                ORDER BY m.created_at DESC
                LIMIT :lim";

        $stmt = $pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue(':' . $k, $v);
        }
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();

        // Sort ascending chronologically for UI display
        $rows = array_reverse($rows);

        return array_map(function ($r) {
            return [
                'id' => $r['id'],
                'conversation_id' => $r['conversation_id'],
                'sender_id' => $r['sender_id'],
                'body' => $r['body'],
                'attachment_url' => $r['attachment_url'],
                'created_at' => $r['created_at'],
                'sender' => [
                    'id' => $r['sender_id'],
                    'full_name' => $r['sender_name'] ?? 'Classmate',
                    'avatar_url' => $r['sender_avatar'] ?? null,
                ],
            ];
        }, $rows);
    }

    public static function create(string $conversationId, string $senderId, ?string $body, ?string $attachmentUrl = null): ?array
    {
        $id = Security::generateUuid();
        $pdo = Database::getConnection();

        if ($pdo !== null) {
            $pdo->beginTransaction();
            try {
                $sql = 'INSERT INTO messages (id, conversation_id, sender_id, body, attachment_url)
                        VALUES (:id, :cid, :sid, :body, :att)
                        RETURNING *';
                $stmt = $pdo->prepare($sql);
                $stmt->execute([
                    'id' => $id,
                    'cid' => $conversationId,
                    'sid' => $senderId,
                    'body' => $body,
                    'att' => $attachmentUrl,
                ]);
                $msg = $stmt->fetch();

                // Update conversation's last_message_at
                $upd = $pdo->prepare('UPDATE conversations SET last_message_at = NOW() WHERE id = :cid');
                $upd->execute(['cid' => $conversationId]);

                // Also update sender's last_read_message_id to this message
                $read = $pdo->prepare('UPDATE conversation_members SET last_read_message_id = :mid, last_read_at = NOW() WHERE conversation_id = :cid AND user_id = :uid');
                $read->execute(['mid' => $id, 'cid' => $conversationId, 'uid' => $senderId]);

                $pdo->commit();

                $u = User::findById($senderId);
                return [
                    'id' => $id,
                    'conversation_id' => $conversationId,
                    'sender_id' => $senderId,
                    'body' => $body,
                    'attachment_url' => $attachmentUrl,
                    'created_at' => $msg['created_at'] ?? (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM),
                    'sender' => [
                        'id' => $senderId,
                        'full_name' => $u['full_name'] ?? 'Classmate',
                        'avatar_url' => $u['avatar_url'] ?? null,
                    ],
                ];
            } catch (\Throwable $e) {
                $pdo->rollBack();
                return null;
            }
        }

        return null;
    }

    public static function markRead(string $conversationId, string $userId): bool
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $sql = 'UPDATE conversation_members 
                    SET last_read_message_id = (
                        SELECT id FROM messages WHERE conversation_id = :cid ORDER BY created_at DESC LIMIT 1
                    ),
                    last_read_at = NOW()
                    WHERE conversation_id = :cid AND user_id = :uid';
            $stmt = $pdo->prepare($sql);
            return $stmt->execute(['cid' => $conversationId, 'uid' => $userId]);
        }
        return false;
    }

    public static function setTyping(string $conversationId, string $userId, int $seconds = 6): bool
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $sql = "UPDATE conversation_members 
                    SET typing_until = NOW() + (:sec || ' seconds')::INTERVAL
                    WHERE conversation_id = :cid AND user_id = :uid";
            $stmt = $pdo->prepare($sql);
            return $stmt->execute(['sec' => (string)$seconds, 'cid' => $conversationId, 'uid' => $userId]);
        }
        return false;
    }
}
