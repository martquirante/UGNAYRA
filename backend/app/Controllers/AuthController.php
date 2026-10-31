<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Helpers\Security;
use App\Models\Notification;
use App\Models\User;
use App\Services\AuthService;
use App\Validators\AuthValidator;

class AuthController
{
    private AuthService $auth;
    private AuthValidator $validator;

    public function __construct()
    {
        $this->auth = new AuthService();
        $this->validator = new AuthValidator();
    }

    public function csrf(Request $request): void
    {
        $user = $request->getUser();
        $sessionToken = $user['session_token'] ?? ($_COOKIE[\App\Config\Config::session()['name']] ?? null);
        $token = $sessionToken ? \App\Models\Session::getCsrfTokenForSession($sessionToken) : Security::generateToken(32);

        JsonResponse::success([
            'csrf_token' => $token,
        ], 'CSRF token issued.');
    }

    public function providers(Request $request): void
    {
        JsonResponse::success($this->auth->getProviderStatus(), 'Auth provider status retrieved.');
    }

    public function googleAuth(Request $request): void
    {
        $body = $request->all();

        try {
            $result = $this->auth->authenticateWithGoogle($body, $request->ip(), $request->userAgent());
            $msg = !empty($result['needs_onboarding'])
                ? 'Google account verified. Please complete your campus profile.'
                : 'Signed in with Google successfully.';
            JsonResponse::success($result, $msg);
        } catch (\RuntimeException $e) {
            JsonResponse::error('UNAUTHENTICATED', $e->getMessage(), 401);
        } catch (\Throwable $e) {
            JsonResponse::error('INTERNAL_ERROR', 'Unable to verify Google sign-in right now.', 500);
        }
    }

    public function googleComplete(Request $request): void
    {
        $body = $request->all();

        if (!$this->validator->validateGoogleOnboarding($body)) {
            JsonResponse::validationError($this->validator->errors());
            return;
        }

        try {
            $result = $this->auth->completeGoogleOnboarding($body, $request->ip(), $request->userAgent());
            JsonResponse::success($result, 'Campus profile completed! Welcome to UGNAYRA.', 201);
        } catch (\InvalidArgumentException $e) {
            JsonResponse::error('CONFLICT', $e->getMessage(), 409);
        } catch (\RuntimeException $e) {
            JsonResponse::error('UNAUTHENTICATED', $e->getMessage(), 401);
        } catch (\Throwable $e) {
            JsonResponse::error('INTERNAL_ERROR', 'Unable to complete campus profile.', 500);
        }
    }

    public function register(Request $request): void
    {
        $body = $request->all();

        if (!$this->validator->validateRegister($body)) {
            JsonResponse::validationError($this->validator->errors());
            return;
        }

        try {
            $result = $this->auth->register($body, $request->ip(), $request->userAgent());
            JsonResponse::success($result, 'Account created successfully! Welcome to UGNAYRA.', 201);
        } catch (\InvalidArgumentException $e) {
            JsonResponse::error('CONFLICT', $e->getMessage(), 409);
        } catch (\Throwable $e) {
            JsonResponse::error('INTERNAL_ERROR', $e->getMessage(), 500);
        }
    }

    public function login(Request $request): void
    {
        $body = $request->all();

        if (!$this->validator->validateLogin($body)) {
            JsonResponse::validationError($this->validator->errors());
            return;
        }

        try {
            $result = $this->auth->login(
                (string)$body['identifier'],
                (string)$body['password'],
                $request->ip(),
                $request->userAgent()
            );
            JsonResponse::success($result, 'Signed in successfully.');
        } catch (\RuntimeException $e) {
            JsonResponse::error('UNAUTHENTICATED', $e->getMessage(), 401);
        } catch (\Throwable $e) {
            JsonResponse::error('INTERNAL_ERROR', 'An error occurred during authentication.', 500);
        }
    }

    public function logout(Request $request): void
    {
        $token = $_COOKIE[\App\Config\Config::session()['name']] ?? null;
        $this->auth->logout($token);

        JsonResponse::success(null, 'Signed out safely.');
    }

    public function me(Request $request): void
    {
        $user = $request->getUser();

        if ($user === null) {
            JsonResponse::success([
                'authenticated' => false,
                'user' => null,
                'csrf_token' => Security::generateToken(32),
                'firebase' => \App\Config\Config::firebase(),
            ], 'No active session.');
            return;
        }

        $fresh = User::findById($user['id']);
        $sanitized = $fresh ? $this->auth->sanitizeUser($fresh) : $this->auth->sanitizeUser($user);
        $unreadNotifs = Notification::getUnreadCount($user['id']);
        $sessionToken = $user['session_token'] ?? ($_COOKIE[\App\Config\Config::session()['name']] ?? null);
        $csrfToken = $sessionToken ? \App\Models\Session::getCsrfTokenForSession($sessionToken) : Security::generateToken(32);

        JsonResponse::success([
            'authenticated' => true,
            'user' => $sanitized,
            'csrf_token' => $csrfToken,
            'unread_notifications_count' => $unreadNotifs,
            'unread_messages_count' => 0,
            'firebase' => \App\Config\Config::firebase(),
        ], 'Active session retrieved.');
    }
}
