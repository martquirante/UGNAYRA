<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Models\AcademicGroup;

class AcademicGroupController
{
    /**
     * GET /api/v1/groups
     */
    public function index(Request $request): void
    {
        $user = $request->getUser();
        $type = (string)($request->query('type') ?? '');
        $groups = AcademicGroup::listForUser($user['id'], $type ?: null);
        JsonResponse::success($groups, 'Groups retrieved.');
    }

    /**
     * POST /api/v1/groups
     */
    public function store(Request $request): void
    {
        $user = $request->getUser();
        $data = $request->all();

        if (empty(trim((string)($data['name'] ?? '')))) {
            JsonResponse::validationError(['name' => ['Group name is required.']]);
            return;
        }

        try {
            $group = AcademicGroup::create($data, $user['id']);
            if ($group) {
                JsonResponse::success($group, 'Group chat created successfully!', 201);
                return;
            }
            JsonResponse::error('CREATION_FAILED', 'Could not create group chat.', 500);
        } catch (\Throwable $e) {
            JsonResponse::error('ERROR', $e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/groups/{id}
     */
    public function show(Request $request): void
    {
        $id = (string)$request->param('id');
        $user = $request->getUser();

        $group = AcademicGroup::findById($id, $user['id']);
        if (!$group) {
            JsonResponse::error('NOT_FOUND', 'Group not found.', 404);
            return;
        }

        JsonResponse::success($group, 'Group details retrieved.');
    }

    /**
     * GET /api/v1/groups/join-preview?token={token}
     */
    public function joinPreview(Request $request): void
    {
        $token = (string)($request->query('token') ?? '');
        if (empty($token)) {
            JsonResponse::validationError(['token' => ['Invitation token is required.']]);
            return;
        }

        $invite = AcademicGroup::findByToken($token);
        if (!$invite) {
            JsonResponse::error('INVALID_INVITATION', 'This invitation link is invalid or has expired.', 404);
            return;
        }

        JsonResponse::success($invite, 'Invitation preview retrieved.');
    }

    /**
     * POST /api/v1/groups/join
     */
    public function join(Request $request): void
    {
        $token = (string)($request->input('token') ?? '');
        $note = (string)($request->input('note') ?? '');
        $user = $request->getUser();

        if (empty($token)) {
            JsonResponse::validationError(['token' => ['Invitation token is required.']]);
            return;
        }

        $result = AcademicGroup::joinViaToken($token, $user['id'], $note);
        if ($result['success']) {
            JsonResponse::success($result, 'Group joined successfully!');
            return;
        }

        JsonResponse::error('JOIN_FAILED', $result['error'] ?? 'Could not join group.', 400);
    }
}
