<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Models\Notification;

class NotificationController
{
    public function index(Request $request): void
    {
        $user = $request->getUser();
        $filter = (string)$request->query('filter', 'all');
        $limit = min(60, max(1, (int)$request->query('limit', 40)));

        $result = Notification::listForUser($user['id'], $filter, $limit);

        JsonResponse::success([
            'items' => $result['items'],
            'unread_count' => $result['unread_count'],
        ], 'Notifications retrieved.');
    }

    public function markRead(Request $request): void
    {
        $id = (string)$request->param('id');
        $user = $request->getUser();

        Notification::markRead($id, $user['id']);
        JsonResponse::success(null, 'Notification marked as read.');
    }

    public function markAllRead(Request $request): void
    {
        $user = $request->getUser();

        Notification::markAllRead($user['id']);
        JsonResponse::success(null, 'All notifications marked as read.');
    }
}
