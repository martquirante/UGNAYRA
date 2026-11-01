<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Helpers\Security;
use App\Models\Announcement;
use App\Validators\AnnouncementValidator;

class AnnouncementController
{
    private AnnouncementValidator $validator;

    public function __construct()
    {
        $this->validator = new AnnouncementValidator();
    }

    public function index(Request $request): void
    {
        $category = $request->query('category');
        $limit = min(50, max(1, (int)$request->query('limit', 30)));

        $list = Announcement::listAnnouncements($category, $limit);
        JsonResponse::success(['items' => $list], 'Official announcements retrieved.');
    }

    public function store(Request $request): void
    {
        $user = $request->getUser();

        // Gated: only teachers and personnel can publish official bulletins
        if (!in_array($user['role'] ?? '', ['teacher', 'personnel'], true)) {
            JsonResponse::error('FORBIDDEN', 'Only faculty and school personnel can publish official bulletins.', 403);
            return;
        }

        $body = $request->all();
        if (!$this->validator->validateCreate($body)) {
            JsonResponse::validationError($this->validator->errors());
            return;
        }

        $body['author_id'] = $user['id'];
        if (isset($body['title'])) {
            $body['title'] = Security::sanitizeString((string)$body['title']);
        }
        if (isset($body['content'])) {
            $body['content'] = Security::sanitizeString((string)$body['content']);
        }
        $ann = Announcement::create($body);

        if ($ann === null) {
            JsonResponse::error('INTERNAL_ERROR', 'Could not publish announcement.', 500);
            return;
        }

        JsonResponse::success(['announcement' => $ann], 'Official bulletin published.', 201);
    }

    public function destroy(Request $request): void
    {
        $id = (string)$request->param('id');
        $user = $request->getUser();

        $ann = Announcement::findById($id);
        if ($ann === null) {
            JsonResponse::error('NOT_FOUND', 'Announcement not found.', 404);
            return;
        }

        $canDelete = ($ann['author_id'] === $user['id']) || ($user['role'] === 'personnel');
        if (!$canDelete) {
            JsonResponse::error('FORBIDDEN', 'You cannot remove this bulletin.', 403);
            return;
        }

        Announcement::delete($id);
        JsonResponse::success(null, 'Announcement removed.');
    }
}
