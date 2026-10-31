<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Models\Post;
use App\Models\User;
use App\Services\AuthService;
use App\Services\StorageService;
use App\Validators\ProfileValidator;
use App\Validators\UploadValidator;

class ProfileController
{
    private ProfileValidator $validator;
    private UploadValidator $uploadValidator;
    private StorageService $storage;
    private AuthService $auth;

    public function __construct()
    {
        $this->validator = new ProfileValidator();
        $this->uploadValidator = new UploadValidator();
        $this->storage = new StorageService();
        $this->auth = new AuthService();
    }

    public function index(Request $request): void
    {
        $user = $request->getUser();
        $limit = min(50, max(1, (int)$request->query('limit', 20)));

        $list = User::listActive($limit, $user['id'] ?? null);
        $sanitized = array_map([$this->auth, 'sanitizeUser'], $list);

        JsonResponse::success(['items' => $sanitized], 'Campus directory retrieved.');
    }

    public function show(Request $request): void
    {
        $target = $request->param('idOrUsername');
        $isUuid = preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', (string)$target);

        $user = $isUuid ? User::findById((string)$target) : User::findByUsername((string)$target);

        if ($user === null) {
            JsonResponse::error('NOT_FOUND', 'Campus member profile not found.', 404);
            return;
        }

        JsonResponse::success([
            'profile' => $this->auth->sanitizeUser($user),
        ], 'Profile retrieved.');
    }

    public function updateMe(Request $request): void
    {
        $user = $request->getUser();
        $body = $request->all();

        if (!$this->validator->validateUpdateMe($body)) {
            JsonResponse::validationError($this->validator->errors());
            return;
        }

        $updated = User::update($user['id'], $body);
        if ($updated === null) {
            JsonResponse::error('INTERNAL_ERROR', 'Could not update profile.', 500);
            return;
        }

        JsonResponse::success([
            'profile' => $this->auth->sanitizeUser($updated),
        ], 'Profile updated successfully.');
    }

    public function uploadAvatar(Request $request): void
    {
        $user = $request->getUser();
        $file = $request->file('avatar') ?? $request->file('image');

        if (!$this->uploadValidator->validateImage($file)) {
            JsonResponse::validationError($this->uploadValidator->errors());
            return;
        }

        $url = $this->storage->storeUploadedFile($file, 'avatars');
        if ($url === null) {
            JsonResponse::error('UPLOAD_FAILED', 'Could not process profile photo upload.', 500);
            return;
        }

        $updated = User::update($user['id'], ['avatar_url' => $url]);

        JsonResponse::success([
            'profile' => $this->auth->sanitizeUser($updated ?? $user),
            'url' => $url,
        ], 'Profile photo updated successfully.');
    }

    public function uploadCover(Request $request): void
    {
        $user = $request->getUser();
        $file = $request->file('cover') ?? $request->file('image');

        if (!$this->uploadValidator->validateImage($file)) {
            JsonResponse::validationError($this->uploadValidator->errors());
            return;
        }

        $url = $this->storage->storeUploadedFile($file, 'covers');
        if ($url === null) {
            JsonResponse::error('UPLOAD_FAILED', 'Could not process cover banner upload.', 500);
            return;
        }

        $updated = User::update($user['id'], ['cover_url' => $url]);

        JsonResponse::success([
            'profile' => $this->auth->sanitizeUser($updated ?? $user),
            'url' => $url,
        ], 'Cover banner updated successfully.');
    }

    public function posts(Request $request): void
    {
        $authorId = (string)$request->param('id');
        $currentUser = $request->getUser();
        $limit = min(50, max(1, (int)$request->query('limit', 20)));
        $cursor = $request->query('cursor');

        $result = Post::listFeed($currentUser['id'] ?? null, 'all', $cursor, $limit, null, $authorId);

        JsonResponse::paginated(
            $result['items'],
            $result['has_more'],
            $result['next_cursor'],
            $limit,
            'User timeline retrieved.'
        );
    }
}
