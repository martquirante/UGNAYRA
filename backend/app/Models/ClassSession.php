<?php

declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Helpers\Security;
use PDO;

class ClassSession
{
    public static function generateMeetingCode(string $subjectCode): string
    {
        $clean = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $subjectCode));
        return sprintf('ugn-%s-%s', substr($clean, 0, 6), substr(bin2hex(random_bytes(3)), 0, 6));
    }

    public static function findByMeetingCode(string $code): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return null;

        $stmt = $pdo->prepare(
            'SELECT cs.*, c.subject_code, c.subject_title, c.section_designation,
                    p.full_name AS host_name, p.avatar_url AS host_avatar
             FROM class_sessions cs
             JOIN classrooms c ON c.id = cs.classroom_id
             JOIN profiles p ON p.id = cs.host_id
             WHERE cs.meeting_code = :code
             LIMIT 1'
        );
        $stmt->execute(['code' => trim($code)]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public static function getActiveOrUpcoming(string $classroomId): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return null;

        // Check if there is an actively live session right now
        $liveStmt = $pdo->prepare(
            'SELECT cs.*, c.subject_code, c.subject_title, c.section_designation,
                    p.full_name AS host_name, p.avatar_url AS host_avatar
             FROM class_sessions cs
             JOIN classrooms c ON c.id = cs.classroom_id
             JOIN profiles p ON p.id = cs.host_id
             WHERE cs.classroom_id = :cid AND cs.status = \'live\'
             ORDER BY cs.actual_started_at DESC
             LIMIT 1'
        );
        $liveStmt->execute(['cid' => $classroomId]);
        $live = $liveStmt->fetch(PDO::FETCH_ASSOC);
        if ($live) return $live;

        // Check if there is a scheduled session starting within 30 minutes
        $now = date('Y-m-d H:i:s');
        $window = date('Y-m-d H:i:s', strtotime('+30 minutes'));

        $schedStmt = $pdo->prepare(
            'SELECT cs.*, c.subject_code, c.subject_title, c.section_designation,
                    p.full_name AS host_name, p.avatar_url AS host_avatar
             FROM class_sessions cs
             JOIN classrooms c ON c.id = cs.classroom_id
             JOIN profiles p ON p.id = cs.host_id
             WHERE cs.classroom_id = :cid
               AND cs.status = \'scheduled\'
               AND cs.scheduled_start <= :window
               AND cs.scheduled_end >= :now
             ORDER BY cs.scheduled_start ASC
             LIMIT 1'
        );
        $schedStmt->execute(['cid' => $classroomId, 'window' => $window, 'now' => $now]);
        return $schedStmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public static function startMeeting(string $sessionId, string $hostId): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return null;

        $stmt = $pdo->prepare(
            'UPDATE class_sessions
             SET status = \'live\', actual_started_at = NOW()
             WHERE id = :id AND host_id = :hid
             RETURNING *'
        );
        $stmt->execute(['id' => $sessionId, 'hid' => $hostId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public static function endMeeting(string $sessionId, string $hostId): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return null;

        $stmt = $pdo->prepare(
            'UPDATE class_sessions
             SET status = \'ended\', actual_ended_at = NOW()
             WHERE id = :id AND host_id = :hid
             RETURNING *'
        );
        $stmt->execute(['id' => $sessionId, 'hid' => $hostId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public static function cancelSession(string $sessionId, string $hostId, string $reason): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return null;

        $stmt = $pdo->prepare(
            'UPDATE class_sessions
             SET status = \'cancelled\', cancel_reason = :reason
             WHERE id = :id AND host_id = :hid
             RETURNING *'
        );
        $stmt->execute(['id' => $sessionId, 'hid' => $hostId, 'reason' => trim($reason)]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public static function rescheduleSession(
        string $originalSessionId,
        string $hostId,
        string $newStart,
        string $newEnd,
        string $title
    ): ?array {
        $pdo = Database::getConnection();
        if ($pdo === null) return null;

        $origStmt = $pdo->prepare('SELECT * FROM class_sessions WHERE id = :id LIMIT 1');
        $origStmt->execute(['id' => $originalSessionId]);
        $orig = $origStmt->fetch(PDO::FETCH_ASSOC);
        if (!$orig) return null;

        $pdo->beginTransaction();
        try {
            // Mark original as cancelled
            $pdo->prepare('UPDATE class_sessions SET status = \'cancelled\', cancel_reason = \'Rescheduled by instructor\' WHERE id = :id')
                ->execute(['id' => $originalSessionId]);

            // Create replacement session
            $newId = Security::generateUuid();
            $newCode = self::generateMeetingCode($orig['title']);

            $insStmt = $pdo->prepare(
                'INSERT INTO class_sessions (id, classroom_id, schedule_id, host_id, title, meeting_code, session_type, status, scheduled_start, scheduled_end, replacement_for_id)
                 VALUES (:id, :cid, :sch, :hid, :title, :code, \'replacement\', \'scheduled\', :start, :end, :rep)
                 RETURNING *'
            );
            $insStmt->execute([
                'id' => $newId,
                'cid' => $orig['classroom_id'],
                'sch' => $orig['schedule_id'],
                'hid' => $hostId,
                'title' => trim($title),
                'code' => $newCode,
                'start' => date('Y-m-d H:i:s', strtotime($newStart)),
                'end' => date('Y-m-d H:i:s', strtotime($newEnd)),
                'rep' => $originalSessionId,
            ]);
            $replacement = $insStmt->fetch(PDO::FETCH_ASSOC);

            $pdo->commit();
            return $replacement ?: null;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    public static function recordAttendance(string $sessionId, string $userId, string $role = 'participant', ?string $deviceInfo = null): bool
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return false;

        $stmt = $pdo->prepare(
            'INSERT INTO session_participants (id, session_id, user_id, role, joined_at, device_info)
             VALUES (:id, :sid, :uid, :role, NOW(), :dev)
             ON CONFLICT (session_id, user_id, joined_at) DO NOTHING'
        );
        return $stmt->execute([
            'id' => Security::generateUuid(),
            'sid' => $sessionId,
            'uid' => $userId,
            'role' => $role,
            'dev' => $deviceInfo ? substr($deviceInfo, 0, 120) : null,
        ]);
    }
}
