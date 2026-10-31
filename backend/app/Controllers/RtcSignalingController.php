<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Helpers\Security;
use App\Models\Conversation;

class RtcSignalingController
{
    public function createSession(Request $request): void
    {
        $user = $request->getUser();
        $targetUserId = (string)($request->input('target_user_id') ?? '');
        $conversationId = (string)($request->input('conversation_id') ?? '');
        $callType = (string)($request->input('call_type', 'audio'));

        if (empty($targetUserId) && !empty($conversationId)) {
            $conv = Conversation::findById($conversationId, $user['id']);
            if (!empty($conv['peer']['id'])) {
                $targetUserId = (string)$conv['peer']['id'];
            }
        }

        if (empty($targetUserId) || $targetUserId === $user['id']) {
            JsonResponse::error('BAD_REQUEST', 'Invalid call target.', 400);
            return;
        }

        $id = Security::generateUuid();
        $pdo = Database::getConnection();

        if ($pdo !== null) {
            try {
                // Primary schema (conversation_id, initiator_id, status)
                $stmt = $pdo->prepare('INSERT INTO rtc_call_sessions (id, conversation_id, initiator_id, status) VALUES (:id, :cid, :iid, \'ringing\')');
                $stmt->execute([
                    'id' => $id,
                    'cid' => $conversationId ?: $id,
                    'iid' => $user['id'],
                ]);
            } catch (\Throwable $_e1) {
                try {
                    // Alternative schema (caller_id, receiver_id, call_type, status)
                    $stmt = $pdo->prepare('INSERT INTO rtc_call_sessions (id, caller_id, receiver_id, call_type, status) VALUES (:id, :cid, :rid, :type, \'calling\')');
                    $stmt->execute([
                        'id' => $id,
                        'cid' => $user['id'],
                        'rid' => $targetUserId,
                        'type' => $callType,
                    ]);
                } catch (\Throwable $_e2) {}
            }
        }

        JsonResponse::success([
            'session_id' => $id,
            'call_type' => $callType,
            'status' => 'calling',
            'target_user_id' => $targetUserId,
        ], 'WebRTC session initiated.', 201);
    }

    public function signal(Request $request): void
    {
        $sessionId = (string)$request->param('id');
        $user = $request->getUser();
        $payload = $request->input('payload');
        $type = (string)($request->input('signal_type') ?? $request->input('type') ?? 'ice-candidate');

        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $jsonPayload = is_string($payload) ? $payload : json_encode($payload);
            try {
                $stmt = $pdo->prepare('INSERT INTO rtc_signaling_events (id, call_session_id, sender_id, signal_type, payload) VALUES (:id, :sid, :uid, :t, :p::jsonb)');
                $stmt->execute([
                    'id' => Security::generateUuid(),
                    'sid' => $sessionId,
                    'uid' => $user['id'],
                    't' => $type,
                    'p' => $jsonPayload,
                ]);
            } catch (\Throwable $_e1) {
                try {
                    $stmt = $pdo->prepare('INSERT INTO rtc_signaling_events (id, session_id, sender_id, event_type, payload) VALUES (:id, :sid, :uid, :t, :p::jsonb)');
                    $stmt->execute([
                        'id' => Security::generateUuid(),
                        'sid' => $sessionId,
                        'uid' => $user['id'],
                        't' => $type,
                        'p' => $jsonPayload,
                    ]);
                } catch (\Throwable $_e2) {}
            }
        }

        JsonResponse::success(null, 'Signal queued.');
    }

    public function getSignals(Request $request): void
    {
        $sessionId = (string)$request->param('id');
        $user = $request->getUser();
        $after = $request->query('after');

        $pdo = Database::getConnection();
        $events = [];

        if ($pdo !== null) {
            try {
                $sql = 'SELECT * FROM rtc_signaling_events WHERE (call_session_id = :sid OR session_id = :sid) AND sender_id != :uid';
                $params = ['sid' => $sessionId, 'uid' => $user['id']];
                if ($after) {
                    $sql .= ' AND created_at > :after';
                    $params['after'] = $after;
                }
                $sql .= ' ORDER BY created_at ASC';
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                $events = $stmt->fetchAll() ?: [];
            } catch (\Throwable $_e) {}
        }

        JsonResponse::success(['events' => $events], 'Signaling events retrieved.');
    }
}
