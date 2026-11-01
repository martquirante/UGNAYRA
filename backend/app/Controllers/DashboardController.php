<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\JsonResponse;
use App\Helpers\Request;
use PDO;

class DashboardController
{
    /**
     * GET /api/v1/dashboard/overview
     * Returns role-aware dashboard cockpits populated from authoritative database queries
     */
    public function overview(Request $request): void
    {
        $user = $request->getUser();
        $pdo = Database::getConnection();

        if ($pdo === null) {
            JsonResponse::success([
                'role' => $user['role'] ?? 'student',
                'classes' => [],
                'upcoming_sessions' => [],
                'pending_items' => [],
            ], 'Overview data retrieved.');
            return;
        }

        $role = $user['role'] ?? 'student';

        if ($role === 'teacher' || $role === 'personnel') {
            // Teacher Cockpit
            // 1. My classes
            $cStmt = $pdo->prepare(
                'SELECT c.*, t.school_year, t.semester,
                        (SELECT COUNT(*) FROM classroom_members cm WHERE cm.classroom_id = c.id AND cm.role = \'student\') AS student_count,
                        (SELECT COUNT(*) FROM assignments a WHERE a.classroom_id = c.id) AS assignment_count
                 FROM classrooms c
                 JOIN academic_terms t ON t.id = c.term_id
                 WHERE c.teacher_id = :uid AND c.is_archived = false
                 ORDER BY c.created_at DESC'
            );
            $cStmt->execute(['uid' => $user['id']]);
            $classes = $cStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

            // 2. Pending submissions to grade
            $pStmt = $pdo->prepare(
                'SELECT s.id AS submission_id, s.status, s.submitted_at,
                        a.id AS assignment_id, a.title AS assignment_title, a.max_score,
                        c.id AS classroom_id, c.subject_code, c.subject_title, c.section_designation,
                        p.full_name AS student_name, p.avatar_url AS student_avatar
                 FROM submissions s
                 JOIN assignments a ON a.id = s.assignment_id
                 JOIN classrooms c ON c.id = a.classroom_id
                 JOIN profiles p ON p.id = s.student_id
                 WHERE c.teacher_id = :uid AND s.status IN (\'SUBMITTED\', \'LATE\')
                 ORDER BY s.submitted_at ASC
                 LIMIT 15'
            );
            $pStmt->execute(['uid' => $user['id']]);
            $pendingToGrade = $pStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

            // 3. Upcoming/live sessions
            $sStmt = $pdo->prepare(
                'SELECT cs.*, c.subject_code, c.subject_title, c.section_designation
                 FROM class_sessions cs
                 JOIN classrooms c ON c.id = cs.classroom_id
                 WHERE cs.host_id = :uid AND cs.status IN (\'scheduled\', \'live\')
                 ORDER BY cs.scheduled_start ASC
                 LIMIT 10'
            );
            $sStmt->execute(['uid' => $user['id']]);
            $sessions = $sStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

            JsonResponse::success([
                'role' => 'teacher',
                'classes' => $classes,
                'pending_grading' => $pendingToGrade,
                'upcoming_sessions' => $sessions,
            ], 'Teacher cockpit retrieved.');
            return;
        }

        // Student Cockpit
        // 1. Enrolled classes
        $cStmt = $pdo->prepare(
            'SELECT c.*, t.school_year, t.semester,
                    p.full_name AS teacher_name, p.avatar_url AS teacher_avatar,
                    cm.assigned_lab_batch
             FROM classrooms c
             JOIN classroom_members cm ON cm.classroom_id = c.id AND cm.user_id = :uid
             JOIN academic_terms t ON t.id = c.term_id
             JOIN profiles p ON p.id = c.teacher_id
             WHERE c.is_archived = false
             ORDER BY c.created_at DESC'
        );
        $cStmt->execute(['uid' => $user['id']]);
        $enrolledClasses = $cStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        // 2. Pending assignments with due dates
        $aStmt = $pdo->prepare(
            'SELECT a.*, c.subject_code, c.subject_title, c.section_designation,
                    s.status AS submission_status, s.current_score
             FROM assignments a
             JOIN classrooms c ON c.id = a.classroom_id
             JOIN classroom_members cm ON cm.classroom_id = c.id AND cm.user_id = :uid
             LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = :uid
             WHERE a.is_published = true AND c.is_archived = false
               AND (s.id IS NULL OR s.status IN (\'DRAFT\', \'NOT_SUBMITTED\'))
             ORDER BY a.due_at ASC NULLS LAST
             LIMIT 15'
        );
        $aStmt->execute(['uid' => $user['id']]);
        $pendingAssignments = $aStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        // 3. Upcoming online classes
        $sStmt = $pdo->prepare(
            'SELECT cs.*, c.subject_code, c.subject_title, c.section_designation,
                    p.full_name AS host_name, p.avatar_url AS host_avatar
             FROM class_sessions cs
             JOIN classrooms c ON c.id = cs.classroom_id
             JOIN classroom_members cm ON cm.classroom_id = c.id AND cm.user_id = :uid
             JOIN profiles p ON p.id = cs.host_id
             WHERE cs.status IN (\'scheduled\', \'live\')
             ORDER BY cs.scheduled_start ASC
             LIMIT 10'
        );
        $sStmt->execute(['uid' => $user['id']]);
        $upcomingSessions = $sStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        JsonResponse::success([
            'role' => 'student',
            'enrolled_classes' => $enrolledClasses,
            'pending_assignments' => $pendingAssignments,
            'upcoming_sessions' => $upcomingSessions,
        ], 'Student cockpit retrieved.');
    }
}
