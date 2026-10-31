<?php

declare(strict_types=1);

use App\Config\Router;
use App\Controllers\AcademicCatalogController;
use App\Controllers\AnnouncementController;
use App\Controllers\AuthController;
use App\Controllers\CommunityController;
use App\Controllers\HealthController;
use App\Controllers\MessageController;
use App\Controllers\NotificationController;
use App\Controllers\PostController;
use App\Controllers\PresenceController;
use App\Controllers\ProfileController;
use App\Controllers\RtcSignalingController;
use App\Controllers\SearchController;
use App\Middleware\CorsMiddleware;
use App\Middleware\CsrfMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Middleware\RoleMiddleware;
use App\Middleware\SessionAuthMiddleware;

$router = new Router();

$cors = new CorsMiddleware();
$rateLimit = new RateLimitMiddleware();
$optionalAuth = new SessionAuthMiddleware(true);
$auth = new SessionAuthMiddleware(false);
$csrf = new CsrfMiddleware();
$facultyOnly = new RoleMiddleware(['teacher', 'personnel']);

// Public & Health
$router->get('/api/v1/health', [HealthController::class, 'index'], [$cors]);
$router->get('/api/v1/academics/catalog', [AcademicCatalogController::class, 'index'], [$cors, $rateLimit]);
$router->get('/api/v1/auth/csrf', [AuthController::class, 'csrf'], [$cors, $rateLimit]);
$router->get('/api/v1/config/firebase', function () {
    \App\Helpers\JsonResponse::success([
        'firebase' => \App\Config\Config::firebase(),
    ]);
}, [$cors, $rateLimit]);

// Authentication (Public)
$router->get('/api/v1/auth/providers', [AuthController::class, 'providers'], [$cors, $rateLimit]);
$router->post('/api/v1/auth/register', [AuthController::class, 'register'], [$cors, $rateLimit]);
$router->post('/api/v1/auth/login', [AuthController::class, 'login'], [$cors, $rateLimit]);
$router->post('/api/v1/auth/google', [AuthController::class, 'googleAuth'], [$cors, $rateLimit]);
$router->post('/api/v1/auth/google/complete', [AuthController::class, 'googleComplete'], [$cors, $rateLimit]);
$router->post('/api/v1/auth/logout', [AuthController::class, 'logout'], [$cors]);
$router->get('/api/v1/auth/me', [AuthController::class, 'me'], [$cors, $optionalAuth]);

// Profiles & Directory
$router->get('/api/v1/profiles', [ProfileController::class, 'index'], [$cors, $auth]);
$router->get('/api/v1/profiles/{idOrUsername}', [ProfileController::class, 'show'], [$cors, $auth]);
$router->patch('/api/v1/profiles/me', [ProfileController::class, 'updateMe'], [$cors, $auth, $csrf]);
$router->post('/api/v1/profiles/me/avatar', [ProfileController::class, 'uploadAvatar'], [$cors, $auth, $csrf]);
$router->post('/api/v1/profiles/me/cover', [ProfileController::class, 'uploadCover'], [$cors, $auth, $csrf]);
$router->get('/api/v1/profiles/{id}/posts', [ProfileController::class, 'posts'], [$cors, $auth]);

// News Feed, Posts & Comments
$router->get('/api/v1/posts', [PostController::class, 'index'], [$cors, $auth]);
$router->post('/api/v1/posts', [PostController::class, 'store'], [$cors, $auth, $csrf]);
$router->get('/api/v1/posts/{id}', [PostController::class, 'show'], [$cors, $auth]);
$router->patch('/api/v1/posts/{id}', [PostController::class, 'update'], [$cors, $auth, $csrf]);
$router->delete('/api/v1/posts/{id}', [PostController::class, 'destroy'], [$cors, $auth, $csrf]);
$router->post('/api/v1/posts/{id}/like', [PostController::class, 'like'], [$cors, $auth, $csrf]);
$router->delete('/api/v1/posts/{id}/like', [PostController::class, 'unlike'], [$cors, $auth, $csrf]);
$router->post('/api/v1/posts/{id}/share', [PostController::class, 'share'], [$cors, $auth, $csrf]);
$router->get('/api/v1/posts/{id}/comments', [PostController::class, 'comments'], [$cors, $auth]);
$router->post('/api/v1/posts/{id}/comments', [PostController::class, 'storeComment'], [$cors, $auth, $csrf]);
$router->delete('/api/v1/comments/{commentId}', [PostController::class, 'destroyComment'], [$cors, $auth, $csrf]);

// Private Messaging & Presence
$router->get('/api/v1/conversations', [MessageController::class, 'conversations'], [$cors, $auth]);
$router->post('/api/v1/conversations', [MessageController::class, 'openConversation'], [$cors, $auth, $csrf]);
$router->get('/api/v1/conversations/{id}/messages', [MessageController::class, 'messages'], [$cors, $auth]);
$router->post('/api/v1/conversations/{id}/messages', [MessageController::class, 'sendMessage'], [$cors, $auth, $csrf]);
$router->post('/api/v1/conversations/{id}/read', [MessageController::class, 'markRead'], [$cors, $auth, $csrf]);
$router->post('/api/v1/conversations/{id}/typing', [MessageController::class, 'setTyping'], [$cors, $auth, $csrf]);
$router->post('/api/v1/presence/heartbeat', [PresenceController::class, 'heartbeat'], [$cors, $optionalAuth]);

// School Communities
$router->get('/api/v1/communities', [CommunityController::class, 'index'], [$cors, $auth]);
$router->post('/api/v1/communities', [CommunityController::class, 'store'], [$cors, $auth, $csrf]);
$router->get('/api/v1/communities/{idOrSlug}', [CommunityController::class, 'show'], [$cors, $auth]);
$router->post('/api/v1/communities/{id}/join', [CommunityController::class, 'join'], [$cors, $auth, $csrf]);
$router->delete('/api/v1/communities/{id}/leave', [CommunityController::class, 'leave'], [$cors, $auth, $csrf]);
$router->get('/api/v1/communities/{id}/members', [CommunityController::class, 'members'], [$cors, $auth]);
$router->get('/api/v1/communities/{id}/posts', [CommunityController::class, 'posts'], [$cors, $auth]);
$router->post('/api/v1/communities/{id}/posts', [CommunityController::class, 'storePost'], [$cors, $auth, $csrf]);

// Official School Announcements
$router->get('/api/v1/announcements', [AnnouncementController::class, 'index'], [$cors, $auth]);
$router->post('/api/v1/announcements', [AnnouncementController::class, 'store'], [$cors, $auth, $csrf, $facultyOnly]);
$router->delete('/api/v1/announcements/{id}', [AnnouncementController::class, 'destroy'], [$cors, $auth, $csrf]);

// Notifications
$router->get('/api/v1/notifications', [NotificationController::class, 'index'], [$cors, $auth]);
$router->post('/api/v1/notifications/{id}/read', [NotificationController::class, 'markRead'], [$cors, $auth, $csrf]);
$router->post('/api/v1/notifications/read-all', [NotificationController::class, 'markAllRead'], [$cors, $auth, $csrf]);

// Unified Search
$router->get('/api/v1/search', [SearchController::class, 'query'], [$cors, $auth]);

// Future WebRTC Seam
$router->post('/api/v1/rtc/sessions', [RtcSignalingController::class, 'createSession'], [$cors, $auth, $csrf]);
$router->post('/api/v1/rtc/sessions/{id}/signal', [RtcSignalingController::class, 'signal'], [$cors, $auth, $csrf]);
$router->get('/api/v1/rtc/sessions/{id}/signal', [RtcSignalingController::class, 'getSignals'], [$cors, $auth]);

return $router;
