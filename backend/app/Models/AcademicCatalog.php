<?php

declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Services\SupabaseClient;

/**
 * UGNAYRA — Bulacan State University (BulSU) Academic Catalog Model
 * Reads normalized colleges/campuses/offices, degree courses/programs, and
 * year/rank levels from PostgreSQL / Supabase, auto-seeding empty tables
 * and providing a deterministic canonical fallback prior to migration execution.
 */
class AcademicCatalog
{
    public static function getCatalog(): array
    {
        $cacheFile = rtrim(sys_get_temp_dir(), '\\/') . DIRECTORY_SEPARATOR . 'ugnayra_bulsu_catalog_v1.json';
        if (is_file($cacheFile)) {
            $age = time() - (int) @filemtime($cacheFile);
            $raw = @file_get_contents($cacheFile);
            $cached = is_string($raw) ? json_decode($raw, true) : null;
            if (is_array($cached) && !empty($cached['programs'])) {
                $ttl = ($cached['source'] ?? '') === 'canonical_seed' ? 60 : 300;
                if ($age >= 0 && $age < $ttl) {
                    return $cached;
                }
            }
        }

        $pdo = Database::getConnection();
        if ($pdo !== null) {
            try {
                $uStmt = $pdo->query(
                    'SELECT code, name, unit_type, campus, sort_order
                     FROM academic_units
                     WHERE is_active = true
                     ORDER BY sort_order ASC, name ASC'
                );
                $pStmt = $pdo->query(
                    'SELECT unit_code, code, name, applicable_roles, campuses, sort_order
                     FROM academic_programs
                     WHERE is_active = true
                     ORDER BY sort_order ASC, name ASC'
                );
                $yStmt = $pdo->query(
                    'SELECT code, label, applicable_role, sort_order
                     FROM academic_year_levels
                     WHERE is_active = true
                     ORDER BY sort_order ASC, label ASC'
                );

                $units = $uStmt ? ($uStmt->fetchAll() ?: []) : [];
                $programs = $pStmt ? ($pStmt->fetchAll() ?: []) : [];
                $years = $yStmt ? ($yStmt->fetchAll() ?: []) : [];

                if (!empty($units) && !empty($programs) && !empty($years)) {
                    $payload = [
                        'source' => 'database_pdo',
                        'institution' => 'Bulacan State University',
                        'units' => $units,
                        'programs' => $programs,
                        'year_levels' => $years,
                    ];
                    @file_put_contents($cacheFile, json_encode($payload));
                    return $payload;
                }
            } catch (\Throwable $e) {
                // Table may not be migrated yet; proceed to Supabase REST / seed fallback
            }
        }

        $sb = new SupabaseClient();
        if ($sb->isConfigured()) {
            $units = $sb->queryTable('academic_units', [
                'select' => 'code,name,unit_type,campus,sort_order',
                'is_active' => 'eq.true',
                'order' => 'sort_order.asc,name.asc',
            ]);

            // Only query remaining tables if academic_units exists in Supabase
            if (is_array($units)) {
                $programs = $sb->queryTable('academic_programs', [
                    'select' => 'unit_code,code,name,applicable_roles,campuses,sort_order',
                    'is_active' => 'eq.true',
                    'order' => 'sort_order.asc,name.asc',
                ]);
                $years = $sb->queryTable('academic_year_levels', [
                    'select' => 'code,label,applicable_role,sort_order',
                    'is_active' => 'eq.true',
                    'order' => 'sort_order.asc,label.asc',
                ]);

                if (is_array($programs) && is_array($years)) {
                    $seed = self::canonicalBulsuSeed();
                    if (empty($units)) {
                        $sb->queryTable('academic_units', [], 'POST', $seed['units']);
                        $units = $seed['units'];
                    }
                    if (empty($programs)) {
                        $sb->queryTable('academic_programs', [], 'POST', $seed['programs']);
                        $programs = $seed['programs'];
                    }
                    if (empty($years)) {
                        $sb->queryTable('academic_year_levels', [], 'POST', $seed['year_levels']);
                        $years = $seed['year_levels'];
                    }

                    $payload = [
                        'source' => 'supabase_db',
                        'institution' => 'Bulacan State University',
                        'units' => $units,
                        'programs' => $programs,
                        'year_levels' => $years,
                    ];
                    @file_put_contents($cacheFile, json_encode($payload));
                    return $payload;
                }
            }
        }

        $fallback = self::canonicalBulsuSeed();
        $payload = [
            'source' => 'canonical_seed',
            'institution' => 'Bulacan State University',
            'units' => $fallback['units'],
            'programs' => $fallback['programs'],
            'year_levels' => $fallback['year_levels'],
        ];
        @file_put_contents($cacheFile, json_encode($payload));
        return $payload;
    }

    public static function canonicalBulsuSeed(): array
    {
        return [
            'units' => [
                ['code' => 'CICT',       'name' => 'CICT — College of Information and Communications Technology', 'unit_type' => 'college',         'campus' => 'Main Campus (Malolos)', 'sort_order' => 10],
                ['code' => 'COE',        'name' => 'COE — College of Engineering',                                'unit_type' => 'college',         'campus' => 'Main Campus (Malolos)', 'sort_order' => 20],
                ['code' => 'CBEA',       'name' => 'CBEA — College of Business Education and Accountancy',        'unit_type' => 'college',         'campus' => 'Main Campus (Malolos)', 'sort_order' => 30],
                ['code' => 'CAFA',       'name' => 'CAFA — College of Architecture and Fine Arts',                'unit_type' => 'college',         'campus' => 'Main Campus (Malolos)', 'sort_order' => 40],
                ['code' => 'CIT',        'name' => 'CIT — College of Industrial Technology',                      'unit_type' => 'college',         'campus' => 'Main Campus (Malolos)', 'sort_order' => 50],
                ['code' => 'CPTE',       'name' => 'CPTE — College of Professional Teacher Education',            'unit_type' => 'college',         'campus' => 'Main Campus (Malolos)', 'sort_order' => 60],
                ['code' => 'CS',         'name' => 'CS — College of Science',                                     'unit_type' => 'college',         'campus' => 'Main Campus (Malolos)', 'sort_order' => 70],
                ['code' => 'CHTM',       'name' => 'CHTM — College of Hospitality and Tourism Management',        'unit_type' => 'college',         'campus' => 'Main Campus (Malolos)', 'sort_order' => 80],
                ['code' => 'CSSP',       'name' => 'CSSP — College of Social Sciences and Philosophy',            'unit_type' => 'college',         'campus' => 'Main Campus (Malolos)', 'sort_order' => 90],
                ['code' => 'CAL',        'name' => 'CAL — College of Arts and Letters',                           'unit_type' => 'college',         'campus' => 'Main Campus (Malolos)', 'sort_order' => 100],
                ['code' => 'CCJE',       'name' => 'CCJE — College of Criminal Justice Education',                'unit_type' => 'college',         'campus' => 'Main Campus (Malolos)', 'sort_order' => 110],
                ['code' => 'CON',        'name' => 'CON — College of Nursing',                                    'unit_type' => 'college',         'campus' => 'Main Campus (Malolos)', 'sort_order' => 120],
                ['code' => 'CSER',       'name' => 'CSER — College of Sports, Exercise and Recreation',           'unit_type' => 'college',         'campus' => 'Main Campus (Malolos)', 'sort_order' => 130],
                ['code' => 'COL',        'name' => 'COL — College of Law',                                        'unit_type' => 'college',         'campus' => 'Main Campus (Malolos)', 'sort_order' => 140],
                ['code' => 'COM',        'name' => 'COM — College of Medicine',                                   'unit_type' => 'college',         'campus' => 'Main Campus (Malolos)', 'sort_order' => 150],
                ['code' => 'GS',         'name' => 'GS — Graduate School',                                        'unit_type' => 'graduate',        'campus' => 'Main Campus (Malolos)', 'sort_order' => 160],
                ['code' => 'LHS',        'name' => 'LHS — Laboratory High School',                                'unit_type' => 'basic_ed',        'campus' => 'Main Campus (Malolos)', 'sort_order' => 170],
                ['code' => 'SARMIENTO',  'name' => 'BulSU Sarmiento Campus (San Jose del Monte)',                 'unit_type' => 'external_campus', 'campus' => 'Sarmiento Campus',      'sort_order' => 210],
                ['code' => 'BUSTOS',     'name' => 'BulSU Bustos Campus',                                         'unit_type' => 'external_campus', 'campus' => 'Bustos Campus',         'sort_order' => 220],
                ['code' => 'MENESES',    'name' => 'BulSU Meneses Campus (Bulakan)',                              'unit_type' => 'external_campus', 'campus' => 'Meneses Campus',        'sort_order' => 230],
                ['code' => 'HAGONOY',    'name' => 'BulSU Hagonoy Campus',                                        'unit_type' => 'external_campus', 'campus' => 'Hagonoy Campus',        'sort_order' => 240],
                ['code' => 'SAN_RAFAEL', 'name' => 'BulSU San Rafael Campus',                                     'unit_type' => 'external_campus', 'campus' => 'San Rafael Campus',     'sort_order' => 250],
                ['code' => 'ADMIN',      'name' => 'University Administrative & Student Support Offices',         'unit_type' => 'office',          'campus' => 'University-Wide',       'sort_order' => 300],
            ],
            'programs' => [
                // CICT
                ['unit_code' => 'CICT', 'code' => 'BSIT',      'name' => 'BS Information Technology (BSIT)',                                'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Sarmiento, Bustos, Meneses, Hagonoy', 'sort_order' => 10],
                ['unit_code' => 'CICT', 'code' => 'BSIS',      'name' => 'BS Information Systems (BSIS)',                                   'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 20],
                ['unit_code' => 'CICT', 'code' => 'BLIS',      'name' => 'Bachelor of Library and Information Science (BLIS)',              'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 30],
                ['unit_code' => 'CICT', 'code' => 'ACT',       'name' => 'Associate in Computer Technology (ACT)',                          'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Sarmiento, External Campuses', 'sort_order' => 40],

                // COE
                ['unit_code' => 'COE',  'code' => 'BSCE',      'name' => 'BS Civil Engineering (BSCE)',                                     'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 10],
                ['unit_code' => 'COE',  'code' => 'BSCpE',     'name' => 'BS Computer Engineering (BSCpE)',                                 'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Bustos, Meneses', 'sort_order' => 20],
                ['unit_code' => 'COE',  'code' => 'BSEE',      'name' => 'BS Electrical Engineering (BSEE)',                                'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 30],
                ['unit_code' => 'COE',  'code' => 'BSECE',     'name' => 'BS Electronics Engineering (BSECE)',                              'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 40],
                ['unit_code' => 'COE',  'code' => 'BSIE',      'name' => 'BS Industrial Engineering (BSIE)',                                'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Bustos', 'sort_order' => 50],
                ['unit_code' => 'COE',  'code' => 'BSMfE',     'name' => 'BS Manufacturing Engineering (BSMfE)',                            'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 60],
                ['unit_code' => 'COE',  'code' => 'BSME',      'name' => 'BS Mechanical Engineering (BSME)',                                'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 70],
                ['unit_code' => 'COE',  'code' => 'BSMEE',     'name' => 'BS Mechatronics Engineering (BSMEE)',                             'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 80],
                ['unit_code' => 'COE',  'code' => 'BSGE',      'name' => 'BS General Engineering (BSGE)',                                   'applicable_roles' => 'student,teacher', 'campuses' => 'Hagonoy Campus', 'sort_order' => 90],

                // CBEA
                ['unit_code' => 'CBEA', 'code' => 'BSA',       'name' => 'BS Accountancy (BSA)',                                            'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 10],
                ['unit_code' => 'CBEA', 'code' => 'BSMA',      'name' => 'BS Management Accounting (BSMA)',                                 'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 20],
                ['unit_code' => 'CBEA', 'code' => 'BSBA-FM',   'name' => 'BS Business Administration - Financial Management (BSBA-FM)',     'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Sarmiento, Bustos, Meneses', 'sort_order' => 30],
                ['unit_code' => 'CBEA', 'code' => 'BSBA-MM',   'name' => 'BS Business Administration - Marketing Management (BSBA-MM)',     'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Sarmiento, Bustos, Meneses', 'sort_order' => 40],
                ['unit_code' => 'CBEA', 'code' => 'BSBA-BE',   'name' => 'BS Business Administration - Business Economics (BSBA-BE)',       'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 50],
                ['unit_code' => 'CBEA', 'code' => 'BSENTREP',  'name' => 'BS Entrepreneurship (BS Entrep)',                                 'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Sarmiento, Bustos', 'sort_order' => 60],

                // CAFA
                ['unit_code' => 'CAFA', 'code' => 'BSARCH',    'name' => 'BS Architecture (BS Arch)',                                       'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 10],
                ['unit_code' => 'CAFA', 'code' => 'BLA',       'name' => 'Bachelor of Landscape Architecture (BLA)',                        'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 20],
                ['unit_code' => 'CAFA', 'code' => 'BFA-VC',    'name' => 'Bachelor of Fine Arts - Visual Communication (BFA)',              'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 30],

                // CIT
                ['unit_code' => 'CIT',  'code' => 'BIT-COMP',  'name' => 'Bachelor of Industrial Technology - Computer Technology',         'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Sarmiento, Bustos, Meneses', 'sort_order' => 10],
                ['unit_code' => 'CIT',  'code' => 'BIT-AUTO',  'name' => 'Bachelor of Industrial Technology - Automotive Technology',       'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Bustos', 'sort_order' => 20],
                ['unit_code' => 'CIT',  'code' => 'BIT-DDGT',  'name' => 'Bachelor of Industrial Technology - Drafting & Digital Graphics', 'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Bustos', 'sort_order' => 30],
                ['unit_code' => 'CIT',  'code' => 'BIT-ELEC',  'name' => 'Bachelor of Industrial Technology - Electrical Technology',       'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Bustos', 'sort_order' => 40],
                ['unit_code' => 'CIT',  'code' => 'BIT-ELEX',  'name' => 'Bachelor of Industrial Technology - Electronics Technology',      'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Bustos, Meneses', 'sort_order' => 50],
                ['unit_code' => 'CIT',  'code' => 'BIT-FSM',   'name' => 'Bachelor of Industrial Technology - Food Processing & Service',   'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Bustos, Meneses', 'sort_order' => 60],
                ['unit_code' => 'CIT',  'code' => 'BIT-MECH',  'name' => 'Bachelor of Industrial Technology - Mechanical Technology',       'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 70],
                ['unit_code' => 'CIT',  'code' => 'BIT-MCT',   'name' => 'Bachelor of Industrial Technology - Mechatronics Technology',     'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 80],
                ['unit_code' => 'CIT',  'code' => 'BIT-HVACR', 'name' => 'Bachelor of Industrial Technology - HVAC/R Technology',           'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 90],
                ['unit_code' => 'CIT',  'code' => 'BIT-WELD',  'name' => 'Bachelor of Industrial Technology - Welding Technology',          'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 100],

                // CPTE
                ['unit_code' => 'CPTE', 'code' => 'BEED',      'name' => 'Bachelor of Elementary Education (BEEd)',                         'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Sarmiento, Bustos, Meneses, Hagonoy', 'sort_order' => 10],
                ['unit_code' => 'CPTE', 'code' => 'BECED',     'name' => 'Bachelor of Early Childhood Education (BECEd)',                   'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Bustos', 'sort_order' => 20],
                ['unit_code' => 'CPTE', 'code' => 'BSED-ENG',  'name' => 'Bachelor of Secondary Education - English (BSEd-Eng)',            'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Sarmiento, Bustos, Meneses', 'sort_order' => 30],
                ['unit_code' => 'CPTE', 'code' => 'BSED-FIL',  'name' => 'Bachelor of Secondary Education - Filipino (BSEd-Fil)',           'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Sarmiento, Meneses', 'sort_order' => 40],
                ['unit_code' => 'CPTE', 'code' => 'BSED-MATH', 'name' => 'Bachelor of Secondary Education - Mathematics (BSEd-Math)',       'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Sarmiento, Bustos, Meneses', 'sort_order' => 50],
                ['unit_code' => 'CPTE', 'code' => 'BSED-SCI',  'name' => 'Bachelor of Secondary Education - Science (BSEd-Sci)',            'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Sarmiento, Bustos, Meneses', 'sort_order' => 60],
                ['unit_code' => 'CPTE', 'code' => 'BSED-SS',   'name' => 'Bachelor of Secondary Education - Social Studies (BSEd-SS)',      'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Bustos', 'sort_order' => 70],
                ['unit_code' => 'CPTE', 'code' => 'BTLED',     'name' => 'Bachelor of Technology and Livelihood Education (BTLEd)',         'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Bustos', 'sort_order' => 80],
                ['unit_code' => 'CPTE', 'code' => 'BPED',      'name' => 'Bachelor of Physical Education (BPEd)',                           'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Bustos, Meneses', 'sort_order' => 90],

                // CS
                ['unit_code' => 'CS',   'code' => 'BSBIO',     'name' => 'BS Biology',                                                      'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 10],
                ['unit_code' => 'CS',   'code' => 'BSENVSCI',  'name' => 'BS Environmental Science',                                        'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 20],
                ['unit_code' => 'CS',   'code' => 'BSFT',      'name' => 'BS Food Technology',                                              'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 30],
                ['unit_code' => 'CS',   'code' => 'BSMATH-CS', 'name' => 'BS Mathematics - Computer Science',                               'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 40],
                ['unit_code' => 'CS',   'code' => 'BSMATH-AS', 'name' => 'BS Mathematics - Applied Statistics',                             'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 50],
                ['unit_code' => 'CS',   'code' => 'BSMATH-BA', 'name' => 'BS Mathematics - Business Applications',                          'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 60],
                ['unit_code' => 'CS',   'code' => 'BSMEDTECH', 'name' => 'BS Medical Technology / Medical Laboratory Science',              'applicable_roles' => 'student,teacher', 'campuses' => 'Main, San Rafael', 'sort_order' => 70],

                // CHTM
                ['unit_code' => 'CHTM', 'code' => 'BSHM',      'name' => 'BS Hospitality Management (BSHM)',                                'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Sarmiento, Meneses, Hagonoy', 'sort_order' => 10],
                ['unit_code' => 'CHTM', 'code' => 'BSTM',      'name' => 'BS Tourism Management (BSTM)',                                    'applicable_roles' => 'student,teacher', 'campuses' => 'Main, Sarmiento, Hagonoy', 'sort_order' => 20],

                // CSSP
                ['unit_code' => 'CSSP', 'code' => 'BSPSYCH',   'name' => 'BS Psychology',                                                   'applicable_roles' => 'student,teacher', 'campuses' => 'Main, San Rafael', 'sort_order' => 10],
                ['unit_code' => 'CSSP', 'code' => 'BPUBAD',    'name' => 'Bachelor of Public Administration (BPA)',                         'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 20],
                ['unit_code' => 'CSSP', 'code' => 'BSSW',      'name' => 'BS Social Work (BSSW)',                                           'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 30],

                // CAL
                ['unit_code' => 'CAL',  'code' => 'BABROAD',   'name' => 'BA Broadcasting',                                                 'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 10],
                ['unit_code' => 'CAL',  'code' => 'BAJOURN',   'name' => 'BA Journalism',                                                   'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 20],
                ['unit_code' => 'CAL',  'code' => 'BPA-THEA',  'name' => 'Bachelor of Performing Arts - Theater Track',                     'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 30],
                ['unit_code' => 'CAL',  'code' => 'BAMP',      'name' => 'BA Malikhaing Pagsulat',                                          'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 40],

                // CCJE
                ['unit_code' => 'CCJE', 'code' => 'BSCRIM',    'name' => 'BS Criminology (BS Crim)',                                        'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 10],
                ['unit_code' => 'CCJE', 'code' => 'BALM',      'name' => 'BA Legal Management (BALM)',                                      'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 20],

                // CON, CSER, COL, COM
                ['unit_code' => 'CON',  'code' => 'BSN',       'name' => 'BS Nursing (BSN)',                                                'applicable_roles' => 'student,teacher', 'campuses' => 'Main, San Rafael', 'sort_order' => 10],
                ['unit_code' => 'CSER', 'code' => 'BSESS',     'name' => 'BS Exercise and Sports Sciences (BSESS)',                         'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 10],
                ['unit_code' => 'COL',  'code' => 'JD',        'name' => 'Juris Doctor (JD)',                                               'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 10],
                ['unit_code' => 'COM',  'code' => 'MD',        'name' => 'Doctor of Medicine (MD)',                                         'applicable_roles' => 'student,teacher', 'campuses' => 'Main Campus', 'sort_order' => 10],

                // Graduate School
                ['unit_code' => 'GS',   'code' => 'MIT',       'name' => 'Master in Information Technology (MIT)',                          'applicable_roles' => 'student,teacher', 'campuses' => 'Graduate School', 'sort_order' => 10],
                ['unit_code' => 'GS',   'code' => 'MBA',       'name' => 'Master in Business Administration (MBA)',                         'applicable_roles' => 'student,teacher', 'campuses' => 'Graduate School', 'sort_order' => 20],
                ['unit_code' => 'GS',   'code' => 'MPA',       'name' => 'Master in Public Administration (MPA)',                           'applicable_roles' => 'student,teacher', 'campuses' => 'Graduate School', 'sort_order' => 30],
                ['unit_code' => 'GS',   'code' => 'MAED',      'name' => 'Master of Arts in Education (MAEd)',                              'applicable_roles' => 'student,teacher', 'campuses' => 'Graduate School', 'sort_order' => 40],
                ['unit_code' => 'GS',   'code' => 'MENG',      'name' => 'Master of Engineering (MEng)',                                    'applicable_roles' => 'student,teacher', 'campuses' => 'Graduate School', 'sort_order' => 50],
                ['unit_code' => 'GS',   'code' => 'EDD',       'name' => 'Doctor of Education (EdD)',                                       'applicable_roles' => 'student,teacher', 'campuses' => 'Graduate School', 'sort_order' => 60],
                ['unit_code' => 'GS',   'code' => 'PHD',       'name' => 'Doctor of Philosophy (PhD)',                                      'applicable_roles' => 'student,teacher', 'campuses' => 'Graduate School', 'sort_order' => 70],
                ['unit_code' => 'GS',   'code' => 'DPA',       'name' => 'Doctor of Public Administration (DPA)',                           'applicable_roles' => 'student,teacher', 'campuses' => 'Graduate School', 'sort_order' => 80],

                // Laboratory High School
                ['unit_code' => 'LHS',  'code' => 'SHS-STEM',  'name' => 'Senior High School - STEM Strand',                                'applicable_roles' => 'student,teacher', 'campuses' => 'Laboratory High School', 'sort_order' => 10],
                ['unit_code' => 'LHS',  'code' => 'SHS-ABM',   'name' => 'Senior High School - ABM Strand',                                 'applicable_roles' => 'student,teacher', 'campuses' => 'Laboratory High School', 'sort_order' => 20],
                ['unit_code' => 'LHS',  'code' => 'SHS-HUMSS', 'name' => 'Senior High School - HUMSS Strand',                               'applicable_roles' => 'student,teacher', 'campuses' => 'Laboratory High School', 'sort_order' => 30],
                ['unit_code' => 'LHS',  'code' => 'JHS',       'name' => 'Laboratory Junior High School (Grades 7-10)',                     'applicable_roles' => 'student,teacher', 'campuses' => 'Laboratory High School', 'sort_order' => 40],

                // External Campuses (Direct Faculty / Personnel Affiliation)
                ['unit_code' => 'SARMIENTO',  'code' => 'CAMP-SARM', 'name' => 'BulSU Sarmiento Campus Department',                         'applicable_roles' => 'teacher,personnel', 'campuses' => 'Sarmiento Campus', 'sort_order' => 10],
                ['unit_code' => 'BUSTOS',     'code' => 'CAMP-BUST', 'name' => 'BulSU Bustos Campus Department',                            'applicable_roles' => 'teacher,personnel', 'campuses' => 'Bustos Campus', 'sort_order' => 10],
                ['unit_code' => 'MENESES',    'code' => 'CAMP-MENE', 'name' => 'BulSU Meneses Campus Department',                           'applicable_roles' => 'teacher,personnel', 'campuses' => 'Meneses Campus', 'sort_order' => 10],
                ['unit_code' => 'HAGONOY',    'code' => 'CAMP-HAGO', 'name' => 'BulSU Hagonoy Campus Department',                           'applicable_roles' => 'teacher,personnel', 'campuses' => 'Hagonoy Campus', 'sort_order' => 10],
                ['unit_code' => 'SAN_RAFAEL', 'code' => 'CAMP-SANR', 'name' => 'BulSU San Rafael Campus Department',                        'applicable_roles' => 'teacher,personnel', 'campuses' => 'San Rafael Campus', 'sort_order' => 10],

                // University Administrative & Student Support Offices (Personnel)
                ['unit_code' => 'ADMIN', 'code' => 'OFF-REG',   'name' => 'Office of the University Registrar',                             'applicable_roles' => 'personnel', 'campuses' => 'University-Wide', 'sort_order' => 10],
                ['unit_code' => 'ADMIN', 'code' => 'OFF-OSAS',  'name' => 'Office of Student Affairs and Services (OSAS)',                  'applicable_roles' => 'personnel', 'campuses' => 'University-Wide', 'sort_order' => 20],
                ['unit_code' => 'ADMIN', 'code' => 'OFF-ADM',   'name' => 'Admissions and Orientation Office',                              'applicable_roles' => 'personnel', 'campuses' => 'University-Wide', 'sort_order' => 30],
                ['unit_code' => 'ADMIN', 'code' => 'OFF-ELIB',  'name' => 'University E-Library & Learning Commons',                        'applicable_roles' => 'personnel', 'campuses' => 'University-Wide', 'sort_order' => 40],
                ['unit_code' => 'ADMIN', 'code' => 'OFF-MIS',   'name' => 'Information Systems & ICT Office (MIS)',                         'applicable_roles' => 'personnel', 'campuses' => 'University-Wide', 'sort_order' => 50],
                ['unit_code' => 'ADMIN', 'code' => 'OFF-GUID',  'name' => 'Guidance and Counseling Services Center',                        'applicable_roles' => 'personnel', 'campuses' => 'University-Wide', 'sort_order' => 60],
                ['unit_code' => 'ADMIN', 'code' => 'OFF-FIN',   'name' => 'Accounting, Budget & Cashier\'s Office',                         'applicable_roles' => 'personnel', 'campuses' => 'University-Wide', 'sort_order' => 70],
                ['unit_code' => 'ADMIN', 'code' => 'OFF-HRMO',  'name' => 'Human Resource Management Office (HRMO)',                        'applicable_roles' => 'personnel', 'campuses' => 'University-Wide', 'sort_order' => 80],
                ['unit_code' => 'ADMIN', 'code' => 'OFF-CLIN',  'name' => 'University Health & Medical Services (Clinic)',                  'applicable_roles' => 'personnel', 'campuses' => 'University-Wide', 'sort_order' => 90],
                ['unit_code' => 'ADMIN', 'code' => 'OFF-SCHOL', 'name' => 'Scholarships and Financial Assistance Office',                   'applicable_roles' => 'personnel', 'campuses' => 'University-Wide', 'sort_order' => 100],
            ],
            'year_levels' => [
                ['code' => '1ST_YEAR',   'label' => '1st Year',                 'applicable_role' => 'student', 'sort_order' => 10],
                ['code' => '2ND_YEAR',   'label' => '2nd Year',                 'applicable_role' => 'student', 'sort_order' => 20],
                ['code' => '3RD_YEAR',   'label' => '3rd Year',                 'applicable_role' => 'student', 'sort_order' => 30],
                ['code' => '4TH_YEAR',   'label' => '4th Year',                 'applicable_role' => 'student', 'sort_order' => 40],
                ['code' => '5TH_YEAR',   'label' => '5th Year',                 'applicable_role' => 'student', 'sort_order' => 50],
                ['code' => 'IRREGULAR',  'label' => 'Irregular',                'applicable_role' => 'student', 'sort_order' => 60],
                ['code' => 'GRADUATE',   'label' => 'Graduate / Master\'s',     'applicable_role' => 'student', 'sort_order' => 70],
                ['code' => 'DOCTORAL',   'label' => 'Doctoral',                 'applicable_role' => 'student', 'sort_order' => 80],
                ['code' => 'GRADE_12',   'label' => 'Grade 12 (SHS)',           'applicable_role' => 'student', 'sort_order' => 90],
                ['code' => 'GRADE_11',   'label' => 'Grade 11 (SHS)',           'applicable_role' => 'student', 'sort_order' => 100],
                ['code' => 'JHS_7_10',   'label' => 'Grades 7–10 (Lab High)',   'applicable_role' => 'student', 'sort_order' => 110],
                ['code' => 'INST',       'label' => 'Instructor I–III',         'applicable_role' => 'teacher', 'sort_order' => 210],
                ['code' => 'ASST_PROF',  'label' => 'Assistant Professor I–IV', 'applicable_role' => 'teacher', 'sort_order' => 220],
                ['code' => 'ASSOC_PROF', 'label' => 'Associate Professor I–V',  'applicable_role' => 'teacher', 'sort_order' => 230],
                ['code' => 'PROF',       'label' => 'Professor I–VI',           'applicable_role' => 'teacher', 'sort_order' => 240],
                ['code' => 'LECTURER',   'label' => 'Part-Time Lecturer',       'applicable_role' => 'teacher', 'sort_order' => 250],
                ['code' => 'CHAIR_DEAN', 'label' => 'Program Chair / Dean',     'applicable_role' => 'teacher', 'sort_order' => 260],
            ],
        ];
    }
}

