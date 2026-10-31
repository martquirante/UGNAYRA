<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Models\Session;

class CsrfMiddleware implements MiddlewareInterface
{
    private array $exemptPaths = [
        '/api/v1/health',
        '/api/v1/auth/csrf',
        '/api/v1/auth/login',
        '/api/v1/auth/register',
    ];

    public function handle(Request $request, callable $next): void
    {
        $method = $request->method();

        // Safe methods don't modify state
        if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            $next($request);
            return;
        }

        // Exempt public bootstrap/auth routes
        if (in_array($request->path(), $this->exemptPaths, true)) {
            $next($request);
            return;
        }

        // If user is authenticated, verify CSRF token
        $user = $request->getUser();
        if ($user !== null) {
            $csrfToken = $request->header('X-CSRF-Token') ?? $request->input('csrf_token');
            $sessionToken = $user['session_token'] ?? null;

            if (empty($csrfToken) || !Session::verifyCsrfToken($user['id'], (string)$csrfToken, $sessionToken)) {
                JsonResponse::error(
                    'CSRF_MISMATCH',
                    'Invalid or expired security token (CSRF). Please refresh the page and try again.',
                    403
                );
                return;
            }
        }

        $next($request);
    }
}
