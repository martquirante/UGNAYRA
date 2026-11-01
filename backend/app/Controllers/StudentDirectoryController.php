<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\JsonResponse;
use App\Helpers\Request;
use PDO;

class StudentDirectoryController
{
    /**
     * GET /api/v1/directory/students
     * Filters students by Program, Year Level, Section, or query string
     */
    public function index(Request $request): void
    {
        $program = (string)($request->query('program') ?? '');
        $yearLevel = (string)($request->query('year_level') ?? '');
        $section = (string)($request->query('section') ?? '');
        $search = trim((string)($request->query('q') ?? ''));

        $pdo = Database::getConnection();
        if ($pdo === null) {
            $sb = new \App\Services\SupabaseClient();
            if ($sb->isConfigured()) {
                $params = [
                    'role' => 'eq.student',
                    'is_active' => 'eq.true',
                    'order' => 'full_name.asc',
                    'limit' => 100,
                    'select' => 'id,full_name,username,school_id_number,avatar_url,department,year_or_grade,section,program_code,year_level_code,section_letter,academic_status',
                ];
                if (!empty($search)) {
                    $cleanSearch = str_replace(['%', '*', '(', ')'], '', $search);
                    $params['or'] = sprintf('(full_name.ilike.*%s*,username.ilike.*%s*,school_id_number.ilike.*%s*)', $cleanSearch, $cleanSearch, $cleanSearch);
                }
                $students = $sb->queryTable('profiles', $params) ?: [];
                JsonResponse::success($students, 'Directory query executed.');
                return;
            }
            JsonResponse::success([], 'Directory query executed.');
            return;
        }

        $sql = "SELECT id, full_name, username, school_id_number, avatar_url, department, year_or_grade, section, program_code, year_level_code, section_letter, academic_status
                FROM profiles
                WHERE role = 'student' AND is_active = true";

        $params = [];

        if (!empty($program)) {
            $sql .= " AND (program_code = :prog OR department ILIKE :prog_like)";
            $params['prog'] = strtoupper($program);
            $params['prog_like'] = '%' . $program . '%';
        }

        if (!empty($yearLevel)) {
            $sql .= " AND (year_level_code = :yr OR year_or_grade ILIKE :yr_like)";
            $params['yr'] = $yearLevel;
            $params['yr_like'] = '%' . $yearLevel . '%';
        }

        if (!empty($section)) {
            $sql .= " AND (section_letter = :sec OR section ILIKE :sec_like)";
            $params['sec'] = strtoupper($section);
            $params['sec_like'] = '%' . $section . '%';
        }

        if (!empty($search)) {
            $sql .= " AND (full_name ILIKE :q OR username ILIKE :q OR school_id_number ILIKE :q)";
            $params['q'] = '%' . $search . '%';
        }

        $sql .= " ORDER BY full_name ASC LIMIT 100";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $students = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        JsonResponse::success($students, 'Student directory retrieved.');
    }
}
