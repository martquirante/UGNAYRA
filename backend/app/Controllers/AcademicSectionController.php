<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Models\AcademicSection;

class AcademicSectionController
{
    /**
     * GET /api/v1/academics/year-levels?program={code}
     */
    public function yearLevels(Request $request): void
    {
        $programCode = (string)($request->query('program') ?? '');
        $levels = AcademicSection::getYearLevels($programCode);
        JsonResponse::success($levels, 'Year levels retrieved.');
    }

    /**
     * GET /api/v1/academics/sections?program={code}&year_level={code}
     */
    public function sections(Request $request): void
    {
        $program = (string)($request->query('program') ?? '');
        $yearLevel = (string)($request->query('year_level') ?? '');
        $termId = (string)($request->query('term_id') ?? '');

        if (empty($program) || empty($yearLevel)) {
            JsonResponse::validationError([
                'program' => empty($program) ? ['Program is required.'] : [],
                'year_level' => empty($yearLevel) ? ['Year level is required.'] : [],
            ]);
            return;
        }

        $sections = AcademicSection::getSections($program, $yearLevel, $termId ?: null);
        JsonResponse::success($sections, 'Sections retrieved.');
    }

    /**
     * POST /api/v1/academics/designation/resolve
     */
    public function resolveDesignation(Request $request): void
    {
        $program = (string)($request->input('program') ?? '');
        $yearLevel = (string)($request->input('year_level') ?? '');
        $sectionLetter = (string)($request->input('section') ?? '');
        $batch = $request->input('batch') !== null ? (int)$request->input('batch') : null;

        if (empty($program) || empty($yearLevel) || empty($sectionLetter)) {
            JsonResponse::validationError(['designation' => ['Program, year level, and section letter are required.']]);
            return;
        }

        $designation = AcademicSection::computeDesignation($program, $yearLevel, $sectionLetter, $batch);
        JsonResponse::success([
            'designation' => $designation,
            'program' => strtoupper($program),
            'year_level' => $yearLevel,
            'section' => strtoupper($sectionLetter),
            'batch' => $batch,
        ], 'Designation computed successfully.');
    }

    /**
     * GET /api/v1/admin/academic-sections
     */
    public function adminList(Request $request): void
    {
        $sections = AcademicSection::listAll();
        JsonResponse::success($sections, 'Admin academic sections retrieved.');
    }

    /**
     * POST /api/v1/admin/academic-sections
     */
    public function adminCreate(Request $request): void
    {
        $data = $request->all();
        if (empty($data['program_code']) || empty($data['year_level_code']) || empty($data['section_letter'])) {
            JsonResponse::validationError(['section' => ['Program, year level, and section letter are required.']]);
            return;
        }

        $created = AcademicSection::create($data);
        if ($created) {
            JsonResponse::success($created, 'Section created successfully.', 201);
            return;
        }

        JsonResponse::error('CREATION_FAILED', 'Could not create academic section.', 500);
    }
}
