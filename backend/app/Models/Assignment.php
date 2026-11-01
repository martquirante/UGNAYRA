<?php

declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Helpers\Security;
use PDO;

class Assignment
{
    public static function listForClassroom(string $classroomId, ?string $studentId = null): array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return [];

        if ($studentId !== null) {
            $stmt = $pdo->prepare(
                'SELECT a.*,
                        s.id AS submission_id, s.status AS submission_status, s.current_score, s.current_feedback, s.submitted_at
                 FROM assignments a
                 LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = :sid
                 WHERE a.classroom_id = :cid AND a.is_published = true
                 ORDER BY a.due_at ASC NULLS LAST, a.created_at DESC'
            );
            $stmt->execute(['cid' => $classroomId, 'sid' => $studentId]);
        } else {
            $stmt = $pdo->prepare(
                'SELECT a.*,
                        (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id) AS submission_count,
                        (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id AND s.status = \'GRADED\') AS graded_count
                 FROM assignments a
                 WHERE a.classroom_id = :cid
                 ORDER BY a.due_at ASC NULLS LAST, a.created_at DESC'
            );
            $stmt->execute(['cid' => $classroomId]);
        }

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        return array_map(function ($r) {
            $r['reference_files'] = is_string($r['reference_files'] ?? null) ? json_decode($r['reference_files'], true) : ($r['reference_files'] ?? []);
            return $r;
        }, $rows);
    }

    public static function findById(string $id, ?string $studentId = null): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return null;

        $stmt = $pdo->prepare(
            'SELECT a.*, c.subject_code, c.subject_title, c.section_designation, c.teacher_id,
                    p.full_name AS author_name, p.avatar_url AS author_avatar
             FROM assignments a
             JOIN classrooms c ON c.id = a.classroom_id
             JOIN profiles p ON p.id = a.author_id
             WHERE a.id = :id
             LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        $assignment = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$assignment) return null;

        $assignment['reference_files'] = is_string($assignment['reference_files'] ?? null) 
            ? json_decode($assignment['reference_files'], true) 
            : ($assignment['reference_files'] ?? []);

        if ($studentId !== null) {
            $subStmt = $pdo->prepare('SELECT * FROM submissions WHERE assignment_id = :aid AND student_id = :sid LIMIT 1');
            $subStmt->execute(['aid' => $id, 'sid' => $studentId]);
            $sub = $subStmt->fetch(PDO::FETCH_ASSOC);

            if ($sub) {
                // Fetch submission files
                $filesStmt = $pdo->prepare('SELECT * FROM submission_files WHERE submission_id = :sid ORDER BY uploaded_at ASC');
                $filesStmt->execute(['sid' => $sub['id']]);
                $sub['files'] = $filesStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
                $assignment['my_submission'] = $sub;
            } else {
                $assignment['my_submission'] = null;
            }
        }

        return $assignment;
    }

    public static function create(array $data, string $authorId): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return null;

        $id = Security::generateUuid();
        $dueAt = !empty($data['due_at']) ? date('Y-m-d H:i:s', strtotime($data['due_at'])) : null;
        $refFiles = isset($data['reference_files']) && is_array($data['reference_files']) ? json_encode($data['reference_files']) : '[]';

        $stmt = $pdo->prepare(
            'INSERT INTO assignments (id, classroom_id, author_id, title, instructions, activity_type, max_score, due_at, max_attachments, max_file_size_mb, allow_resubmit, reference_files, is_published)
             VALUES (:id, :cid, :aid, :title, :inst, :atype, :score, :due, :max_att, :max_mb, :resubmit, :ref::jsonb, :pub)
             RETURNING *'
        );

        $stmt->execute([
            'id' => $id,
            'cid' => $data['classroom_id'],
            'aid' => $authorId,
            'title' => trim($data['title']),
            'inst' => trim($data['instructions'] ?? ''),
            'atype' => $data['activity_type'] ?? 'assignment',
            'score' => (float)($data['max_score'] ?? 100),
            'due' => $dueAt,
            'max_att' => (int)($data['max_attachments'] ?? 5),
            'max_mb' => (int)($data['max_file_size_mb'] ?? 25),
            'resubmit' => !isset($data['allow_resubmit']) || !empty($data['allow_resubmit']),
            'ref' => $refFiles,
            'pub' => !isset($data['is_published']) || !empty($data['is_published']),
        ]);

        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }
}
