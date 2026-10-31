<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Notification;
use App\Models\Post;
use App\Models\User;

class NotificationService
{
    public static function notifyLike(string $postId, string $likerId): void
    {
        $post = Post::findById($postId);
        if ($post === null || $post['author']['id'] === $likerId) {
            return; // Don't notify self-likes
        }

        $liker = User::findById($likerId);
        $name = $liker['full_name'] ?? 'A classmate';

        Notification::create([
            'recipient_id' => $post['author']['id'],
            'actor_id' => $likerId,
            'type' => 'post_like',
            'entity_type' => 'post',
            'entity_id' => $postId,
            'title' => "{$name} liked your campus post.",
            'preview' => self::truncate((string)($post['content'] ?? ''), 80),
        ]);
    }

    public static function notifyComment(string $postId, string $commenterId, string $commentSnippet): void
    {
        $post = Post::findById($postId);
        if ($post === null || $post['author']['id'] === $commenterId) {
            return;
        }

        $commenter = User::findById($commenterId);
        $name = $commenter['full_name'] ?? 'A classmate';

        Notification::create([
            'recipient_id' => $post['author']['id'],
            'actor_id' => $commenterId,
            'type' => 'post_comment',
            'entity_type' => 'post',
            'entity_id' => $postId,
            'title' => "{$name} commented on your post.",
            'preview' => self::truncate($commentSnippet, 80),
        ]);
    }

    public static function notifyMessage(string $conversationId, string $senderId, string $recipientId, string $snippet): void
    {
        $sender = User::findById($senderId);
        $name = $sender['full_name'] ?? 'A classmate';

        Notification::create([
            'recipient_id' => $recipientId,
            'actor_id' => $senderId,
            'type' => 'new_message',
            'entity_type' => 'conversation',
            'entity_id' => $conversationId,
            'title' => "New message from {$name}",
            'preview' => self::truncate($snippet, 80),
        ]);
    }

    private static function truncate(string $text, int $limit): string
    {
        if (function_exists('mb_substr')) {
            return mb_substr($text, 0, $limit, 'UTF-8');
        }
        return substr($text, 0, $limit);
    }
}
