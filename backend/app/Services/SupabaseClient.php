<?php

declare(strict_types=1);

namespace App\Services;

use App\Config\Config;
use App\Helpers\Logger;

/**
 * UGNAYRA — Server-Side Supabase Client (PostgREST & Storage HTTPS Gateway)
 * Provides authenticated server-side communication using SUPABASE_SERVICE_ROLE_KEY.
 * Never exposes keys or credentials to the client.
 */
class SupabaseClient
{
    private string $url;
    private string $serviceKey;
    private string $bucket;

    public function __construct()
    {
        $cfg = Config::supabase();
        $this->url = $cfg['url'];
        $this->serviceKey = !empty($cfg['service_role_key']) ? $cfg['service_role_key'] : $cfg['secret_key'];
        $this->bucket = Config::storage()['bucket'];
    }

    public function isConfigured(): bool
    {
        return !empty($this->url) && !empty($this->serviceKey);
    }

    public function isReachable(): bool
    {
        return $this->queryTable('profiles', ['select' => 'id', 'limit' => 1]) !== null;
    }

    /**
     * Upload binary data or file to Supabase Storage
     */
    public function uploadStorageObject(string $filePath, string $mimeType, string $fileContent): ?string
    {
        if (!$this->isConfigured()) {
            return null;
        }

        $endpoint = sprintf('%s/storage/v1/object/%s/%s', $this->url, $this->bucket, ltrim($filePath, '/'));

        $headers = [
            'Authorization: Bearer ' . $this->serviceKey,
            'apikey: ' . $this->serviceKey,
            'Content-Type: ' . $mimeType,
            'x-upsert: true',
        ];

        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $fileContent,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_SSL_VERIFYPEER => (Config::app()['env'] === 'production'),
        ]);

        $res = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        unset($ch);

        if ($err !== '' || ($status !== 200 && $status !== 201)) {
            Logger::error('Supabase storage upload failed', ['status' => $status, 'error' => $err, 'body' => $res]);
            return null;
        }

        // Return public URL to object
        return sprintf('%s/storage/v1/object/public/%s/%s', $this->url, $this->bucket, ltrim($filePath, '/'));
    }

    /**
     * Query table via PostgREST HTTPS API
     */
    public function queryTable(string $table, array $params = [], string $method = 'GET', ?array $body = null): ?array
    {
        if (!$this->isConfigured()) {
            return null;
        }

        $queryStr = http_build_query($params);
        $endpoint = sprintf('%s/rest/v1/%s%s', $this->url, $table, $queryStr !== '' ? '?' . $queryStr : '');

        $headers = [
            'Authorization: Bearer ' . $this->serviceKey,
            'apikey: ' . $this->serviceKey,
            'Content-Type: application/json',
            'Prefer: return=representation',
        ];

        $ch = curl_init($endpoint);
        $opts = [
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => (Config::app()['env'] === 'production'),
        ];

        if ($body !== null && ($method === 'POST' || $method === 'PATCH' || $method === 'PUT')) {
            $opts[CURLOPT_POSTFIELDS] = json_encode($body);
        }

        curl_setopt_array($ch, $opts);
        $res = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        unset($ch);

        if ($err !== '' || ($status < 200 || $status >= 300)) {
            Logger::error('Supabase PostgREST query failed', ['status' => $status, 'table' => $table, 'error' => $err, 'body' => $res]);
            return null;
        }

        $decoded = json_decode((string)$res, true);
        return is_array($decoded) ? $decoded : [];
    }

    /**
     * Fetch public Supabase Auth settings (e.g. external OAuth provider status)
     */
    public function getAuthSettings(): ?array
    {
        $cfg = Config::supabase();
        $apiKey = !empty($cfg['publishable_key']) ? $cfg['publishable_key'] : $this->serviceKey;
        if (empty($this->url) || empty($apiKey)) {
            return null;
        }

        $ch = curl_init($this->url . '/auth/v1/settings');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'apikey: ' . $apiKey,
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT => 6,
            CURLOPT_SSL_VERIFYPEER => (Config::app()['env'] === 'production'),
        ]);

        $res = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        unset($ch);

        if ($err !== '' || $status < 200 || $status >= 300) {
            return null;
        }

        $decoded = json_decode((string)$res, true);
        return is_array($decoded) ? $decoded : null;
    }

    /**
     * Verify a Supabase OAuth user access token and retrieve verified user metadata
     */
    public function verifyUserAccessToken(string $accessToken): ?array
    {
        $cfg = Config::supabase();
        $apiKey = !empty($cfg['publishable_key']) ? $cfg['publishable_key'] : $this->serviceKey;
        if (empty($this->url) || empty($apiKey) || trim($accessToken) === '') {
            return null;
        }

        $ch = curl_init($this->url . '/auth/v1/user');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'apikey: ' . $apiKey,
                'Authorization: Bearer ' . trim($accessToken),
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => (Config::app()['env'] === 'production'),
        ]);

        $res = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        unset($ch);

        if ($err !== '' || $status !== 200) {
            Logger::error('Supabase OAuth token verification failed', ['status' => $status, 'error' => $err]);
            return null;
        }

        $decoded = json_decode((string)$res, true);
        return (is_array($decoded) && !empty($decoded['email'])) ? $decoded : null;
    }
}
