<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Helpers\Security;
use App\Models\ClassSession;
use PDO;

class ScheduleController
{
    /**
     * GET /api/v1/classrooms/{id}/schedules
     */
    public function schedules(Request $request): void
    {
        $classroomId = (string)$request->param('id');
        $pdo = Database::getConnection();
        if ($pdo === null) {
            JsonResponse::success([], 'Schedules retrieved.');
            return;
        }

        $stmt = $pdo->prepare('SELECT * FROM class_schedules WHERE classroom_id = :cid AND is_active = true ORDER BY day_of_week ASC, start_time ASC');
        $stmt->execute(['cid' => $classroomId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        JsonResponse::success($rows, 'Classroom schedules retrieved.');
    }

    /**
     * POST /api/v1/classrooms/{id}/schedules
     * Creates schedule with conflict collision check
     */
    public function storeSchedule(Request $request): void
    {
        $classroomId = (string)$request->param('id');
        $user = $request->getUser();

        if (($user['role'] ?? '') === 'student') {
            JsonResponse::error('FORBIDDEN', 'Only instructors may schedule classes.', 403);
            return;
        }

        $data = $request->all();
        $day = (int)($data['day_of_week'] ?? 1);
        $start = trim((string)($data['start_time'] ?? ''));
        $end = trim((string)($data['end_time'] ?? ''));
        $mode = $data['meeting_mode'] ?? 'online';
        $type = $data['schedule_type'] ?? 'lecture';
        $batch = !empty($data['applicable_batch']) ? (int)$data['applicable_batch'] : null;

        if (empty($start) || empty($end) || $end <= $start) {
            JsonResponse::validationError(['time' => ['End time must be after start time.']]);
            return;
        }

        $pdo = Database::getConnection();
        if ($pdo === null) {
            JsonResponse::error('DATABASE_UNAVAILABLE', 'Database connection not available.', 500);
            return;
        }

        // Conflict check: Overlap detection query
        $chkStmt = $pdo->prepare(
            'SELECT cs.id, c.subject_title
             FROM class_schedules cs
             JOIN classrooms c ON c.id = cs.classroom_id
             WHERE cs.classroom_id = :cid
               AND cs.day_of_week = :day
               AND cs.is_active = true
               AND (cs.start_time < :end AND cs.end_time > :start)
             LIMIT 1'
        );
        $chkStmt->execute(['cid' => $classroomId, 'day' => $day, 'start' => $start, 'end' => $end]);
        $conflict = $chkStmt->fetch(PDO::FETCH_ASSOC);

        if ($conflict) {
            JsonResponse::validationError(['schedule' => ['Timeslot conflicts with an existing schedule for this classroom.']]);
            return;
        }

        $id = Security::generateUuid();
        $insStmt = $pdo->prepare(
            'INSERT INTO class_schedules (id, classroom_id, schedule_type, applicable_batch, day_of_week, start_time, end_time, room_location, meeting_mode)
             VALUES (:id, :cid, :type, :batch, :day, :start, :end, :loc, :mode)
             RETURNING *'
        );
        $insStmt->execute([
            'id' => $id,
            'cid' => $classroomId,
            'type' => $type,
            'batch' => $batch,
            'day' => $day,
            'start' => $start,
            'end' => $end,
            'loc' => trim((string)($data['room_location'] ?? 'Online / Virtual')),
            'mode' => $mode,
        ]);

        $created = $insStmt->fetch(PDO::FETCH_ASSOC);
        JsonResponse::success($created, 'Class schedule saved successfully.', 201);
    }

    /**
     * GET /api/v1/classrooms/{id}/sessions/active
     */
    public function activeSession(Request $request): void
    {
        $classroomId = (string)$request->param('id');
        $session = ClassSession::getActiveOrUpcoming($classroomId);
        JsonResponse::success($session, 'Active meeting session checked.');
    }

    /**
     * POST /api/v1/classrooms/{id}/meetings/instant
     * Host starts an instant online meeting
     */
    public function instantMeeting(Request $request): void
    {
        $classroomId = (string)$request->param('id');
        $user = $request->getUser();

        if (($user['role'] ?? '') === 'student') {
            JsonResponse::error('FORBIDDEN', 'Only instructors may host meetings.', 403);
            return;
        }

        $title = (string)($request->input('title') ?? 'Online Class Session');
        $code = ClassSession::generateMeetingCode('live');
        $now = date('Y-m-d H:i:s');
        $end = date('Y-m-d H:i:s', strtotime('+2 hours'));

        $pdo = Database::getConnection();
        if ($pdo === null) {
            JsonResponse::error('DB_ERROR', 'Database unavailable.', 500);
            return;
        }

        $id = Security::generateUuid();
        $stmt = $pdo->prepare(
            'INSERT INTO class_sessions (id, classroom_id, host_id, title, meeting_code, session_type, status, scheduled_start, scheduled_end, actual_started_at)
             VALUES (:id, :cid, :hid, :title, :code, \'regular_scheduled\', \'live\', :start, :end, :act)
             RETURNING *'
        );
        $stmt->execute([
            'id' => $id,
            'cid' => $classroomId,
            'hid' => $user['id'],
            'title' => trim($title),
            'code' => $code,
            'start' => $now,
            'end' => $end,
            'act' => $now,
        ]);

        $created = $stmt->fetch(PDO::FETCH_ASSOC);
        JsonResponse::success($created, 'Virtual classroom live session started!', 201);
    }

    /**
     * POST /api/v1/class-sessions/{id}/end
     */
    public function endMeeting(Request $request): void
    {
        $sessionId = (string)$request->param('id');
        $user = $request->getUser();

        $ended = ClassSession::endMeeting($sessionId, $user['id']);
        if ($ended) {
            JsonResponse::success($ended, 'Meeting ended successfully.');
            return;
        }
        JsonResponse::error('FAILED', 'Could not terminate meeting.', 400);
    }

    /**
     * POST /api/v1/class-sessions/{id}/cancel
     */
    public function cancelSession(Request $request): void
    {
        $sessionId = (string)$request->param('id');
        $user = $request->getUser();
        $reason = (string)($request->input('reason') ?? 'Instructor unavailable');

        $cancelled = ClassSession::cancelSession($sessionId, $user['id'], $reason);
        if ($cancelled) {
            JsonResponse::success($cancelled, 'Session marked as cancelled and students notified.');
            return;
        }
        JsonResponse::error('FAILED', 'Could not cancel session.', 400);
    }

    /**
     * POST /api/v1/class-sessions/reschedule
     */
    public function reschedule(Request $request): void
    {
        $user = $request->getUser();
        $origId = (string)($request->input('original_session_id') ?? '');
        $newStart = (string)($request->input('scheduled_start') ?? '');
        $newEnd = (string)($request->input('scheduled_end') ?? '');
        $title = (string)($request->input('title') ?? 'Replacement Class Session');

        if (empty($origId) || empty($newStart) || empty($newEnd)) {
            JsonResponse::validationError(['schedule' => ['Original session, new start time, and new end time are required.']]);
            return;
        }

        try {
            $replacement = ClassSession::rescheduleSession($origId, $user['id'], $newStart, $newEnd, $title);
            if ($replacement) {
                JsonResponse::success($replacement, 'Replacement session scheduled successfully!', 201);
                return;
            }
            JsonResponse::error('FAILED', 'Could not reschedule session.', 500);
        } catch (\Throwable $e) {
            JsonResponse::error('ERROR', $e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/meetings/{meetingCode}/validate
     * Validates access to WebRTC meeting, logs attendance, returns STUN/TURN ICE config
     */
    public function validateMeeting(Request $request): void
    {
        $code = (string)$request->param('meetingCode');
        $user = $request->getUser();

        $meeting = ClassSession::findByMeetingCode($code);
        if (!$meeting) {
            JsonResponse::error('NOT_FOUND', 'Virtual classroom session not found.', 404);
            return;
        }

        if ($meeting['status'] === 'ended' || $meeting['status'] === 'cancelled') {
            JsonResponse::error('SESSION_CLOSED', 'This virtual class session is already concluded.', 410);
            return;
        }

        // Determine attendee role
        $role = ($meeting['host_id'] === $user['id']) ? 'host' : 'participant';

        // Log attendance entry
        ClassSession::recordAttendance($meeting['id'], $user['id'], $role, $_SERVER['HTTP_USER_AGENT'] ?? null);

        // STUN/TURN ICE servers configuration
        $iceServers = [
            ['urls' => 'stun:stun.l.google.com:19302'],
            ['urls' => 'stun:stun1.l.google.com:19302'],
        ];

        JsonResponse::success([
            'meeting' => $meeting,
            'role' => $role,
            'ice_servers' => $iceServers,
            'user' => [
                'id' => $user['id'],
                'name' => $user['full_name'],
                'avatar' => $user['avatar_url'] ?? null,
            ],
        ], 'Meeting access validated.');
    }
}
