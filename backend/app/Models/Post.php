<?php

declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Helpers\Security;
use App\Services\SupabaseClient;
use PDO;

class Post
{
    public static function listFeed(
        ?string $currentUserId,
        string $filter = 'all',
        ?string $cursor = null,
        int $limit = 20,
        ?string $communityId = null,
        ?string $authorId = null
    ): array {
        $pdo = Database::getConnection();
        if ($pdo === null) {
            return self::listFeedFallback($currentUserId, $filter, $cursor, $limit, $communityId, $authorId);
        }

        $where = ['p.shared_post_id IS NOT NULL OR p.content IS NOT NULL'];
        $params = [];

        if ($communityId !== null) {
            $where[] = 'p.community_id = :commId';
            $params['commId'] = $communityId;
        } elseif ($authorId !== null) {
            $where[] = 'p.author_id = :authorId';
            $params['authorId'] = $authorId;
        } else {
            // General campus feed
            if ($filter === 'teachers') {
                $where[] = "u.role IN ('teacher', 'personnel')";
            } elseif ($filter === 'media') {
                $where[] = 'EXISTS (SELECT 1 FROM post_images pi WHERE pi.post_id = p.id)';
            }
        }

        if ($cursor !== null) {
            $parts = explode('|', $cursor, 2);
            if (count($parts) === 2) {
                $where[] = '(p.created_at < :curTime OR (p.created_at = :curTime AND p.id < :curId))';
                $params['curTime'] = $parts[0];
                $params['curId'] = $parts[1];
            }
        }

        $whereSql = implode(' AND ', $where);

        $sql = "SELECT p.*,
                       u.full_name AS author_name,
                       u.username AS author_username,
                       u.role AS author_role,
                       u.department AS author_department,
                       u.avatar_url AS author_avatar,
                       c.name AS community_name,
                       c.slug AS community_slug,
                       sp.content AS shared_content,
                       sp.created_at AS shared_created_at,
                       su.full_name AS shared_author_name,
                       su.username AS shared_author_username,
                       su.role AS shared_author_role,
                       su.avatar_url AS shared_author_avatar,
                       EXISTS(
                           SELECT 1 FROM post_likes pl 
                           WHERE pl.post_id = p.id AND pl.user_id = :uid
                       ) AS is_liked
                FROM posts p
                JOIN profiles u ON u.id = p.author_id
                LEFT JOIN communities c ON c.id = p.community_id
                LEFT JOIN posts sp ON sp.id = p.shared_post_id
                LEFT JOIN profiles su ON su.id = sp.author_id
                WHERE {$whereSql}
                ORDER BY p.is_pinned DESC, p.created_at DESC, p.id DESC
                LIMIT :lim";

        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':uid', $currentUserId ?? '00000000-0000-0000-0000-000000000000');
        $stmt->bindValue(':lim', $limit + 1, PDO::PARAM_INT);

        foreach ($params as $k => $v) {
            $stmt->bindValue(':' . $k, $v);
        }

        $stmt->execute();
        $rows = $stmt->fetchAll();

        $hasMore = count($rows) > $limit;
        if ($hasMore) {
            array_pop($rows);
        }

        $nextCursor = null;
        if (!empty($rows) && $hasMore) {
            $last = end($rows);
            $nextCursor = $last['created_at'] . '|' . $last['id'];
        }

        // Attach images to posts in bulk
        $postIds = array_column($rows, 'id');
        $imagesByPost = self::loadImagesForPosts($pdo, $postIds);

        $formatted = array_map(function ($r) use ($imagesByPost) {
            return self::formatPostRow($r, $imagesByPost[$r['id']] ?? []);
        }, $rows);

        return [
            'items' => $formatted,
            'has_more' => $hasMore,
            'next_cursor' => $nextCursor,
        ];
    }

    private static function loadImagesForPosts(PDO $pdo, array $postIds): array
    {
        if (empty($postIds)) {
            return [];
        }

        $in = implode(',', array_fill(0, count($postIds), '?'));
        $stmt = $pdo->prepare("SELECT * FROM post_images WHERE post_id IN ({$in}) ORDER BY sort_order ASC");
        $stmt->execute($postIds);
        $images = $stmt->fetchAll();

        $map = [];
        foreach ($images as $img) {
            $map[$img['post_id']][] = $img;
        }
        return $map;
    }

    public static function create(array $data): ?array
    {
        $id = $data['id'] ?? Security::generateUuid();
        $pdo = Database::getConnection();

        $params = [
            'id' => $id,
            'author_id' => $data['author_id'],
            'community_id' => !empty($data['community_id']) ? $data['community_id'] : null,
            'shared_post_id' => !empty($data['shared_post_id']) ? $data['shared_post_id'] : null,
            'content' => $data['content'] ?? '',
            'visibility' => $data['visibility'] ?? 'campus',
        ];

        if ($pdo !== null) {
            $sql = 'INSERT INTO posts (id, author_id, community_id, shared_post_id, content, visibility)
                    VALUES (:id, :author_id, :community_id, :shared_post_id, :content, :visibility)
                    RETURNING *';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $post = $stmt->fetch();

            if (!empty($params['community_id'])) {
                $cpStmt = $pdo->prepare('INSERT INTO community_posts (community_id, post_id, is_announcement, is_pinned) VALUES (:cid, :pid, :ann, :pin) ON CONFLICT DO NOTHING');
                $cpStmt->execute([
                    'cid' => $params['community_id'],
                    'pid' => $id,
                    'ann' => !empty($data['is_announcement']),
                    'pin' => !empty($data['is_pinned']),
                ]);
            }

            if (!empty($data['images']) && is_array($data['images'])) {
                self::attachImages($pdo, $id, $data['images']);
            }

            return self::findById($id, $data['author_id']);
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $res = $sb->queryTable('posts', [], 'POST', $params);
            if (!empty($res) && isset($res[0])) {
                if (!empty($params['community_id'])) {
                    $sb->queryTable('community_posts', [], 'POST', [
                        'community_id' => $params['community_id'],
                        'post_id' => $id,
                        'is_announcement' => !empty($data['is_announcement']),
                        'is_pinned' => !empty($data['is_pinned']),
                    ]);
                }
                if (!empty($data['images']) && is_array($data['images'])) {
                    $order = 0;
                    foreach ($data['images'] as $imgUrl) {
                        $sb->queryTable('post_images', [], 'POST', [
                            'id' => Security::generateUuid(),
                            'post_id' => $id,
                            'image_url' => $imgUrl,
                            'sort_order' => $order++,
                        ]);
                    }
                }
                return self::findById($id, $data['author_id']);
            }
        }

        return null;
    }

    public static function attachImages(PDO $pdo, string $postId, array $images): void
    {
        $stmt = $pdo->prepare('INSERT INTO post_images (id, post_id, image_url, sort_order) VALUES (:id, :post_id, :url, :order)');
        $i = 0;
        foreach ($images as $imgUrl) {
            $stmt->execute([
                'id' => Security::generateUuid(),
                'post_id' => $postId,
                'url' => $imgUrl,
                'order' => $i++,
            ]);
        }
    }

    public static function findById(string $id, ?string $currentUserId = null): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $sql = "SELECT p.*,
                           u.full_name AS author_name,
                           u.username AS author_username,
                           u.role AS author_role,
                           u.department AS author_department,
                           u.avatar_url AS author_avatar,
                           c.name AS community_name,
                           c.slug AS community_slug,
                           EXISTS(
                               SELECT 1 FROM post_likes pl 
                               WHERE pl.post_id = p.id AND pl.user_id = :uid
                           ) AS is_liked
                    FROM posts p
                    JOIN profiles u ON u.id = p.author_id
                    LEFT JOIN communities c ON c.id = p.community_id
                    WHERE p.id = :id
                    LIMIT 1";

            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                'id' => $id,
                'uid' => $currentUserId ?? '00000000-0000-0000-0000-000000000000',
            ]);
            $row = $stmt->fetch();
            if (!$row) {
                return null;
            }

            $images = self::loadImagesForPosts($pdo, [$id]);
            return self::formatPostRow($row, $images[$id] ?? []);
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $rows = $sb->queryTable('posts', [
                'select' => '*,author:profiles!posts_author_id_fkey(id,full_name,username,role,department,avatar_url),community:communities!posts_community_id_fkey(id,name,slug),images:post_images(id,image_url,sort_order)',
                'id' => 'eq.' . $id,
                'limit' => 1,
            ]);
            if (!empty($rows) && isset($rows[0])) {
                $r = $rows[0];
                $images = $r['images'] ?? [];
                if (is_array($images)) {
                    usort($images, fn($a, $b) => ($a['sort_order'] ?? 0) <=> ($b['sort_order'] ?? 0));
                }

                $isLiked = false;
                if (!empty($currentUserId)) {
                    $likes = $sb->queryTable('post_likes', [
                        'post_id' => 'eq.' . $id,
                        'user_id' => 'eq.' . $currentUserId,
                        'limit' => 1,
                    ]);
                    $isLiked = !empty($likes);
                }

                $author = $r['author'] ?? [];
                $comm = $r['community'] ?? [];
                return [
                    'id' => $r['id'],
                    'content' => $r['content'] ?? '',
                    'visibility' => $r['visibility'] ?? 'campus',
                    'likes_count' => (int)($r['likes_count'] ?? 0),
                    'comments_count' => (int)($r['comments_count'] ?? 0),
                    'shares_count' => (int)($r['shares_count'] ?? 0),
                    'is_liked' => $isLiked,
                    'is_pinned' => false,
                    'is_announcement' => false,
                    'is_edited' => (bool)($r['is_edited'] ?? false),
                    'created_at' => $r['created_at'],
                    'author' => [
                        'id' => $author['id'] ?? $r['author_id'],
                        'full_name' => $author['full_name'] ?? 'Campus Member',
                        'username' => $author['username'] ?? 'user',
                        'role' => $author['role'] ?? 'student',
                        'department' => $author['department'] ?? null,
                        'avatar_url' => $author['avatar_url'] ?? null,
                    ],
                    'community' => !empty($comm) ? [
                        'id' => $comm['id'] ?? $r['community_id'],
                        'name' => $comm['name'] ?? '',
                        'slug' => $comm['slug'] ?? '',
                    ] : null,
                    'images' => array_map(fn($img) => [
                        'id' => $img['id'],
                        'image_url' => $img['image_url'],
                    ], $images),
                ];
            }
        }

        return null;
    }

    public static function toggleLike(string $postId, string $userId): array
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            // Check if already liked
            $check = $pdo->prepare('SELECT 1 FROM post_likes WHERE post_id = :pid AND user_id = :uid');
            $check->execute(['pid' => $postId, 'uid' => $userId]);
            $exists = (bool)$check->fetch();

            if ($exists) {
                // Remove like
                $del = $pdo->prepare('DELETE FROM post_likes WHERE post_id = :pid AND user_id = :uid');
                $del->execute(['pid' => $postId, 'uid' => $userId]);
                $isLiked = false;
            } else {
                // Add like
                $ins = $pdo->prepare('INSERT INTO post_likes (post_id, user_id) VALUES (:pid, :uid) ON CONFLICT DO NOTHING');
                $ins->execute(['pid' => $postId, 'uid' => $userId]);
                $isLiked = true;
            }

            // Fetch updated count
            $cntStmt = $pdo->prepare('SELECT likes_count FROM posts WHERE id = :pid');
            $cntStmt->execute(['pid' => $postId]);
            $count = (int)$cntStmt->fetchColumn();

            return [
                'is_liked' => $isLiked,
                'likes_count' => $count,
            ];
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $existing = $sb->queryTable('post_likes', [
                'post_id' => 'eq.' . $postId,
                'user_id' => 'eq.' . $userId,
                'limit' => 1,
            ]);

            if (!empty($existing)) {
                $sb->queryTable('post_likes', [
                    'post_id' => 'eq.' . $postId,
                    'user_id' => 'eq.' . $userId,
                ], 'DELETE');
                $isLiked = false;
            } else {
                $sb->queryTable('post_likes', [], 'POST', [
                    'post_id' => $postId,
                    'user_id' => $userId,
                ]);
                $isLiked = true;
            }

            $p = $sb->queryTable('posts', ['id' => 'eq.' . $postId, 'select' => 'likes_count', 'limit' => 1]);
            $count = (int)($p[0]['likes_count'] ?? 0);

            return [
                'is_liked' => $isLiked,
                'likes_count' => $count,
            ];
        }

        return ['is_liked' => false, 'likes_count' => 0];
    }

    public static function update(string $id, string $content): bool
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $stmt = $pdo->prepare('UPDATE posts SET content = :c, is_edited = true, updated_at = NOW() WHERE id = :id');
            return $stmt->execute(['c' => $content, 'id' => $id]);
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $now = (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM);
            $res = $sb->queryTable('posts', ['id' => 'eq.' . $id], 'PATCH', [
                'content' => $content,
                'is_edited' => true,
                'updated_at' => $now,
            ]);
            return !empty($res);
        }

        return false;
    }

    public static function delete(string $id): bool
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $stmt = $pdo->prepare('DELETE FROM posts WHERE id = :id');
            return $stmt->execute(['id' => $id]);
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $sb->queryTable('posts', ['id' => 'eq.' . $id], 'DELETE');
            return true;
        }

        return false;
    }

    private static function formatPostRow(array $r, array $images = []): array
    {
        $post = [
            'id' => $r['id'],
            'content' => $r['content'],
            'visibility' => $r['visibility'],
            'likes_count' => (int)($r['likes_count'] ?? 0),
            'comments_count' => (int)($r['comments_count'] ?? 0),
            'shares_count' => (int)($r['shares_count'] ?? 0),
            'is_liked' => (bool)($r['is_liked'] ?? false),
            'is_pinned' => (bool)($r['is_pinned'] ?? false),
            'is_announcement' => (bool)($r['is_announcement'] ?? false),
            'is_edited' => (bool)($r['is_edited'] ?? false),
            'created_at' => $r['created_at'],
            'author' => [
                'id' => $r['author_id'],
                'full_name' => $r['author_name'] ?? 'Campus Member',
                'username' => $r['author_username'] ?? 'user',
                'role' => $r['author_role'] ?? 'student',
                'department' => $r['author_department'] ?? null,
                'avatar_url' => $r['author_avatar'] ?? null,
            ],
            'images' => array_map(function ($img) {
                return [
                    'id' => $img['id'],
                    'image_url' => $img['image_url'],
                    'alt_text' => $img['alt_text'] ?? null,
                ];
            }, $images),
        ];

        if (!empty($r['community_id'])) {
            $post['community'] = [
                'id' => $r['community_id'],
                'name' => $r['community_name'] ?? 'Community',
                'slug' => $r['community_slug'] ?? '',
            ];
        }

        if (!empty($r['shared_post_id'])) {
            $post['shared_post'] = [
                'id' => $r['shared_post_id'],
                'content' => $r['shared_content'] ?? '',
                'created_at' => $r['shared_created_at'] ?? null,
                'author' => [
                    'full_name' => $r['shared_author_name'] ?? 'Original Author',
                    'username' => $r['shared_author_username'] ?? 'user',
                    'role' => $r['shared_author_role'] ?? 'student',
                    'avatar_url' => $r['shared_author_avatar'] ?? null,
                ],
            ];
        }

        return $post;
    }

    private static function listFeedFallback(?string $uid, string $filter, ?string $cursor, int $limit, ?string $commId, ?string $authorId): array
    {
        $sb = new SupabaseClient();
        if (!$sb->isConfigured()) {
            return ['items' => [], 'has_more' => false, 'next_cursor' => null];
        }

        $params = [
            'select' => '*,author:profiles!posts_author_id_fkey(id,full_name,username,role,department,avatar_url),community:communities!posts_community_id_fkey(id,name,slug),images:post_images(id,image_url,sort_order)',
            'order' => 'created_at.desc',
            'limit' => $limit + 1,
        ];

        if ($commId !== null) {
            $params['community_id'] = 'eq.' . $commId;
        } elseif ($authorId !== null) {
            $params['author_id'] = 'eq.' . $authorId;
        }

        if ($cursor !== null) {
            $parts = explode('|', $cursor, 2);
            if (!empty($parts[0])) {
                $params['created_at'] = 'lt.' . $parts[0];
            }
        }

        $rows = $sb->queryTable('posts', $params) ?? [];
        $hasMore = count($rows) > $limit;
        if ($hasMore) {
            array_pop($rows);
        }

        $nextCursor = null;
        if (!empty($rows) && $hasMore) {
            $last = end($rows);
            $nextCursor = $last['created_at'] . '|' . $last['id'];
        }

        // Batch check liked posts
        $likedPostIds = [];
        if (!empty($uid) && !empty($rows)) {
            $postIds = array_column($rows, 'id');
            $likes = $sb->queryTable('post_likes', [
                'user_id' => 'eq.' . $uid,
                'post_id' => 'in.(' . implode(',', $postIds) . ')',
            ]) ?? [];
            $likedPostIds = array_flip(array_column($likes, 'post_id'));
        }

        $items = array_map(function ($r) use ($likedPostIds) {
            $images = $r['images'] ?? [];
            if (!empty($images) && is_array($images)) {
                usort($images, fn($a, $b) => ($a['sort_order'] ?? 0) <=> ($b['sort_order'] ?? 0));
            }
            $author = $r['author'] ?? [];
            $comm = $r['community'] ?? [];
            return [
                'id' => $r['id'],
                'content' => $r['content'] ?? '',
                'visibility' => $r['visibility'] ?? 'campus',
                'likes_count' => (int)($r['likes_count'] ?? 0),
                'comments_count' => (int)($r['comments_count'] ?? 0),
                'shares_count' => (int)($r['shares_count'] ?? 0),
                'is_liked' => isset($likedPostIds[$r['id']]),
                'is_pinned' => false,
                'is_announcement' => false,
                'is_edited' => (bool)($r['is_edited'] ?? false),
                'created_at' => $r['created_at'],
                'author' => [
                    'id' => $author['id'] ?? $r['author_id'],
                    'full_name' => $author['full_name'] ?? 'Campus Member',
                    'username' => $author['username'] ?? 'user',
                    'role' => $author['role'] ?? 'student',
                    'department' => $author['department'] ?? null,
                    'avatar_url' => $author['avatar_url'] ?? null,
                ],
                'community' => !empty($comm) ? [
                    'id' => $comm['id'] ?? $r['community_id'],
                    'name' => $comm['name'] ?? '',
                    'slug' => $comm['slug'] ?? '',
                ] : null,
                'images' => array_map(fn($img) => [
                    'id' => $img['id'],
                    'image_url' => $img['image_url'],
                ], $images),
            ];
        }, $rows);

        return [
            'items' => $items,
            'has_more' => $hasMore,
            'next_cursor' => $nextCursor,
        ];
    }
}
