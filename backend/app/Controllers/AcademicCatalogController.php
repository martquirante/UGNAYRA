<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Models\AcademicCatalog;

class AcademicCatalogController
{
    /**
     * GET /api/v1/academics/catalog
     * Returns academic units, courses/programs, and year/rank levels from DB.
     */
    public function index(Request $request): void
    {
        $catalog = AcademicCatalog::getCatalog();
        JsonResponse::success($catalog, 'Academic catalog retrieved.', 200);
    }
}

