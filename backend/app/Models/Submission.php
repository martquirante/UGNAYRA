<?php

declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Helpers\Security;
use PDO;

class Submission
{
    /**
     * Student submits or resubmits coursework
     */
    public static function submit(string $assignmentId, string $studentId, array $uploadedFiles, string $notes = ''): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return null;

        // Check assignment deadline
        $aStmt = $pdo->prepare('SELECT due_at, allow_resubmit FROM assignments WHERE id = :aid LIMIT 1');
        $aStmt->execute(['aid' => $assignmentId]);
        $assign = $aStmt->fetch(PDO::FETCH_ASSOC);
        if (!$assign) return null;

        $now = new \DateTimeImmutable('now', new \DateTimeZone('Asia/Manila'));
        $isLate = false;
        if (!empty($assign['due_at'])) {
            $dueDate = new \DateTimeImmutable($assign['due_at'], new \DateTimeZone('Asia/Manila'));
            if ($now > $dueDate) {
                $isLate = true;
            }
        }
        $status = $isLate ? 'LATE' : 'SUBMITTED';

        // Check if previous submission exists
        $subStmt = $pdo->prepare('SELECT * FROM submissions WHERE assignment_id = :aid AND student_id = :sid LIMIT 1');
        $subStmt->execute(['aid' => $assignmentId, 'sid' => $studentId]);
        $existing = $subStmt->fetch(PDO::FETCH_ASSOC);

        $pdo->beginTransaction();
        try {
            if ($existing) {
                if (empty($assign['allow_resubmit'])) {
                    $pdo->rollBack();
                    throw new \RuntimeException('Resubmissions are not permitted for this assignment.');
                }
                $version = (int)$existing['current_version'] + 1;
                $subId = $existing['id'];

                $uStmt = $pdo->prepare(
                    'UPDATE submissions
                     SET status = :st, current_version = :ver, submitted_at = NOW()
                     WHERE id = :id
                     RETURNING *'
                );
                $uStmt->execute(['st' => $status, 'ver' => $version, 'id' => $subId]);
                $submission = $uStmt->fetch(PDO::FETCH_ASSOC);
            } else {
                $version = 1;
                $subId = Security::generateUuid();

                $iStmt = $pdo->prepare(
                    'INSERT INTO submissions (id, assignment_id, student_id, status, current_version, submitted_at)
                     VALUES (:id, :aid, :sid, :st, :ver, NOW())
                     RETURNING *'
                );
                $iStmt->execute([
                    'id' => $subId,
                    'aid' => $assignmentId,
                    'sid' => $studentId,
                    'st' => $status,
                    'ver' => $version,
                ]);
                $submission = $iStmt->fetch(PDO::FETCH_ASSOC);
            }

            // Save individual file records
            $fileManifest = [];
            foreach ($uploadedFiles as $file) {
                $fileId = Security::generateUuid();
                $fStmt = $pdo->prepare(
                    'INSERT INTO submission_files (id, submission_id, version_number, file_name, file_size_bytes, file_mime, storage_path)
                     VALUES (:id, :sid, :ver, :name, :size, :mime, :path)'
                );
                $fStmt->execute([
                    'id' => $fileId,
                    'sid' => $subId,
                    'ver' => $version,
                    'name' => $file['name'],
                    'size' => (int)($file['size'] ?? 0),
                    'mime' => $file['mime'] ?? 'application/octet-stream',
                    'path' => $file['path'],
                ]);
                $fileManifest[] = [
                    'id' => $fileId,
                    'file_name' => $file['name'],
                    'file_size' => $file['size'] ?? 0,
                    'file_mime' => $file['mime'] ?? '',
                    'storage_path' => $file['path'],
                ];
            }

            // Record snapshot in submission_versions
            $vStmt = $pdo->prepare(
                'INSERT INTO submission_versions (id, submission_id, version_number, file_manifest, student_notes, is_late)
                 VALUES (:id, :sid, :ver, :manifest::jsonb, :notes, :late)'
            );
            $vStmt->execute([
                'id' => Security::generateUuid(),
                'sid' => $subId,
                'ver' => $version,
                'manifest' => json_encode($fileManifest),
                'notes' => trim($notes),
                'late' => $isLate,
            ]);

            $pdo->commit();
            $submission['files'] = $fileManifest;
            return $submission;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Teacher grades a submission
     */
    public static function grade(string $submissionId, string $teacherId, float $score, ?string $feedback = null): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return null;

        $pdo->beginTransaction();
        try {
            $currStmt = $pdo->prepare('SELECT current_score FROM submissions WHERE id = :id LIMIT 1');
            $currStmt->execute(['id' => $submissionId]);
            $prevScore = $currStmt->fetchColumn();

            $uStmt = $pdo->prepare(
                'UPDATE submissions
                 SET current_score = :score, current_feedback = :fb, status = \'GRADED\'
                 WHERE id = :id
                 RETURNING *'
            );
            $uStmt->execute([
                'score' => $score,
                'fb' => $feedback !== null ? trim($feedback) : null,
                'id' => $submissionId,
            ]);
            $updated = $uStmt->fetch(PDO::FETCH_ASSOC);

            // Insert audit log
            $aStmt = $pdo->prepare(
                'INSERT INTO grade_audit_logs (id, submission_id, graded_by, previous_score, new_score, feedback, action_type)
                 VALUES (:id, :sid, :gid, :prev, :new, :fb, :action)'
            );
            $aStmt->execute([
                'id' => Security::generateUuid(),
                'sid' => $submissionId,
                'gid' => $teacherId,
                'prev' => $prevScore !== false ? $prevScore : null,
                'new' => $score,
                'fb' => $feedback !== null ? trim($feedback) : null,
                'action' => $prevScore !== false ? 'grade_updated' : 'grade_assigned',
            ]);

            $pdo->commit();
            return $updated ?: null;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    public static function listForAssignment(string $assignmentId): array
    {
        $pdo = Database::getConnection();
        if ($pdo === null) return [];

        $stmt = $pdo->prepare(
            'SELECT s.*, p.full_name AS student_name, p.username AS student_username, p.avatar_url AS student_avatar,
                    p.school_id_number, p.section AS student_section
             FROM submissions s
             JOIN profiles p ON p.id = s.student_id
             WHERE s.assignment_id = :aid
             ORDER BY s.submitted_at DESC'
        );
        $stmt->execute(['aid' => $assignmentId]);
        $submissions = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        foreach ($submissions as &$sub) {
            $fStmt = $pdo->prepare('SELECT * FROM submission_files WHERE submission_id = :sid ORDER BY uploaded_at ASC');
            $fStmt->execute(['sid' => $sub['id']]);
            $sub['files'] = $fStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        }

        return $submissions;
    }
}
