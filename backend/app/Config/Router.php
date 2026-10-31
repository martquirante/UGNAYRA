<?php

declare(strict_types=1);

namespace App\Config;

use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Middleware\MiddlewareInterface;

class Router
{
    private array $routes = [];

    public function get(string $path, array|callable $handler, array $middleware = []): void
    {
        $this->addRoute('GET', $path, $handler, $middleware);
    }

    public function post(string $path, array|callable $handler, array $middleware = []): void
    {
        $this->addRoute('POST', $path, $handler, $middleware);
    }

    public function put(string $path, array|callable $handler, array $middleware = []): void
    {
        $this->addRoute('PUT', $path, $handler, $middleware);
    }

    public function patch(string $path, array|callable $handler, array $middleware = []): void
    {
        $this->addRoute('PATCH', $path, $handler, $middleware);
    }

    public function delete(string $path, array|callable $handler, array $middleware = []): void
    {
        $this->addRoute('DELETE', $path, $handler, $middleware);
    }

    private function addRoute(string $method, string $path, array|callable $handler, array $middleware): void
    {
        $this->routes[] = [
            'method' => $method,
            'pattern' => $this->compilePattern($path),
            'raw_path' => $path,
            'handler' => $handler,
            'middleware' => $middleware,
        ];
    }

    private function compilePattern(string $path): string
    {
        // Replace {paramName} with named capture regex (?P<paramName>[^/]+)
        $pattern = preg_replace('/\{([a-zA-Z0-9_]+)\}/', '(?P<$1>[^/]+)', $path);
        return '#^' . $pattern . '$#';
    }

    public function dispatch(Request $request): void
    {
        $method = $request->method();
        $path = $request->path();

        // Strip /public from path if running with Apache subfolder or direct file
        if (str_starts_with($path, '/public/')) {
            $path = substr($path, 7);
            $request->setPath($path);
        }

        if ($method === 'OPTIONS') {
            \App\Middleware\CorsMiddleware::applyHeaders();
            http_response_code(204);
            exit;
        }

        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) {
                continue;
            }

            if (preg_match($route['pattern'], $path, $matches)) {
                // Extract named parameters
                $params = [];
                foreach ($matches as $k => $v) {
                    if (is_string($k)) {
                        $params[$k] = rawurldecode($v);
                    }
                }
                $request->setRouteParams($params);

                // Run middleware pipeline
                $this->runPipeline($request, $route['middleware'], function (Request $req) use ($route) {
                    $handler = $route['handler'];
                    if (is_array($handler)) {
                        [$class, $methodName] = $handler;
                        $instance = new $class();
                        $instance->$methodName($req);
                    } elseif (is_callable($handler)) {
                        $handler($req);
                    }
                });

                return;
            }
        }

        JsonResponse::error('NOT_FOUND', "Endpoint '{$method} {$path}' does not exist on this server.", 404);
    }

    private function runPipeline(Request $request, array $middlewares, callable $destination): void
    {
        $pipeline = array_reduce(
            array_reverse($middlewares),
            function ($next, $middleware) {
                return function (Request $req) use ($middleware, $next) {
                    if ($middleware instanceof MiddlewareInterface) {
                        $middleware->handle($req, $next);
                    } elseif (is_string($middleware) && class_exists($middleware)) {
                        $instance = new $middleware();
                        if ($instance instanceof MiddlewareInterface) {
                            $instance->handle($req, $next);
                        } else {
                            $next($req);
                        }
                    } else {
                        $next($req);
                    }
                };
            },
            $destination
        );

        $pipeline($request);
    }
}
