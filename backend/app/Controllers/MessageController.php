<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Models\Conversation;
use App\Models\Message;
use App\Services\NotificationService;
use App\Services\StorageService;

class MessageController
{
    private StorageService $storage;

    public function __construct()
    {
        $this->storage = new StorageService();
    }

    public function conversations(Request $request): void
    {
        $user = $request->getUser();
        $limit = min(50, max(1, (int)$request->query('limit', 30)));

        $list = Conversation::listUserConversations($user['id'], $limit);
        JsonResponse::success([
            'conversations' => $list,
            'items' => $list,
        ], 'Conversations retrieved.');
    }

    public function openConversation(Request $request): void
    {
        $user = $request->getUser();
        $recipientId = (string)($request->input('recipient_id') ?? '');

        if (empty($recipientId) || $recipientId === $user['id']) {
            JsonResponse::error('BAD_REQUEST', 'Invalid recipient specified.', 400);
            return;
        }

        $conv = Conversation::getOrCreateDirect($user['id'], $recipientId);
        if ($conv === null) {
            JsonResponse::error('INTERNAL_ERROR', 'Could not open conversation.', 500);
            return;
        }

        JsonResponse::success(['conversation' => $conv], 'Conversation ready.');
    }

    public function messages(Request $request): void
    {
        $convId = (string)$request->param('id');
        $after = $request->query('after');
        $before = $request->query('before');
        $limit = min(100, max(1, (int)$request->query('limit', 40)));

        $messages = Message::listMessages($convId, $after, $before, $limit);
        JsonResponse::success([
            'messages' => $messages,
            'items' => $messages,
        ], 'Messages retrieved.');
    }

    public function sendMessage(Request $request): void
    {
        $convId = (string)$request->param('id');
        $user = $request->getUser();
        $body = (string)($request->input('body') ?? '');

        $attachmentUrl = null;
        if (isset($_FILES['attachment']) && ($_FILES['attachment']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
            $attachmentUrl = $this->storage->storeUploadedFile($_FILES['attachment'], 'messages');
        }

        if (trim($body) === '' && $attachmentUrl === null) {
            JsonResponse::error('BAD_REQUEST', 'Message cannot be empty.', 400);
            return;
        }

        $msg = Message::create($convId, $user['id'], $body, $attachmentUrl);
        if ($msg === null) {
            JsonResponse::error('INTERNAL_ERROR', 'Could not send message.', 500);
            return;
        }

        // Notify recipient if 1-to-1 conversation
        $conv = Conversation::findById($convId, $user['id']);
        if (!empty($conv['peer']['id'])) {
            NotificationService::notifyMessage($convId, $user['id'], $conv['peer']['id'], $body ?: 'Sent an image attachment.');
        }

        JsonResponse::success(['message' => $msg], 'Message delivered.', 201);
    }

    public function markRead(Request $request): void
    {
        $convId = (string)$request->param('id');
        $user = $request->getUser();

        Message::markRead($convId, $user['id']);
        JsonResponse::success(null, 'Marked as read.');
    }

    public function setTyping(Request $request): void
    {
        $convId = (string)$request->param('id');
        $user = $request->getUser();

        Message::setTyping($convId, $user['id'], 6);
        JsonResponse::success(null, 'Typing broadcasted.');
    }
}
