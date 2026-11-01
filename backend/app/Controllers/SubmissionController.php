<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Models\Submission;
use App\Services\StorageService;

class SubmissionController
{
    private StorageService $storage;

    public function __construct()
    {
        $this->storage = new StorageService();
    }

    /**
     * POST /api/v1/assignments/{id}/submit
     * Student uploads one or multiple coursework files
     */
    public function submit(Request $request): void
    {
        $assignmentId = (string)$request->param('id');
        $user = $request->getUser();
        $notes = (string)($request->input('notes') ?? '');

        $uploadedFiles = [];

        // Check if multiple files uploaded
        if (isset($_FILES['files']) && is_array($_FILES['files']['name'])) {
            $count = count($_FILES['files']['name']);
            for ($i = 0; $i < $count; $i++) {
                if (($_FILES['files']['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
                    $fileInfo = [
                        'name' => $_FILES['files']['name'][$i],
                        'type' => $_FILES['files']['type'][$i],
                        'tmp_name' => $_FILES['files']['tmp_name'][$i],
                        'error' => $_FILES['files']['error'][$i],
                        'size' => $_FILES['files']['size'][$i],
                    ];
                    $mime = $this->storage->detectMimeType($fileInfo['tmp_name']);
                    $path = $this->storage->storeUploadedFile($fileInfo, 'submissions', true);
                    if ($path) {
                        $uploadedFiles[] = [
                            'name' => $fileInfo['name'],
                            'size' => $fileInfo['size'],
                            'mime' => $mime,
                            'path' => $path,
                        ];
                    }
                }
            }
        } elseif (isset($_FILES['file']) && ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
            $fileInfo = $_FILES['file'];
            $mime = $this->storage->detectMimeType($fileInfo['tmp_name']);
            $path = $this->storage->storeUploadedFile($fileInfo, 'submissions', true);
            if ($path) {
                $uploadedFiles[] = [
                    'name' => $fileInfo['name'],
                    'size' => $fileInfo['size'],
                    'mime' => $mime,
                    'path' => $path,
                ];
            }
        }

        if (empty($uploadedFiles)) {
            JsonResponse::validationError(['files' => ['At least one valid document (PDF, DOCX, PPTX, XLSX, ZIP, or Image) must be attached.']]);
            return;
        }

        try {
            $submission = Submission::submit($assignmentId, $user['id'], $uploadedFiles, $notes);
            if ($submission) {
                JsonResponse::success($submission, 'Coursework successfully submitted!', 201);
                return;
            }
            JsonResponse::error('SUBMISSION_FAILED', 'Could not record coursework submission.', 500);
        } catch (\Throwable $e) {
            JsonResponse::error('SUBMISSION_ERROR', $e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/assignments/{id}/submissions
     * Teacher views all student submissions for an assignment
     */
    public function index(Request $request): void
    {
        $assignmentId = (string)$request->param('id');
        $user = $request->getUser();

        if (($user['role'] ?? '') === 'student') {
            JsonResponse::error('FORBIDDEN', 'Only instructors may view the submission matrix.', 403);
            return;
        }

        $submissions = Submission::listForAssignment($assignmentId);
        JsonResponse::success($submissions, 'Submissions retrieved.');
    }

    /**
     * POST /api/v1/submissions/{id}/grade
     * Teacher assigns score and feedback
     */
    public function grade(Request $request): void
    {
        $submissionId = (string)$request->param('id');
        $user = $request->getUser();

        if (($user['role'] ?? '') === 'student') {
            JsonResponse::error('FORBIDDEN', 'Only instructors may grade coursework.', 403);
            return;
        }

        $score = $request->input('score');
        $feedback = (string)($request->input('feedback') ?? '');

        if ($score === null || !is_numeric($score) || (float)$score < 0) {
            JsonResponse::validationError(['score' => ['A valid numeric score is required.']]);
            return;
        }

        try {
            $graded = Submission::grade($submissionId, $user['id'], (float)$score, $feedback);
            if ($graded) {
                JsonResponse::success($graded, 'Grade and feedback recorded successfully.');
                return;
            }
            JsonResponse::error('GRADING_FAILED', 'Could not record grade.', 500);
        } catch (\Throwable $e) {
            JsonResponse::error('GRADING_ERROR', $e->getMessage(), 400);
        }
    }
}
