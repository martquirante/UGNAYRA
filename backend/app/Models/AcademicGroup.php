<?php

declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Helpers\Security;
use PDO;

class AcademicGroup
{
    public static function create(array $data, string $creatorId): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return null;

        $pdo->beginTransaction();
        try {
            $convId = Security::generateUuid();
            $title = trim($data['name']);

            // 1. Create underlying conversation
            $pdo->prepare('INSERT INTO conversations (id, is_group, title) VALUES (:id, true, :title)')
                ->execute(['id' => $convId, 'title' => $title]);

            // 2. Add creator to conversation_members as admin
            $pdo->prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (:cid, :uid)')
                ->execute(['cid' => $convId, 'uid' => $creatorId]);

            // 3. Create academic_groups entry
            $groupId = Security::generateUuid();
            $gStmt = $pdo->prepare(
                'INSERT INTO academic_groups (id, conversation_id, name, description, avatar_url, group_type, privacy, join_policy, classroom_id, section_code, creator_id)
                 VALUES (:id, :cid, :name, :desc, :avatar, :type, :priv, :join_pol, :class_id, :sec, :creator)
                 RETURNING *'
            );
            $gStmt->execute([
                'id' => $groupId,
                'cid' => $convId,
                'name' => $title,
                'desc' => trim($data['description'] ?? ''),
                'avatar' => !empty($data['avatar_url']) ? trim($data['avatar_url']) : null,
                'type' => $data['group_type'] ?? 'personal',
                'priv' => $data['privacy'] ?? 'open',
                'join_pol' => $data['join_policy'] ?? 'open_link',
                'class_id' => $data['classroom_id'] ?? null,
                'sec' => !empty($data['section_code']) ? strtoupper(trim($data['section_code'])) : null,
                'creator' => $creatorId,
            ]);
            $group = $gStmt->fetch(PDO::FETCH_ASSOC);

            // 4. Add initial members if selected from directory
            if (!empty($data['member_ids']) && is_array($data['member_ids'])) {
                $mStmt = $pdo->prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (:cid, :uid) ON CONFLICT DO NOTHING');
                foreach ($data['member_ids'] as $mUid) {
                    if ($mUid !== $creatorId) {
                        $mStmt->execute(['cid' => $convId, 'uid' => $mUid]);
                    }
                }
            }

            // 5. Generate default invite token
            $token = 'ugn_' . bin2hex(random_bytes(16));
            $pdo->prepare('INSERT INTO group_invitations (id, group_id, token, created_by) VALUES (:id, :gid, :tok, :creator)')
                ->execute([
                    'id' => Security::generateUuid(),
                    'gid' => $groupId,
                    'tok' => $token,
                    'creator' => $creatorId,
                ]);

            $pdo->commit();
            $group['invite_token'] = $token;
            return $group;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    public static function listForUser(string $userId, ?string $type = null): array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return [];

        $sql = 'SELECT g.*, c.title AS conversation_title, c.last_message_preview, c.last_message_at,
                       (SELECT COUNT(*) FROM conversation_members cm2 WHERE cm2.conversation_id = g.conversation_id) AS member_count
                FROM academic_groups g
                JOIN conversations c ON c.id = g.conversation_id
                JOIN conversation_members cm ON cm.conversation_id = g.conversation_id AND cm.user_id = :uid
                WHERE g.is_archived = false';

        $params = ['uid' => $userId];
        if (!empty($type)) {
            $sql .= ' AND g.group_type = :type';
            $params['type'] = $type;
        }
        $sql .= ' ORDER BY c.last_message_at DESC NULLS LAST, g.created_at DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public static function findById(string $id, string $userId): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return null;

        $stmt = $pdo->prepare(
            'SELECT g.*, c.title AS conversation_title,
                    (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = g.conversation_id) AS member_count,
                    EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = g.conversation_id AND cm.user_id = :uid) AS is_member
             FROM academic_groups g
             JOIN conversations c ON c.id = g.conversation_id
             WHERE g.id = :id
             LIMIT 1'
        );
        $stmt->execute(['id' => $id, 'uid' => $userId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public static function findByToken(string $token): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return null;

        $stmt = $pdo->prepare(
            'SELECT gi.*, g.name AS group_name, g.description AS group_description, g.avatar_url, g.group_type, g.join_policy, g.conversation_id,
                    (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = g.conversation_id) AS member_count,
                    p.full_name AS creator_name
             FROM group_invitations gi
             JOIN academic_groups g ON g.id = gi.group_id
             JOIN profiles p ON p.id = g.creator_id
             WHERE gi.token = :tok AND gi.is_revoked = false
               AND (gi.expires_at IS NULL OR gi.expires_at > NOW())
               AND (gi.max_uses IS NULL OR gi.uses_count < gi.max_uses)
             LIMIT 1'
        );
        $stmt->execute(['tok' => trim($token)]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public static function joinViaToken(string $token, string $userId, string $note = ''): array
    {
        $invite = self::findByToken($token);
        if (!$invite) {
            return ['success' => false, 'error' => 'Invalid, expired, or exhausted invitation link.'];
        }

        $pdo = Database::getConnection();
        if ($pdo === null) return ['success' => false, 'error' => 'Database unavailable.'];

        // If open joining:
        if ($invite['join_policy'] === 'open_link') {
            $pdo->prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (:cid, :uid) ON CONFLICT DO NOTHING')
                ->execute(['cid' => $invite['conversation_id'], 'uid' => $userId]);

            $pdo->prepare('UPDATE group_invitations SET uses_count = uses_count + 1 WHERE id = :id')
                ->execute(['id' => $invite['id']]);

            return [
                'success' => true,
                'joined' => true,
                'conversation_id' => $invite['conversation_id'],
                'group_id' => $invite['group_id'],
                'group_name' => $invite['group_name'],
            ];
        }

        // If approval required:
        $reqId = Security::generateUuid();
        $stmt = $pdo->prepare(
            'INSERT INTO group_join_requests (id, group_id, user_id, request_note, status)
             VALUES (:id, :gid, :uid, :note, \'pending\')
             ON CONFLICT (group_id, user_id) DO UPDATE SET status = \'pending\', request_note = EXCLUDED.request_note
             RETURNING *'
        );
        $stmt->execute([
            'id' => $reqId,
            'gid' => $invite['group_id'],
            'uid' => $userId,
            'note' => trim($note),
        ]);

        return [
            'success' => true,
            'joined' => false,
            'pending_approval' => true,
            'message' => 'Join request sent. A group administrator will review your request.',
        ];
    }
}
