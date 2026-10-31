<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Config\Config;
use App\Helpers\JsonResponse;
use App\Helpers\Request;

class RateLimitMiddleware implements MiddlewareInterface
{
    private string $storageDir;

    public function __construct()
    {
        $this->storageDir = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'rate_limits';
        if (!is_dir($this->storageDir)) {
            @mkdir($this->storageDir, 0755, true);
        }
    }

    public function handle(Request $request, callable $next): void
    {
        $limits = Config::rateLimits();
        $isAuth = str_starts_with($request->path(), '/api/v1/auth/');

        $max = $isAuth ? $limits['auth_max'] : $limits['api_max'];
        $window = $isAuth ? $limits['auth_window'] : $limits['api_window'];

        $key = sprintf('%s_%s', md5($request->ip()), $isAuth ? 'auth' : 'api');
        $file = $this->storageDir . DIRECTORY_SEPARATOR . $key . '.json';

        $now = time();
        $data = ['count' => 0, 'reset_at' => $now + $window];

        if (file_exists($file)) {
            $content = @file_get_contents($file);
            if ($content !== false) {
                $decoded = json_decode($content, true);
                if (is_array($decoded) && isset($decoded['reset_at']) && $decoded['reset_at'] > $now) {
                    $data = $decoded;
                }
            }
        }

        $data['count']++;
        @file_put_contents($file, json_encode($data), LOCK_EX);

        header("X-RateLimit-Limit: {$max}");
        header('X-RateLimit-Remaining: ' . max(0, $max - $data['count']));
        header("X-RateLimit-Reset: {$data['reset_at']}");

        if ($data['count'] > $max) {
            header('Retry-After: ' . max(1, $data['reset_at'] - $now));
            JsonResponse::error(
                'RATE_LIMITED',
                'Too many requests. Please wait a moment before trying again.',
                429
            );
            return;
        }

        $next($request);
    }
}
