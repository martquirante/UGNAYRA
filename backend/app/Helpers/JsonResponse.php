<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * UGNAYRA — Uniform JSON API Response Envelope Helper
 * Ensures all HTTP responses strictly conform to docs/api-documentation.md
 */
class JsonResponse
{
    public static function success(
        mixed $data = null,
        string $message = 'Success',
        int $statusCode = 200,
        array $extraMeta = []
    ): void {
        $requestId = 'req_' . bin2hex(random_bytes(6));
        $now = (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Manila')))->format(\DateTimeInterface::ATOM);

        $payload = [
            'success' => true,
            'message' => $message,
            'data' => $data ?? (object)[],
            'meta' => array_merge([
                'timestamp' => $now,
                'request_id' => $requestId,
            ], $extraMeta),
        ];

        self::send($payload, $statusCode);
    }

    public static function paginated(
        array $items,
        bool $hasMore = false,
        ?string $nextCursor = null,
        int $limit = 20,
        string $message = 'Items retrieved',
        int $statusCode = 200,
        array $extraData = []
    ): void {
        $requestId = 'req_' . bin2hex(random_bytes(6));
        $now = (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Manila')))->format(\DateTimeInterface::ATOM);

        $payload = [
            'success' => true,
            'message' => $message,
            'data' => array_merge([
                'items' => $items,
            ], $extraData),
            'meta' => [
                'timestamp' => $now,
                'request_id' => $requestId,
                'pagination' => [
                    'limit' => $limit,
                    'next_cursor' => $nextCursor,
                    'has_more' => $hasMore,
                ],
            ],
        ];

        self::send($payload, $statusCode);
    }

    public static function error(
        string $code,
        string $message,
        int $statusCode = 400,
        ?array $details = null
    ): void {
        $requestId = 'req_' . bin2hex(random_bytes(6));
        $now = (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Manila')))->format(\DateTimeInterface::ATOM);

        $errorObj = [
            'code' => $code,
            'message' => $message,
        ];

        if ($details !== null && !empty($details)) {
            $errorObj['details'] = $details;
        }

        $payload = [
            'success' => false,
            'error' => $errorObj,
            'meta' => [
                'timestamp' => $now,
                'request_id' => $requestId,
            ],
        ];

        self::send($payload, $statusCode);
    }

    public static function validationError(array $fieldErrors, string $message = 'Please review the highlighted fields.'): void
    {
        self::error('VALIDATION_ERROR', $message, 422, $fieldErrors);
    }

    public static function send(array $payload, int $statusCode = 200, array $headers = []): void
    {
        if (!headers_sent()) {
            http_response_code($statusCode);
            header('Content-Type: application/json; charset=utf-8');
            header('X-Content-Type-Options: nosniff');
            header('X-Frame-Options: SAMEORIGIN');
            header('Referrer-Policy: strict-origin-when-cross-origin');

            foreach ($headers as $k => $v) {
                header("{$k}: {$v}");
            }
        }

        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }
}
