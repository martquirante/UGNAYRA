<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Helpers\Request;

interface MiddlewareInterface
{
    /**
     * Process request and call next handler or return/terminate early
     */
    public function handle(Request $request, callable $next): void;
}
