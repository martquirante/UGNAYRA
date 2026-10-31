<?php

declare(strict_types=1);

/**
 * UGNAYRA — School-Based Social Networking Platform
 * Front Controller & API Bootstrap
 */

// 1. PSR-4 Autoloader
spl_autoload_register(function (string $class): void {
    $prefix = 'App\\';
    $baseDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'app' . DIRECTORY_SEPARATOR;

    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }

    $relativeClass = substr($class, $len);
    $file = $baseDir . str_replace('\\', DIRECTORY_SEPARATOR, $relativeClass) . '.php';

    if (file_exists($file)) {
        require_once $file;
    }
});

// Load Composer autoload if present
$composerAutoload = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';
if (file_exists($composerAutoload)) {
    require_once $composerAutoload;
}

use App\Config\Env;
use App\Config\Config;
use App\Helpers\JsonResponse;
use App\Helpers\Logger;
use App\Helpers\Request;

// 2. Load Environment Configuration
Env::load(dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env');

// 3. System Configuration, Timezone & Global CORS Preflight Handling
date_default_timezone_set(Config::app()['timezone']);
error_reporting(E_ALL);
ini_set('display_errors', Config::app()['debug'] ? '1' : '0');

if (PHP_SAPI !== 'cli' || !empty($_SERVER['REQUEST_URI'])) {
    \App\Middleware\CorsMiddleware::applyHeaders();
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

// 4. Global Exception & Error Handlers (Clean JSON Envelopes)
set_exception_handler(function (\Throwable $e): void {
    Logger::error('Uncaught exception', [
        'message' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
    ]);

    $debug = Config::app()['debug'];
    JsonResponse::error(
        'INTERNAL_ERROR',
        $debug ? $e->getMessage() : 'An unexpected server error occurred.',
        500,
        $debug ? ['trace' => $e->getFile() . ':' . $e->getLine()] : null
    );
});

set_error_handler(function (int $errno, string $errstr, string $errfile, int $errline): bool {
    if (!(error_reporting() & $errno)) {
        return false;
    }
    if (in_array($errno, [E_DEPRECATED, E_USER_DEPRECATED], true)) {
        return true;
    }
    throw new \ErrorException($errstr, 0, $errno, $errfile, $errline);
});

// 5. Handle Static Upload Files if served directly via PHP built-in server
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
if (preg_match('#^/uploads/(.+)$#', $requestUri, $matches)) {
    $subPath = str_replace('/', DIRECTORY_SEPARATOR, $matches[1]);
    $filePath = Config::storage()['local_dir'] . DIRECTORY_SEPARATOR . $subPath;
    if (!file_exists($filePath)) {
        $publicPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . $subPath;
        if (file_exists($publicPath)) {
            $filePath = $publicPath;
        }
    }
    if (file_exists($filePath)) {
        $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        $mime = match ($ext) {
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'webp' => 'image/webp',
            'gif' => 'image/gif',
            'svg' => 'image/svg+xml',
            default => 'application/octet-stream',
        };
        header("Content-Type: {$mime}");
        header('Content-Length: ' . filesize($filePath));
        header('Cache-Control: public, max-age=86400');
        readfile($filePath);
        exit;
    }
}

// 6. Skip HTTP router dispatch if running under standalone CLI test runner
if (PHP_SAPI === 'cli' && empty($_SERVER['REQUEST_URI'])) {
    return;
}

// 7. Create Request and Dispatch Router
$request = new Request();
$router = require dirname(__DIR__) . DIRECTORY_SEPARATOR . 'routes' . DIRECTORY_SEPARATOR . 'api.php';
$router->dispatch($request);
