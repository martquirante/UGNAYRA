<?php

declare(strict_types=1);

namespace App\Services;

use App\Config\Config;
use App\Helpers\Security;
use App\Helpers\Logger;

/**
 * UGNAYRA — File & Media Storage Service
 * Supports local storage (development) and Supabase Storage bucket (production).
 */
class StorageService
{
    private array $allowedMimes = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];

    private SupabaseClient $supabase;

    public function __construct()
    {
        $this->supabase = new SupabaseClient();
    }

    public function detectMimeType(string $path): string
    {
        if (class_exists(\finfo::class)) {
            try {
                $finfo = new \finfo(FILEINFO_MIME_TYPE);
                $mime = $finfo->file($path);
                if (!empty($mime)) {
                    return (string)$mime;
                }
            } catch (\Throwable $e) {
                // Fall through to binary/getimagesize detection
            }
        }

        if (function_exists('getimagesize')) {
            $imgInfo = @getimagesize($path);
            if (!empty($imgInfo['mime'])) {
                return (string)$imgInfo['mime'];
            }
        }

        $handle = @fopen($path, 'rb');
        if ($handle !== false) {
            $bytes = (string)fread($handle, 16);
            fclose($handle);

            if (strncmp($bytes, "\xFF\xD8\xFF", 3) === 0) {
                return 'image/jpeg';
            }
            if (strncmp($bytes, "\x89PNG\r\n\x1a\n", 8) === 0) {
                return 'image/png';
            }
            if (strncmp($bytes, "GIF87a", 6) === 0 || strncmp($bytes, "GIF89a", 6) === 0) {
                return 'image/gif';
            }
            if (strncmp($bytes, "RIFF", 4) === 0 && substr($bytes, 8, 4) === "WEBP") {
                return 'image/webp';
            }
        }

        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        return match ($ext) {
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'webp' => 'image/webp',
            'gif' => 'image/gif',
            default => 'application/octet-stream',
        };
    }

    /**
     * Store uploaded file from $_FILES array
     */
    public function storeUploadedFile(array $fileInfo, string $subfolder = 'posts'): ?string
    {
        if (!isset($fileInfo['tmp_name']) || !file_exists($fileInfo['tmp_name'])) {
            return null;
        }

        $isUploaded = is_uploaded_file($fileInfo['tmp_name']);
        if (!$isUploaded && Config::app()['env'] !== 'development' && PHP_SAPI !== 'cli') {
            return null;
        }

        $maxBytes = Config::storage()['max_bytes'];
        if (($fileInfo['size'] ?? 0) > $maxBytes) {
            return null;
        }

        // Verify true MIME type safely
        $realMime = $this->detectMimeType($fileInfo['tmp_name']);

        if (!isset($this->allowedMimes[$realMime])) {
            return null;
        }

        $ext = $this->allowedMimes[$realMime];
        $filename = sprintf('%s_%s.%s', date('Ymd_His'), Security::generateToken(8), $ext);
        $relativePath = $subfolder . '/' . $filename;

        $content = file_get_contents($fileInfo['tmp_name']);
        if ($content === false) {
            return null;
        }

        // Try Supabase Storage if configured and requested
        $driver = Config::storage()['driver'];
        if ($driver === 'supabase' && $this->supabase->isConfigured()) {
            $remoteUrl = $this->supabase->uploadStorageObject($relativePath, $realMime, $content);
            if ($remoteUrl !== null) {
                return $remoteUrl;
            }
            Logger::error('Supabase storage upload failed, falling back to local storage.');
        }

        // Fallback to local storage
        $localDir = Config::storage()['local_dir'] . DIRECTORY_SEPARATOR . $subfolder;
        if (!is_dir($localDir)) {
            @mkdir($localDir, 0755, true);
        }

        $destPath = $localDir . DIRECTORY_SEPARATOR . $filename;
        $saved = $isUploaded ? move_uploaded_file($fileInfo['tmp_name'], $destPath) : (bool)file_put_contents($destPath, $content);
        if ($saved) {
            // Also copy to backend/public/uploads so static server serves directly
            $publicUploadDir = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . $subfolder;
            if (!is_dir($publicUploadDir)) {
                @mkdir($publicUploadDir, 0755, true);
            }
            @copy($destPath, $publicUploadDir . DIRECTORY_SEPARATOR . $filename);

            // Return URL path relative to backend public or full local path
            return 'uploads/' . $subfolder . '/' . $filename;
        }

        return null;
    }
}
