<?php

declare(strict_types=1);

namespace App\Services;

use App\Config\Config;
use App\Helpers\Security;
use App\Helpers\Logger;

/**
 * UGNAYRA — File & Media Storage Service
 * Supports local storage (development) and Supabase Storage bucket (production).
 * Validates real magic bytes for images and academic documents (PDF, DOCX, ZIP, etc.).
 */
class StorageService
{
    private array $imageMimes = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];

    private array $documentMimes = [
        'application/pdf' => 'pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'application/msword' => 'doc',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'pptx',
        'application/vnd.ms-powerpoint' => 'ppt',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
        'application/vnd.ms-excel' => 'xls',
        'application/zip' => 'zip',
        'application/x-zip-compressed' => 'zip',
        'text/plain' => 'txt',
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
                if (!empty($mime) && $mime !== 'application/octet-stream') {
                    return (string)$mime;
                }
            } catch (\Throwable $_e) {}
        }

        if (function_exists('getimagesize')) {
            $imgInfo = @getimagesize($path);
            if (!empty($imgInfo['mime'])) {
                return (string)$imgInfo['mime'];
            }
        }

        // Magic byte detection
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
            if (strncmp($bytes, "%PDF-", 5) === 0) {
                return 'application/pdf';
            }
            if (strncmp($bytes, "PK\x03\x04", 4) === 0) {
                // ZIP container (could be docx, pptx, xlsx, or zip)
                $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
                return match ($ext) {
                    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    default => 'application/zip',
                };
            }
            if (strncmp($bytes, "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1", 8) === 0) {
                $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
                return match ($ext) {
                    'doc' => 'application/msword',
                    'ppt' => 'application/vnd.ms-powerpoint',
                    'xls' => 'application/vnd.ms-excel',
                    default => 'application/octet-stream',
                };
            }
        }

        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        return match ($ext) {
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'webp' => 'image/webp',
            'gif' => 'image/gif',
            'pdf' => 'application/pdf',
            'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'doc' => 'application/msword',
            'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'ppt' => 'application/vnd.ms-powerpoint',
            'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'xls' => 'application/vnd.ms-excel',
            'zip' => 'application/zip',
            'txt' => 'text/plain',
            default => 'application/octet-stream',
        };
    }

    /**
     * Store uploaded file from $_FILES array
     */
    public function storeUploadedFile(array $fileInfo, string $subfolder = 'posts', bool $allowDocuments = false): ?string
    {
        if (!isset($fileInfo['tmp_name']) || !file_exists($fileInfo['tmp_name'])) {
            return null;
        }

        $isUploaded = is_uploaded_file($fileInfo['tmp_name']);
        if (!$isUploaded && Config::app()['env'] !== 'development' && PHP_SAPI !== 'cli') {
            return null;
        }

        $maxBytes = Config::storage()['max_bytes'];
        // Allow up to 25MB for coursework submissions
        if ($allowDocuments) {
            $maxBytes = max($maxBytes, 26214400); // 25 MB
        }
        if (($fileInfo['size'] ?? 0) > $maxBytes) {
            return null;
        }

        $realMime = $this->detectMimeType($fileInfo['tmp_name']);

        $allowed = $this->imageMimes;
        if ($allowDocuments) {
            $allowed = array_merge($allowed, $this->documentMimes);
        }

        if (!isset($allowed[$realMime])) {
            return null;
        }

        $ext = $allowed[$realMime];
        $filename = sprintf('%s_%s.%s', date('Ymd_His'), Security::generateToken(8), $ext);
        $relativePath = $subfolder . '/' . $filename;

        $content = file_get_contents($fileInfo['tmp_name']);
        if ($content === false) {
            return null;
        }

        // Try Supabase Storage if configured
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
            $publicUploadDir = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . $subfolder;
            if (!is_dir($publicUploadDir)) {
                @mkdir($publicUploadDir, 0755, true);
            }
            @copy($destPath, $publicUploadDir . DIRECTORY_SEPARATOR . $filename);

            return 'uploads/' . $subfolder . '/' . $filename;
        }

        return null;
    }
}
