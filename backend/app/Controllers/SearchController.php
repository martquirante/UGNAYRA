<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\JsonResponse;
use App\Helpers\Request;
use PDO;

class SearchController
{
    public function query(Request $request): void
    {
        $q = trim((string)$request->query('q', ''));
        $type = (string)$request->query('type', 'all');
        $limit = min(30, max(1, (int)$request->query('limit', 15)));

        $pdo = Database::getConnection();
        if ($pdo === null) {
            $sb = new \App\Services\SupabaseClient();
            if ($sb->isConfigured()) {
                $cleanQ = str_replace(['%', '*', '(', ')'], '', $q);
                $results = [
                    'people' => [],
                    'communities' => [],
                    'announcements' => [],
                    'posts' => [],
                ];

                if ($cleanQ !== '') {
                    // Search People via Supabase
                    if ($type === 'all' || $type === 'people') {
                        $people = $sb->queryTable('profiles', [
                            'or' => sprintf('(full_name.ilike.*%s*,username.ilike.*%s*,department.ilike.*%s*)', $cleanQ, $cleanQ, $cleanQ),
                            'is_active' => 'eq.true',
                            'limit' => $limit,
                            'select' => 'id,full_name,username,role,department,avatar_url',
                        ]) ?: [];
                        $results['people'] = $people;
                    }

                    // Search Communities via Supabase
                    if ($type === 'all' || $type === 'communities') {
                        $comms = $sb->queryTable('communities', [
                            'or' => sprintf('(name.ilike.*%s*,description.ilike.*%s*)', $cleanQ, $cleanQ),
                            'limit' => $limit,
                            'select' => 'id,slug,name,category,description,members_count,avatar_url',
                        ]) ?: [];
                        $results['communities'] = $comms;
                    }

                    // Search Announcements via Supabase
                    if ($type === 'all' || $type === 'announcements') {
                        $annRows = $sb->queryTable('announcements', [
                            'or' => sprintf('(title.ilike.*%s*,body.ilike.*%s*)', $cleanQ, $cleanQ),
                            'order' => 'published_at.desc',
                            'limit' => $limit,
                        ]) ?: [];
                        $results['announcements'] = array_map(function ($r) {
                            $u = \App\Models\User::findById($r['author_id'] ?? '');
                            return [
                                'id' => $r['id'],
                                'title' => $r['title'],
                                'body' => $r['body'],
                                'category' => $r['category'] ?? 'general',
                                'priority' => $r['priority'] ?? 'normal',
                                'published_at' => $r['published_at'] ?? $r['created_at'] ?? null,
                                'author' => [
                                    'id' => $r['author_id'] ?? '',
                                    'full_name' => $u['full_name'] ?? 'School Office',
                                    'role' => $u['role'] ?? 'personnel',
                                    'department' => $u['department'] ?? null,
                                ],
                            ];
                        }, $annRows);
                    }

                    // Search Posts via Supabase
                    if ($type === 'all' || $type === 'posts') {
                        $postRows = $sb->queryTable('posts', [
                            'content' => 'ilike.*' . $cleanQ . '*',
                            'order' => 'created_at.desc',
                            'limit' => $limit,
                        ]) ?: [];
                        $results['posts'] = array_map(function ($r) {
                            $u = \App\Models\User::findById($r['author_id'] ?? '');
                            return [
                                'id' => $r['id'],
                                'content' => $r['content'],
                                'likes_count' => (int)($r['likes_count'] ?? 0),
                                'comments_count' => (int)($r['comments_count'] ?? 0),
                                'shares_count' => (int)($r['shares_count'] ?? 0),
                                'created_at' => $r['created_at'],
                                'author' => [
                                    'id' => $r['author_id'] ?? '',
                                    'full_name' => $u['full_name'] ?? 'Campus Member',
                                    'username' => $u['username'] ?? 'user',
                                    'role' => $u['role'] ?? 'student',
                                    'avatar_url' => $u['avatar_url'] ?? null,
                                ],
                                'images' => [],
                            ];
                        }, $postRows);
                    }
                }

                JsonResponse::success($results, 'Campus search results.');
                return;
            }

            JsonResponse::success([
                'people' => [],
                'communities' => [],
                'announcements' => [],
                'posts' => [],
            ], 'Search results.');
            return;
        }

        $term = '%' . strtolower($q) . '%';
        $results = [
            'people' => [],
            'communities' => [],
            'announcements' => [],
            'posts' => [],
        ];

        // Search People
        if ($type === 'all' || $type === 'people') {
            $sql = "SELECT id, full_name, username, role, department, avatar_url 
                    FROM profiles 
                    WHERE is_active = true 
                      AND (LOWER(full_name) LIKE :q1 OR LOWER(username) LIKE :q2 OR LOWER(department) LIKE :q3)
                    ORDER BY full_name ASC 
                    LIMIT :lim";
            $stmt = $pdo->prepare($sql);
            $stmt->execute(['q1' => $term, 'q2' => $term, 'q3' => $term, 'lim' => $limit]);
            $results['people'] = $stmt->fetchAll() ?: [];
        }

        // Search Communities
        if ($type === 'all' || $type === 'communities') {
            $sql = "SELECT id, slug, name, category, description, members_count, avatar_url 
                    FROM communities 
                    WHERE LOWER(name) LIKE :q1 OR LOWER(description) LIKE :q2
                    ORDER BY members_count DESC 
                    LIMIT :lim";
            $stmt = $pdo->prepare($sql);
            $stmt->execute(['q1' => $term, 'q2' => $term, 'lim' => $limit]);
            $results['communities'] = $stmt->fetchAll() ?: [];
        }

        // Search Announcements
        if ($type === 'all' || $type === 'announcements') {
            $sql = "SELECT a.*, u.full_name AS author_name, u.role AS author_role, u.department AS author_department
                    FROM announcements a
                    JOIN profiles u ON u.id = a.author_id
                    WHERE LOWER(a.title) LIKE :q1 OR LOWER(a.body) LIKE :q2
                    ORDER BY a.published_at DESC 
                    LIMIT :lim";
            $stmt = $pdo->prepare($sql);
            $stmt->execute(['q1' => $term, 'q2' => $term, 'lim' => $limit]);
            $rows = $stmt->fetchAll() ?: [];
            $results['announcements'] = array_map(function ($r) {
                return [
                    'id' => $r['id'],
                    'title' => $r['title'],
                    'body' => $r['body'],
                    'category' => $r['category'],
                    'priority' => $r['priority'],
                    'published_at' => $r['published_at'],
                    'author' => [
                        'id' => $r['author_id'],
                        'full_name' => $r['author_name'] ?? 'School Office',
                        'role' => $r['author_role'] ?? 'personnel',
                        'department' => $r['author_department'] ?? null,
                    ],
                ];
            }, $rows);
        }

        // Search Posts
        if ($type === 'all' || $type === 'posts') {
            $sql = "SELECT p.*, u.full_name AS author_name, u.username AS author_username, u.role AS author_role, u.avatar_url AS author_avatar
                    FROM posts p
                    JOIN profiles u ON u.id = p.author_id
                    WHERE p.content IS NOT NULL AND LOWER(p.content) LIKE :q1
                    ORDER BY p.created_at DESC 
                    LIMIT :lim";
            $stmt = $pdo->prepare($sql);
            $stmt->execute(['q1' => $term, 'lim' => $limit]);
            $rows = $stmt->fetchAll() ?: [];
            $results['posts'] = array_map(function ($r) {
                return [
                    'id' => $r['id'],
                    'content' => $r['content'],
                    'likes_count' => (int)($r['likes_count'] ?? 0),
                    'comments_count' => (int)($r['comments_count'] ?? 0),
                    'shares_count' => (int)($r['shares_count'] ?? 0),
                    'created_at' => $r['created_at'],
                    'author' => [
                        'id' => $r['author_id'],
                        'full_name' => $r['author_name'] ?? 'Campus Member',
                        'username' => $r['author_username'] ?? 'user',
                        'role' => $r['author_role'] ?? 'student',
                        'avatar_url' => $r['author_avatar'] ?? null,
                    ],
                    'images' => [],
                ];
            }, $rows);
        }

        JsonResponse::success($results, 'Campus search results.');
    }
}
