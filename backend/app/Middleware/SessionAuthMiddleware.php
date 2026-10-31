<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Config\Config;
use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Models\Session;

class SessionAuthMiddleware implements MiddlewareInterface
{
    private bool $optional;

    public function __construct(bool $optional = false)
    {
        $this->optional = $optional;
    }

    public function handle(Request $request, callable $next): void
    {
        $sessionName = Config::session()['name'];
        $token = $_COOKIE[$sessionName] ?? null;

        if ($token === null) {
            $authHeader = $request->header('Authorization');
            if ($authHeader !== null && str_starts_with($authHeader, 'Bearer ')) {
                $token = trim(substr($authHeader, 7));
            }
        }

        if ($token !== null && $token !== '') {
            $user = Session::findUserByToken($token);
            if ($user !== null) {
                $user['session_token'] = $token;
                $request->setUser($user);
            }
        }

        if (!$this->optional && $request->getUser() === null) {
            JsonResponse::error(
                'UNAUTHENTICATED',
                'Your session has expired or is invalid. Please sign in to continue.',
                401
            );
            return;
        }

        $next($request);
    }
}
