<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Models\Classroom;

class ClassroomController
{
    /**
     * GET /api/v1/classrooms
     */
    public function index(Request $request): void
    {
        $user = $request->getUser();
        $classrooms = Classroom::listForUser($user['id'], $user['role'] ?? 'student');
        JsonResponse::success([
            'classrooms' => $classrooms,
            'items' => $classrooms,
        ], 'Classrooms retrieved.');
    }

    /**
     * POST /api/v1/classrooms
     */
    public function store(Request $request): void
    {
        $user = $request->getUser();
        if (($user['role'] ?? '') === 'student') {
            JsonResponse::error('FORBIDDEN', 'Only faculty members may create classrooms.', 403);
            return;
        }

        $data = $request->all();
        if (empty($data['subject_code']) || empty($data['subject_title']) || empty($data['section_designation'])) {
            JsonResponse::validationError([
                'subject_code' => empty($data['subject_code']) ? ['Subject code is required.'] : [],
                'subject_title' => empty($data['subject_title']) ? ['Subject title is required.'] : [],
                'section_designation' => empty($data['section_designation']) ? ['Section designation is required.'] : [],
            ]);
            return;
        }

        $classroom = Classroom::create($data, $user['id']);
        if ($classroom) {
            JsonResponse::success([
                'classroom' => $classroom,
                'id' => $classroom['id'] ?? null,
            ], 'Classroom created successfully!', 201);
            return;
        }

        JsonResponse::error('CREATION_FAILED', 'Failed to create classroom space.', 500);
    }

    /**
     * GET /api/v1/classrooms/{id}
     */
    public function show(Request $request): void
    {
        $id = (string)$request->param('id');
        $user = $request->getUser();

        $classroom = Classroom::findById($id, $user['id']);
        if (!$classroom) {
            JsonResponse::error('NOT_FOUND', 'Classroom not found.', 404);
            return;
        }

        JsonResponse::success(array_merge($classroom, ['classroom' => $classroom]), 'Classroom details retrieved.');
    }

    /**
     * POST /api/v1/classrooms/join
     */
    public function join(Request $request): void
    {
        $code = (string)($request->input('join_code') ?? '');
        $batch = $request->input('batch') !== null ? (int)$request->input('batch') : null;
        $user = $request->getUser();

        if (empty($code)) {
            JsonResponse::validationError(['join_code' => ['Classroom join code is required.']]);
            return;
        }

        $classroom = Classroom::findByJoinCode($code);
        if (!$classroom) {
            JsonResponse::error('NOT_FOUND', 'Invalid classroom code. Please verify with your instructor.', 404);
            return;
        }

        $enrolled = Classroom::enrollStudent($classroom['id'], $user['id'], $batch, $user['role'] ?? 'student');
        if ($enrolled) {
            JsonResponse::success($classroom, 'Successfully enrolled in ' . $classroom['subject_title'] . '!');
            return;
        }

        JsonResponse::error('ENROLLMENT_FAILED', 'Could not complete classroom enrollment.', 500);
    }

    /**
     * GET /api/v1/classrooms/{id}/people
     */
    public function people(Request $request): void
    {
        $id = (string)$request->param('id');
        $roster = Classroom::getRoster($id);
        JsonResponse::success($roster, 'Classroom roster retrieved.');
    }

    /**
     * GET /api/v1/classrooms/{id}/stream
     */
    public function stream(Request $request): void
    {
        $id = (string)$request->param('id');
        $stream = Classroom::getStream($id);
        JsonResponse::success($stream, 'Classroom stream announcements retrieved.');
    }

    /**
     * POST /api/v1/classrooms/{id}/stream
     */
    public function postAnnouncement(Request $request): void
    {
        $id = (string)$request->param('id');
        $user = $request->getUser();
        $content = (string)($request->input('content') ?? '');
        $attachments = $request->input('attachments') ?? [];

        if (empty(trim($content))) {
            JsonResponse::validationError(['content' => ['Announcement text is required.']]);
            return;
        }

        $post = Classroom::postAnnouncement($id, $user['id'], $content, is_array($attachments) ? $attachments : []);
        if ($post) {
            JsonResponse::success($post, 'Announcement posted to classroom stream.', 201);
            return;
        }

        JsonResponse::error('FAILED', 'Could not publish classroom announcement.', 500);
    }
}
