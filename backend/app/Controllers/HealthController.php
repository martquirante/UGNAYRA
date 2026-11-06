<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Config;
use App\Config\Database;
use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Services\SupabaseClient;

class HealthController
{
    public function index(Request $request): void
    {
        $dbConnected = Database::isConnected();
        $sbClient = new SupabaseClient();
        $sbConfigured = $sbClient->isConfigured();
        $sbReachable = $sbConfigured && $sbClient->isReachable();

        $status = ($dbConnected || $sbReachable) ? 'healthy' : 'degraded';

        $data = [
            'status' => $status,
            'app_name' => Config::app()['name'],
            'environment' => Config::app()['env'],
            'php_version' => PHP_VERSION,
            'database' => [
                'pdo_pgsql' => $dbConnected ? 'connected' : 'disconnected',
                'supabase_https' => $sbReachable ? 'reachable' : ($sbConfigured ? 'unreachable' : 'unconfigured'),
                'message' => $dbConnected 
                    ? 'Connected directly to Supabase PostgreSQL pooler.'
                    : ($sbReachable ? 'Supabase HTTPS database gateway is reachable.' : 'Supabase database configuration is unavailable.'),
            ],
            'server_time' => (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Manila')))->format(\DateTimeInterface::ATOM),
        ];

        JsonResponse::success($data, 'System operational.', 200);
    }
}
