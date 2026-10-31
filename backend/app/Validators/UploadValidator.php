<?php

declare(strict_types=1);

namespace App\Validators;

use App\Config\Config;

class UploadValidator extends Validator
{
    private array $allowedMimes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
    ];

    public function validateImage(?array $file): bool
    {
        $this->errors = [];

        if ($file === null || ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            $this->addError('image', 'Please select an image to upload.');
            return false;
        }

        if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
            $this->addError('image', 'File upload error occurred.');
            return false;
        }

        $maxBytes = Config::storage()['max_bytes'];
        if (($file['size'] ?? 0) > $maxBytes) {
            $this->addError('image', 'Image size cannot exceed 5 MB.');
            return false;
        }

        if (!file_exists($file['tmp_name'])) {
            $this->addError('image', 'Uploaded file could not be read.');
            return false;
        }

        $realMime = $this->detectMimeType($file['tmp_name']);

        if (!in_array($realMime, $this->allowedMimes, true)) {
            $this->addError('image', 'Only JPEG, PNG, WebP, and GIF images are permitted.');
            return false;
        }

        return true;
    }

    public function detectMimeType(string $tmpName): string
    {
        if (class_exists(\finfo::class)) {
            try {
                $finfo = new \finfo(FILEINFO_MIME_TYPE);
                $mime = $finfo->file($tmpName);
                if (!empty($mime)) {
                    return (string)$mime;
                }
            } catch (\Throwable $e) {
                // Fall through to binary/getimagesize detection
            }
        }

        if (function_exists('getimagesize')) {
            $imgInfo = @getimagesize($tmpName);
            if (!empty($imgInfo['mime'])) {
                return (string)$imgInfo['mime'];
            }
        }

        $handle = @fopen($tmpName, 'rb');
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

        return 'application/octet-stream';
    }
}
