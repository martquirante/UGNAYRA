<?php

declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Helpers\Security;
use App\Services\SupabaseClient;
use PDO;

class AcademicSection
{
    /**
     * Get active year levels for a program
     */
    public static function getYearLevels(string $programCode = ''): array
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $stmt = $pdo->query('SELECT code, label, sort_order FROM academic_year_levels WHERE is_active = true ORDER BY sort_order ASC');
            return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            return $sb->queryTable('academic_year_levels', ['is_active' => 'eq.true', 'order' => 'sort_order.asc']);
        }

        return [
            ['code' => '1st_year', 'label' => '1st Year', 'sort_order' => 1],
            ['code' => '2nd_year', 'label' => '2nd Year', 'sort_order' => 2],
            ['code' => '3rd_year', 'label' => '3rd Year', 'sort_order' => 3],
            ['code' => '4th_year', 'label' => '4th Year', 'sort_order' => 4],
        ];
    }

    /**
     * Get dynamic sections for a program and year level
     */
    public static function getSections(string $programCode, string $yearLevelCode, ?string $termId = null): array
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $sql = 'SELECT id, section_letter, default_lab_batches, max_capacity, is_active
                    FROM academic_sections
                    WHERE program_code = :prog AND year_level_code = :yr AND is_active = true';
            $params = ['prog' => $programCode, 'yr' => $yearLevelCode];
            if (!empty($termId)) {
                $sql .= ' AND term_id = :term';
                $params['term'] = $termId;
            }
            $sql .= ' ORDER BY section_letter ASC';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
            if (!empty($rows)) {
                return $rows;
            }
        }

        // Fallback baseline for clean UX if database is initializing
        return [
            ['id' => 'sec-a', 'section_letter' => 'A', 'default_lab_batches' => 2, 'max_capacity' => 45],
            ['id' => 'sec-b', 'section_letter' => 'B', 'default_lab_batches' => 2, 'max_capacity' => 45],
            ['id' => 'sec-c', 'section_letter' => 'C', 'default_lab_batches' => 2, 'max_capacity' => 45],
            ['id' => 'sec-d', 'section_letter' => 'D', 'default_lab_batches' => 2, 'max_capacity' => 45],
            ['id' => 'sec-e', 'section_letter' => 'E', 'default_lab_batches' => 2, 'max_capacity' => 45],
        ];
    }

    /**
     * Calculate canonical academic designation (e.g. BSIT + 2nd_year + D + 1 -> BSIT 2D1)
     */
    public static function computeDesignation(string $program, string $yearLevel, string $sectionLetter, ?int $batch = null): string
    {
        $cleanProg = strtoupper(trim($program));
        $cleanSec = strtoupper(trim($sectionLetter));

        // Extract year number (e.g., '2nd_year' -> '2')
        preg_match('/(\d+)/', $yearLevel, $matches);
        $yearDigit = !empty($matches[1]) ? $matches[1] : '1';

        $base = sprintf('%s %s%s', $cleanProg, $yearDigit, $cleanSec);
        if ($batch !== null && $batch > 0) {
            return $base . (string)$batch;
        }

        return $base;
    }

    /**
     * Admin: List all sections with term & program filters
     */
    public static function listAll(int $limit = 100): array
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $stmt = $pdo->prepare(
                'SELECT s.*, t.school_year, t.semester, p.name AS program_name, y.label AS year_label
                 FROM academic_sections s
                 JOIN academic_terms t ON t.id = s.term_id
                 JOIN academic_programs p ON p.code = s.program_code
                 JOIN academic_year_levels y ON y.code = s.year_level_code
                 ORDER BY t.school_year DESC, s.program_code ASC, s.year_level_code ASC, s.section_letter ASC
                 LIMIT :lim'
            );
            $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
            $stmt->execute();
            return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        }

        return [];
    }

    /**
     * Admin: Create section
     */
    public static function create(array $data): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $id = Security::generateUuid();
            $stmt = $pdo->prepare(
                'INSERT INTO academic_sections (id, term_id, program_code, year_level_code, section_letter, default_lab_batches, max_capacity, is_active)
                 VALUES (:id, :term, :prog, :yr, :sec, :batches, :cap, :act)
                 RETURNING *'
            );
            $stmt->execute([
                'id' => $id,
                'term' => $data['term_id'],
                'prog' => strtoupper(trim($data['program_code'])),
                'yr' => trim($data['year_level_code']),
                'sec' => strtoupper(trim($data['section_letter'])),
                'batches' => (int)($data['default_lab_batches'] ?? 2),
                'cap' => (int)($data['max_capacity'] ?? 45),
                'act' => !empty($data['is_active']),
            ]);
            return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        }

        return null;
    }

    /**
     * Admin: Update section
     */
    public static function update(string $id, array $data): ?array
    {
        $pdo = Database::getConnection();
        if ($pdo !== null) {
            $stmt = $pdo->prepare(
                'UPDATE academic_sections
                 SET default_lab_batches = :batches,
                     max_capacity = :cap,
                     is_active = :act
                 WHERE id = :id
                 RETURNING *'
            );
            $stmt->execute([
                'id' => $id,
                'batches' => (int)($data['default_lab_batches'] ?? 2),
                'cap' => (int)($data['max_capacity'] ?? 45),
                'act' => !empty($data['is_active']),
            ]);
            return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        }

        return null;
    }
}
