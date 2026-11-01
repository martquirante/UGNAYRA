<?php

declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Helpers\Security;
use App\Services\SupabaseClient;
use PDO;

class Classroom
{
    public static function generateJoinCode(): string
    {
        return 'UG-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 5));
    }

    public static function listForUser(string $userId, string $role = 'student'): array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) {
            $sb = new SupabaseClient();
            if ($sb->isConfigured()) {
                if ($role === 'teacher' || $role === 'personnel') {
                    $classes = $sb->queryTable('classrooms', [
                        'teacher_id' => 'eq.' . $userId,
                        'is_archived' => 'eq.false',
                        'order' => 'created_at.desc',
                    ]) ?: [];
                } else {
                    $memberships = $sb->queryTable('classroom_members', ['user_id' => 'eq.' . $userId]) ?: [];
                    $cids = array_column($memberships, 'classroom_id');
                    $classes = [];
                    if (!empty($cids)) {
                        $classes = $sb->queryTable('classrooms', [
                            'id' => 'in.(' . implode(',', $cids) . ')',
                            'is_archived' => 'eq.false',
                            'order' => 'created_at.desc',
                        ]) ?: [];
                    }
                }
                return array_map(function ($c) {
                    $t = User::findById($c['teacher_id'] ?? '');
                    $c['teacher_name'] = $t['full_name'] ?? 'Instructor';
                    $c['teacher_avatar'] = $t['avatar_url'] ?? null;
                    $c['student_count'] = (int)($c['student_count'] ?? 0);
                    $c['assignment_count'] = (int)($c['assignment_count'] ?? 0);
                    return $c;
                }, $classes);
            }
            return [];
        }

        if ($role === 'teacher' || $role === 'personnel') {
            $stmt = $pdo->prepare(
                'SELECT c.*, t.school_year, t.semester,
                        p.full_name AS teacher_name, p.avatar_url AS teacher_avatar,
                        (SELECT COUNT(*) FROM classroom_members cm WHERE cm.classroom_id = c.id AND cm.role = \'student\') AS student_count
                 FROM classrooms c
                 JOIN academic_terms t ON t.id = c.term_id
                 JOIN profiles p ON p.id = c.teacher_id
                 WHERE (c.teacher_id = :uid OR c.id IN (SELECT classroom_id FROM classroom_members WHERE user_id = :uid))
                   AND c.is_archived = false
                 ORDER BY c.created_at DESC'
            );
            $stmt->execute(['uid' => $userId]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        }

        // Student query
        $stmt = $pdo->prepare(
            'SELECT c.*, t.school_year, t.semester,
                    p.full_name AS teacher_name, p.avatar_url AS teacher_avatar,
                    cm.role AS my_role, cm.assigned_lab_batch,
                    (SELECT COUNT(*) FROM assignments a WHERE a.classroom_id = c.id AND a.is_published = true) AS assignment_count
             FROM classrooms c
             JOIN classroom_members cm ON cm.classroom_id = c.id AND cm.user_id = :uid
             JOIN academic_terms t ON t.id = c.term_id
             JOIN profiles p ON p.id = c.teacher_id
             WHERE c.is_archived = false
             ORDER BY c.created_at DESC'
        );
        $stmt->execute(['uid' => $userId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public static function findById(string $id, string $userId): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) {
            $sb = new SupabaseClient();
            if ($sb->isConfigured()) {
                $res = $sb->queryTable('classrooms', ['id' => 'eq.' . $id, 'limit' => 1]) ?: [];
                if (empty($res)) return null;
                $c = $res[0];
                $t = User::findById($c['teacher_id'] ?? '');
                $c['teacher_name'] = $t['full_name'] ?? 'Instructor';
                $c['teacher_avatar'] = $t['avatar_url'] ?? null;
                $c['teacher_email'] = $t['email'] ?? null;
                $cm = $sb->queryTable('classroom_members', ['classroom_id' => 'eq.' . $id, 'user_id' => 'eq.' . $userId, 'limit' => 1]) ?: [];
                $c['my_role'] = $cm[0]['role'] ?? null;
                $c['assigned_lab_batch'] = $cm[0]['assigned_lab_batch'] ?? null;
                return $c;
            }
            return null;
        }

        $stmt = $pdo->prepare(
            'SELECT c.*, t.school_year, t.semester,
                    p.full_name AS teacher_name, p.avatar_url AS teacher_avatar, p.email AS teacher_email,
                    cm.role AS my_role, cm.assigned_lab_batch
             FROM classrooms c
             JOIN academic_terms t ON t.id = c.term_id
             JOIN profiles p ON p.id = c.teacher_id
             LEFT JOIN classroom_members cm ON cm.classroom_id = c.id AND cm.user_id = :uid
             WHERE c.id = :id
             LIMIT 1'
        );
        $stmt->execute(['id' => $id, 'uid' => $userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    public static function findByJoinCode(string $code): ?array
    {
        $pdo = Database::getConnection();
        $clean = strtoupper(trim($code));

        if ($pdo === null) {
            $sb = new SupabaseClient();
            if ($sb->isConfigured()) {
                $res = $sb->queryTable('classrooms', ['join_code' => 'ilike.' . $clean, 'is_archived' => 'eq.false', 'limit' => 1]) ?: [];
                if (empty($res)) return null;
                $c = $res[0];
                $t = User::findById($c['teacher_id'] ?? '');
                $c['teacher_name'] = $t['full_name'] ?? 'Instructor';
                return $c;
            }
            return null;
        }

        $stmt = $pdo->prepare(
            'SELECT c.*, p.full_name AS teacher_name
             FROM classrooms c
             JOIN profiles p ON p.id = c.teacher_id
             WHERE UPPER(c.join_code) = :code AND c.is_archived = false
             LIMIT 1'
        );
        $stmt->execute(['code' => $clean]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public static function create(array $data, string $teacherId): ?array
    {
        $pdo = Database::getConnection();
        $id = Security::generateUuid();
        $joinCode = self::generateJoinCode();
        $termId = $data['term_id'] ?? null;

        if ($pdo === null) {
            $sb = new SupabaseClient();
            if ($sb->isConfigured()) {
                if (empty($termId)) {
                    $terms = $sb->queryTable('academic_terms', ['is_current' => 'eq.true', 'limit' => 1]) ?: [];
                    if (!empty($terms) && isset($terms[0]['id'])) {
                        $termId = $terms[0]['id'];
                    } else {
                        $termId = Security::generateUuid();
                        $sb->queryTable('academic_terms', [], 'POST', [
                            'id' => $termId,
                            'school_year' => '2026-2027',
                            'semester' => '1st Semester',
                            'is_current' => true,
                            'starts_at' => '2026-08-15',
                            'ends_at' => '2026-12-20',
                        ]);
                    }
                }

                $now = (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM);
                $payload = [
                    'id' => $id,
                    'teacher_id' => $teacherId,
                    'term_id' => $termId,
                    'subject_code' => strtoupper(trim($data['subject_code'])),
                    'subject_title' => trim($data['subject_title']),
                    'section_designation' => strtoupper(trim($data['section_designation'])),
                    'has_laboratory' => !empty($data['has_laboratory']),
                    'join_code' => $joinCode,
                    'theme_color' => $data['theme_color'] ?? '#173B70',
                    'description' => trim($data['description'] ?? ''),
                    'created_at' => $now,
                ];

                $res = $sb->queryTable('classrooms', [], 'POST', $payload);
                $created = (!empty($res) && isset($res[0])) ? $res[0] : $payload;

                $sb->queryTable('classroom_members', [], 'POST', [
                    'classroom_id' => $id,
                    'user_id' => $teacherId,
                    'role' => 'teacher',
                ]);

                return $created;
            }
            return null;
        }

        // Get or default term_id
        if (empty($termId)) {
            $tStmt = $pdo->query('SELECT id FROM academic_terms WHERE is_current = true LIMIT 1');
            $termId = $tStmt ? $tStmt->fetchColumn() : null;
            if (!$termId) {
                $termId = Security::generateUuid();
                $pdo->prepare('INSERT INTO academic_terms (id, school_year, semester, is_current, starts_at, ends_at) VALUES (:id, \'2026-2027\', \'1st Semester\', true, \'2026-08-15\', \'2026-12-20\')')->execute(['id' => $termId]);
            }
        }

        $stmt = $pdo->prepare(
            'INSERT INTO classrooms (id, teacher_id, term_id, subject_code, subject_title, section_designation, has_laboratory, join_code, theme_color, description)
             VALUES (:id, :tid, :term, :code, :title, :sec, :has_lab, :jcode, :color, :desc)
             RETURNING *'
        );

        $stmt->execute([
            'id' => $id,
            'tid' => $teacherId,
            'term' => $termId,
            'code' => strtoupper(trim($data['subject_code'])),
            'title' => trim($data['subject_title']),
            'sec' => strtoupper(trim($data['section_designation'])),
            'has_lab' => !empty($data['has_laboratory']),
            'jcode' => $joinCode,
            'color' => $data['theme_color'] ?? '#173B70',
            'desc' => trim($data['description'] ?? ''),
        ]);

        $created = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($created) {
            // Enroll teacher as teacher role
            $pdo->prepare('INSERT INTO classroom_members (classroom_id, user_id, role) VALUES (:cid, :uid, \'teacher\') ON CONFLICT DO NOTHING')
                ->execute(['cid' => $id, 'uid' => $teacherId]);
        }

        return $created ?: null;
    }

    public static function enrollStudent(string $classroomId, string $userId, ?int $batch = null, string $role = 'student'): bool
    {
        $pdo = Database::getConnection();
        if ($pdo === null) {
            $sb = new SupabaseClient();
            if ($sb->isConfigured()) {
                $sb->queryTable('classroom_members', [], 'POST', [
                    'classroom_id' => $classroomId,
                    'user_id' => $userId,
                    'role' => $role,
                    'assigned_lab_batch' => ($batch !== null && $batch > 0) ? $batch : null,
                ]);
                return true;
            }
            return false;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO classroom_members (classroom_id, user_id, role, assigned_lab_batch)
             VALUES (:cid, :uid, :role, :batch)
             ON CONFLICT (classroom_id, user_id) DO UPDATE SET assigned_lab_batch = EXCLUDED.assigned_lab_batch'
        );
        return $stmt->execute([
            'cid' => $classroomId,
            'uid' => $userId,
            'role' => $role,
            'batch' => ($batch !== null && $batch > 0) ? $batch : null,
        ]);
    }

    public static function getRoster(string $classroomId): array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return [];

        $stmt = $pdo->prepare(
            'SELECT cm.role, cm.assigned_lab_batch, cm.enrolled_at,
                    p.id AS user_id, p.full_name, p.username, p.email, p.avatar_url, p.school_id_number, p.section
             FROM classroom_members cm
             JOIN profiles p ON p.id = cm.user_id
             WHERE cm.classroom_id = :cid
             ORDER BY CASE WHEN cm.role = \'teacher\' THEN 0 WHEN cm.role = \'class_rep\' THEN 1 ELSE 2 END, p.full_name ASC'
        );
        $stmt->execute(['cid' => $classroomId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public static function getStream(string $classroomId, int $limit = 30): array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return [];

        $stmt = $pdo->prepare(
            'SELECT ca.*, p.full_name AS author_name, p.avatar_url AS author_avatar, p.role AS author_role
             FROM classroom_announcements ca
             JOIN profiles p ON p.id = ca.author_id
             WHERE ca.classroom_id = :cid
             ORDER BY ca.is_pinned DESC, ca.created_at DESC
             LIMIT :lim'
        );
        $stmt->bindValue(':cid', $classroomId);
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return array_map(function ($r) {
            $r['attachments'] = is_string($r['attachments']) ? json_decode($r['attachments'], true) : ($r['attachments'] ?? []);
            return $r;
        }, $rows);
    }

    public static function postAnnouncement(string $classroomId, string $authorId, string $content, array $attachments = []): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return null;

        $id = Security::generateUuid();
        $stmt = $pdo->prepare(
            'INSERT INTO classroom_announcements (id, classroom_id, author_id, content, attachments)
             VALUES (:id, :cid, :aid, :content, :att::jsonb)
             RETURNING *'
        );
        $stmt->execute([
            'id' => $id,
            'cid' => $classroomId,
            'aid' => $authorId,
            'content' => trim($content),
            'att' => json_encode($attachments),
        ]);

        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }
}
