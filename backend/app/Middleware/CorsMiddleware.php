<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Config\Config;
use App\Helpers\Request;

class CorsMiddleware implements MiddlewareInterface
{
    public static function applyHeaders(): void
    {
        if (headers_sent()) {
            return;
        }

        $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
        $allowedOrigins = Config::corsOrigins();

        $matchedOrigin = null;
        if ($origin !== null) {
            foreach ($allowedOrigins as $allowed) {
                if ($allowed === '*' || strcasecmp($allowed, $origin) === 0) {
                    $matchedOrigin = $origin;
                    break;
                }
            }

            // Permissive matching for local development origins (localhost, 127.0.0.1)
            if ($matchedOrigin === null && Config::app()['env'] === 'development') {
                if (preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?$#i', $origin)) {
                    $matchedOrigin = $origin;
                }
            }
        }

        if ($matchedOrigin !== null) {
            header("Access-Control-Allow-Origin: {$matchedOrigin}");
            header('Vary: Origin');
            header('Access-Control-Allow-Credentials: true');
            header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
            header('Access-Control-Allow-Headers: Accept, Content-Type, Authorization, X-CSRF-Token, X-Requested-With, X-HTTP-Method-Override');
            header('Access-Control-Max-Age: 86400');
        }
    }

    public function handle(Request $request, callable $next): void
    {
        self::applyHeaders();

        // Handle preflight OPTIONS request
        if ($request->method() === 'OPTIONS') {
            http_response_code(204);
            exit;
        }

        $next($request);
    }
}
