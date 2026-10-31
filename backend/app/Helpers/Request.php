<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * UGNAYRA — HTTP Request Representation
 * Encapsulates method tunneling, JSON body decoding, route params, headers, files, and user context.
 */
class Request
{
    private string $method;
    private string $path;
    private array $jsonBody = [];
    private array $routeParams = [];
    private ?array $user = null;

    public function __construct()
    {
        $rawMethod = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $override = $_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] ?? $_POST['_method'] ?? null;
        if ($override !== null && in_array(strtoupper((string)$override), ['PUT', 'PATCH', 'DELETE'], true)) {
            $this->method = strtoupper((string)$override);
        } else {
            $this->method = $rawMethod;
        }

        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $qPos = strpos($uri, '?');
        if ($qPos !== false) {
            $uri = substr($uri, 0, $qPos);
        }
        $this->path = '/' . trim(rawurldecode($uri), '/');

        // Parse JSON payload if Content-Type contains application/json
        $contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
        if (str_contains(strtolower($contentType), 'application/json')) {
            $rawInput = file_get_contents('php://input');
            if ($rawInput !== false && $rawInput !== '') {
                $decoded = json_decode($rawInput, true);
                if (is_array($decoded)) {
                    $this->jsonBody = $decoded;
                }
            }
        }
    }

    public function method(): string
    {
        return $this->method;
    }

    public function path(): string
    {
        return $this->path;
    }

    public function setPath(string $p): void
    {
        $this->path = $p;
    }

    public function json(?string $key = null, mixed $default = null): mixed
    {
        if ($key === null) {
            return $this->jsonBody;
        }
        return $this->jsonBody[$key] ?? $default;
    }

    public function query(?string $key = null, mixed $default = null): mixed
    {
        if ($key === null) {
            return $_GET;
        }
        return $_GET[$key] ?? $default;
    }

    public function post(?string $key = null, mixed $default = null): mixed
    {
        if ($key === null) {
            return $_POST;
        }
        return $_POST[$key] ?? $default;
    }

    public function all(): array
    {
        return array_merge($_GET, $_POST, $this->jsonBody);
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->jsonBody[$key] ?? $_POST[$key] ?? $_GET[$key] ?? $default;
    }

    public function file(string $key): ?array
    {
        if (isset($_FILES[$key]) && is_array($_FILES[$key]) && ($_FILES[$key]['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            return $_FILES[$key];
        }
        return null;
    }

    public function header(string $name, ?string $default = null): ?string
    {
        $normalized = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        if (isset($_SERVER[$normalized])) {
            return (string)$_SERVER[$normalized];
        }
        if (strtolower($name) === 'content-type' && isset($_SERVER['CONTENT_TYPE'])) {
            return (string)$_SERVER['CONTENT_TYPE'];
        }
        if (strtolower($name) === 'authorization' && isset($_SERVER['HTTP_AUTHORIZATION'])) {
            return (string)$_SERVER['HTTP_AUTHORIZATION'];
        }
        return $default;
    }

    public function ip(): string
    {
        return (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
    }

    public function userAgent(): string
    {
        return (string)($_SERVER['HTTP_USER_AGENT'] ?? 'Unknown');
    }

    public function setRouteParams(array $params): void
    {
        $this->routeParams = $params;
    }

    public function param(string $key, mixed $default = null): mixed
    {
        return $this->routeParams[$key] ?? $default;
    }

    public function setUser(?array $user): void
    {
        $this->user = $user;
    }

    public function getUser(): ?array
    {
        return $this->user;
    }

    public function user(): ?array
    {
        return $this->user;
    }
}
