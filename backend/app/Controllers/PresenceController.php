<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Models\Notification;
use App\Models\User;

class PresenceController
{
    public function heartbeat(Request $request): void
    {
        $user = $request->getUser();

        if ($user !== null) {
            User::update($user['id'], [
                'last_seen_at' => (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM),
            ]);
            $unreadNotifs = Notification::getUnreadCount($user['id']);
        } else {
            $unreadNotifs = 0;
        }

        $activeUsers = User::listActive(8, $user['id'] ?? null);

        $online = array_map(function ($u) {
            $lastSeen = $u['last_seen_at'] ?? null;
            $isOnline = !empty($lastSeen) && (time() - strtotime($lastSeen) < 180);
            return [
                'id' => $u['id'],
                'full_name' => $u['full_name'],
                'username' => $u['username'],
                'role' => $u['role'],
                'department' => $u['department'] ?? null,
                'avatar_url' => $u['avatar_url'] ?? null,
                'is_online' => $isOnline,
            ];
        }, $activeUsers);

        JsonResponse::success([
            'unread_notifications_count' => $unreadNotifs,
            'unread_messages_count' => 0,
            'online_users' => $online,
            'online_contacts' => $online,
        ], 'Presence synchronized.');
    }
}
