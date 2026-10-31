<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Helpers\JsonResponse;
use App\Helpers\Request;

class RoleMiddleware implements MiddlewareInterface
{
    private array $allowedRoles;

    public function __construct(array $allowedRoles)
    {
        $this->allowedRoles = $allowedRoles;
    }

    public function handle(Request $request, callable $next): void
    {
        $user = $request->getUser();
        if ($user === null) {
            JsonResponse::error('UNAUTHENTICATED', 'Sign in required.', 401);
            return;
        }

        $userRole = (string)($user['role'] ?? '');
        if (!in_array($userRole, $this->allowedRoles, true)) {
            JsonResponse::error(
                'FORBIDDEN',
                'This action requires faculty or authorized school personnel privileges.',
                403
            );
            return;
        }

        $next($request);
    }
}
