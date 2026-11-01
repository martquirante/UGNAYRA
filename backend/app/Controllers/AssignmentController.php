<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Models\Assignment;

class AssignmentController
{
    /**
     * GET /api/v1/classrooms/{id}/assignments
     */
    public function index(Request $request): void
    {
        $classroomId = (string)$request->param('id');
        $user = $request->getUser();

        $studentId = ($user['role'] ?? '') === 'student' ? $user['id'] : null;
        $assignments = Assignment::listForClassroom($classroomId, $studentId);
        JsonResponse::success([
            'assignments' => $assignments,
            'items' => $assignments,
        ], 'Classwork activities retrieved.');
    }

    /**
     * POST /api/v1/classrooms/{id}/assignments
     */
    public function store(Request $request): void
    {
        $classroomId = (string)$request->param('id');
        $user = $request->getUser();

        if (($user['role'] ?? '') === 'student') {
            JsonResponse::error('FORBIDDEN', 'Only instructors may publish assignments.', 403);
            return;
        }

        $data = $request->all();
        $data['classroom_id'] = $classroomId;

        if (empty(trim((string)($data['title'] ?? '')))) {
            JsonResponse::validationError(['title' => ['Activity title is required.']]);
            return;
        }

        $assignment = Assignment::create($data, $user['id']);
        if ($assignment) {
            JsonResponse::success([
                'assignment' => $assignment,
                'id' => $assignment['id'] ?? null,
            ], 'Assignment published successfully!', 201);
            return;
        }

        JsonResponse::error('FAILED', 'Could not create assignment.', 500);
    }

    /**
     * GET /api/v1/assignments/{id}
     */
    public function show(Request $request): void
    {
        $id = (string)$request->param('id');
        $user = $request->getUser();

        $studentId = ($user['role'] ?? '') === 'student' ? $user['id'] : null;
        $assignment = Assignment::findById($id, $studentId);
        if (!$assignment) {
            JsonResponse::error('NOT_FOUND', 'Assignment not found.', 404);
            return;
        }

        JsonResponse::success(array_merge($assignment, ['assignment' => $assignment]), 'Assignment details retrieved.');
    }
}
