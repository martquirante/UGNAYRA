<?php

declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Helpers\Security;
use App\Services\SupabaseClient;
use PDO;

class Community
{
    public static function listCommunities(?string $currentUserId, string $filter = 'all', int $limit = 30): array
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $where = ['1=1'];
            $params = [];

            if ($filter === 'joined' && $currentUserId) {
                $where[] = 'EXISTS (SELECT 1 FROM community_members cm WHERE cm.community_id = c.id AND cm.user_id = :uid)';
                $params['uid'] = $currentUserId;
            } elseif ($filter === 'discover' && $currentUserId) {
                $where[] = 'NOT EXISTS (SELECT 1 FROM community_members cm WHERE cm.community_id = c.id AND cm.user_id = :uid)';
                $params['uid'] = $currentUserId;
            } elseif ($filter !== 'all') {
                $where[] = 'c.category = :cat';
                $params['cat'] = $filter;
            }

            $whereSql = implode(' AND ', $where);

            $sql = "SELECT c.*,
                           EXISTS (
                               SELECT 1 FROM community_members cm 
                               WHERE cm.community_id = c.id AND cm.user_id = :chkUid
                           ) AS is_member
                    FROM communities c
                    WHERE {$whereSql}
                    ORDER BY c.members_count DESC, c.name ASC
                    LIMIT :lim";

            $stmt = $pdo->prepare($sql);
            $stmt->bindValue(':chkUid', $currentUserId ?? '00000000-0000-0000-0000-000000000000');
            $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);

            foreach ($params as $k => $v) {
                $stmt->bindValue(':' . $k, $v);
            }

            $stmt->execute();
            $rows = $stmt->fetchAll();

            return array_map(function ($r) {
                $r['members_count'] = (int)($r['members_count'] ?? 0);
                $r['posts_count'] = (int)($r['posts_count'] ?? 0);
                $r['is_member'] = (bool)($r['is_member'] ?? false);
                return $r;
            }, $rows);
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            return $sb->queryTable('communities', ['order' => 'members_count.desc', 'limit' => $limit]) ?? [];
        }

        return [];
    }

    public static function findBySlugOrId(string $slugOrId, ?string $currentUserId = null): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $isUuid = preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $slugOrId);
            $whereCol = $isUuid ? 'c.id = :val' : 'c.slug = :val';

            $sql = "SELECT c.*,
                           cm.member_role,
                           (cm.user_id IS NOT NULL) AS is_member
                    FROM communities c
                    LEFT JOIN community_members cm ON cm.community_id = c.id AND cm.user_id = :uid
                    WHERE {$whereCol}
                    LIMIT 1";

            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                'val' => $slugOrId,
                'uid' => $currentUserId ?? '00000000-0000-0000-0000-000000000000',
            ]);
            $row = $stmt->fetch();
            if (!$row) {
                return null;
            }

            $row['members_count'] = (int)($row['members_count'] ?? 0);
            $row['posts_count'] = (int)($row['posts_count'] ?? 0);
            $row['is_member'] = (bool)($row['is_member'] ?? false);
            return $row;
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $isUuid = preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $slugOrId);
            $filter = $isUuid ? ['id' => 'eq.' . $slugOrId] : ['slug' => 'eq.' . $slugOrId];
            $rows = $sb->queryTable('communities', array_merge($filter, ['limit' => 1]));
            if (!empty($rows) && isset($rows[0])) {
                $c = $rows[0];
                $isMember = false;
                $memberRole = null;
                if (!empty($currentUserId)) {
                    $m = $sb->queryTable('community_members', [
                        'community_id' => 'eq.' . $c['id'],
                        'user_id' => 'eq.' . $currentUserId,
                        'limit' => 1,
                    ]);
                    if (!empty($m) && isset($m[0])) {
                        $isMember = true;
                        $memberRole = $m[0]['member_role'] ?? 'member';
                    }
                }
                $c['members_count'] = (int)($c['members_count'] ?? 0);
                $c['posts_count'] = (int)($c['posts_count'] ?? 0);
                $c['is_member'] = $isMember;
                $c['member_role'] = $memberRole;
                return $c;
            }
        }

        return null;
    }

    public static function create(array $data): ?array
    {
        $id = $data['id'] ?? Security::generateUuid();
        $slugBase = strtolower(trim(preg_replace('/[^A-Za-z0-9-]+/', '-', $data['name']), '-'));
        $slug = $slugBase . '-' . substr(bin2hex(random_bytes(2)), 0, 4);

        $params = [
            'id' => $id,
            'slug' => $slug,
            'name' => trim($data['name']),
            'category' => $data['category'],
            'description' => trim($data['description']),
            'privacy' => $data['privacy'] ?? 'public',
            'created_by' => $data['created_by'],
        ];

        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $sql = 'INSERT INTO communities (id, slug, name, category, description, privacy, created_by)
                    VALUES (:id, :slug, :name, :category, :description, :privacy, :created_by)
                    RETURNING *';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $c = $stmt->fetch();

            // Creator becomes admin member
            self::join($id, $data['created_by'], 'admin');
            return self::findBySlugOrId($id, $data['created_by']);
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $res = $sb->queryTable('communities', [], 'POST', $params);
            if (!empty($res) && isset($res[0])) {
                self::join($id, $data['created_by'], 'admin');
                return self::findBySlugOrId($id, $data['created_by']);
            }
        }

        return null;
    }

    public static function join(string $communityId, string $userId, string $role = 'member'): bool
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $sql = 'INSERT INTO community_members (community_id, user_id, member_role)
                    VALUES (:cid, :uid, :r)
                    ON CONFLICT (community_id, user_id) DO NOTHING';
            $stmt = $pdo->prepare($sql);
            return $stmt->execute(['cid' => $communityId, 'uid' => $userId, 'r' => $role]);
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $sb->queryTable('community_members', [], 'POST', [
                'community_id' => $communityId,
                'user_id' => $userId,
                'member_role' => $role,
            ]);
            return true;
        }

        return false;
    }

    public static function leave(string $communityId, string $userId): bool
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $sql = 'DELETE FROM community_members WHERE community_id = :cid AND user_id = :uid';
            $stmt = $pdo->prepare($sql);
            return $stmt->execute(['cid' => $communityId, 'uid' => $userId]);
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $sb->queryTable('community_members', [
                'community_id' => 'eq.' . $communityId,
                'user_id' => 'eq.' . $userId,
            ], 'DELETE');
            return true;
        }

        return false;
    }

    public static function listMembers(string $communityId, int $limit = 30): array
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $sql = 'SELECT cm.member_role, cm.joined_at,
                           u.id, u.full_name, u.username, u.role, u.department, u.avatar_url
                    FROM community_members cm
                    JOIN profiles u ON u.id = cm.user_id
                    WHERE cm.community_id = :cid
                    ORDER BY CASE cm.member_role WHEN \'admin\' THEN 1 WHEN \'moderator\' THEN 2 ELSE 3 END, cm.joined_at ASC
                    LIMIT :lim';
            $stmt = $pdo->prepare($sql);
            $stmt->bindValue(':cid', $communityId);
            $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
            $stmt->execute();
            return $stmt->fetchAll() ?: [];
        }
        return [];
    }
}
