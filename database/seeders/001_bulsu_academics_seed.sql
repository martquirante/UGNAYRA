-- ============================================================================
-- UGNAYRA — Seeder 001: Official Bulacan State University (BulSU) Academics
-- Source: https://www.bulsu.edu.ph/academics
-- Idempotent (ON CONFLICT DO UPDATE) — safe to run multiple times in Supabase.
-- ============================================================================

BEGIN;

-- 1. Academic Colleges, External Campuses, Graduate School, Lab High & Offices
INSERT INTO academic_units (code, name, unit_type, campus, sort_order) VALUES
    ('CICT',       'CICT — College of Information and Communications Technology', 'college',         'Main Campus (Malolos)', 10),
    ('COE',        'COE — College of Engineering',                                'college',         'Main Campus (Malolos)', 20),
    ('CBEA',       'CBEA — College of Business Education and Accountancy',        'college',         'Main Campus (Malolos)', 30),
    ('CAFA',       'CAFA — College of Architecture and Fine Arts',                'college',         'Main Campus (Malolos)', 40),
    ('CIT',        'CIT — College of Industrial Technology',                      'college',         'Main Campus (Malolos)', 50),
    ('CPTE',       'CPTE — College of Professional Teacher Education',            'college',         'Main Campus (Malolos)', 60),
    ('CS',         'CS — College of Science',                                     'college',         'Main Campus (Malolos)', 70),
    ('CHTM',       'CHTM — College of Hospitality and Tourism Management',        'college',         'Main Campus (Malolos)', 80),
    ('CSSP',       'CSSP — College of Social Sciences and Philosophy',            'college',         'Main Campus (Malolos)', 90),
    ('CAL',        'CAL — College of Arts and Letters',                           'college',         'Main Campus (Malolos)', 100),
    ('CCJE',       'CCJE — College of Criminal Justice Education',                'college',         'Main Campus (Malolos)', 110),
    ('CON',        'CON — College of Nursing',                                    'college',         'Main Campus (Malolos)', 120),
    ('CSER',       'CSER — College of Sports, Exercise and Recreation',           'college',         'Main Campus (Malolos)', 130),
    ('COL',        'COL — College of Law',                                        'college',         'Main Campus (Malolos)', 140),
    ('COM',        'COM — College of Medicine',                                   'college',         'Main Campus (Malolos)', 150),
    ('GS',         'GS — Graduate School',                                        'graduate',        'Main Campus (Malolos)', 160),
    ('LHS',        'LHS — Laboratory High School',                                'basic_ed',        'Main Campus (Malolos)', 170),
    ('SARMIENTO',  'BulSU Sarmiento Campus (San Jose del Monte)',                 'external_campus', 'Sarmiento Campus',      210),
    ('BUSTOS',     'BulSU Bustos Campus',                                         'external_campus', 'Bustos Campus',         220),
    ('MENESES',    'BulSU Meneses Campus (Bulakan)',                              'external_campus', 'Meneses Campus',        230),
    ('HAGONOY',    'BulSU Hagonoy Campus',                                        'external_campus', 'Hagonoy Campus',        240),
    ('SAN_RAFAEL', 'BulSU San Rafael Campus',                                     'external_campus', 'San Rafael Campus',     250),
    ('ADMIN',      'University Administrative & Student Support Offices',         'office',          'University-Wide',       300)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    unit_type = EXCLUDED.unit_type,
    campus = EXCLUDED.campus,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE;

-- 2. Degree Programs / Courses (Students & Faculty) + Campus Offices (Personnel)
INSERT INTO academic_programs (unit_code, code, name, applicable_roles, campuses, sort_order) VALUES
    -- CICT
    ('CICT', 'BSIT',       'BS Information Technology (BSIT)',                                 'student,teacher', 'Main, Sarmiento, Bustos, Meneses, Hagonoy', 10),
    ('CICT', 'BSIS',       'BS Information Systems (BSIS)',                                    'student,teacher', 'Main Campus', 20),
    ('CICT', 'BLIS',       'Bachelor of Library and Information Science (BLIS)',               'student,teacher', 'Main Campus', 30),
    ('CICT', 'ACT',        'Associate in Computer Technology (ACT)',                           'student,teacher', 'Main, Sarmiento, External Campuses', 40),

    -- COE
    ('COE',  'BSCE',       'BS Civil Engineering (BSCE)',                                      'student,teacher', 'Main Campus', 10),
    ('COE',  'BSCpE',      'BS Computer Engineering (BSCpE)',                                  'student,teacher', 'Main, Bustos, Meneses', 20),
    ('COE',  'BSEE',       'BS Electrical Engineering (BSEE)',                                 'student,teacher', 'Main Campus', 30),
    ('COE',  'BSECE',      'BS Electronics Engineering (BSECE)',                               'student,teacher', 'Main Campus', 40),
    ('COE',  'BSIE',       'BS Industrial Engineering (BSIE)',                                 'student,teacher', 'Main, Bustos', 50),
    ('COE',  'BSMfE',      'BS Manufacturing Engineering (BSMfE)',                             'student,teacher', 'Main Campus', 60),
    ('COE',  'BSME',       'BS Mechanical Engineering (BSME)',                                 'student,teacher', 'Main Campus', 70),
    ('COE',  'BSMEE',      'BS Mechatronics Engineering (BSMEE)',                              'student,teacher', 'Main Campus', 80),
    ('COE',  'BSGE',       'BS General Engineering (BSGE)',                                    'student,teacher', 'Hagonoy Campus', 90),

    -- CBEA
    ('CBEA', 'BSA',        'BS Accountancy (BSA)',                                             'student,teacher', 'Main Campus', 10),
    ('CBEA', 'BSMA',       'BS Management Accounting (BSMA)',                                  'student,teacher', 'Main Campus', 20),
    ('CBEA', 'BSBA-FM',    'BS Business Administration - Financial Management (BSBA-FM)',      'student,teacher', 'Main, Sarmiento, Bustos, Meneses', 30),
    ('CBEA', 'BSBA-MM',    'BS Business Administration - Marketing Management (BSBA-MM)',      'student,teacher', 'Main, Sarmiento, Bustos, Meneses', 40),
    ('CBEA', 'BSBA-BE',    'BS Business Administration - Business Economics (BSBA-BE)',        'student,teacher', 'Main Campus', 50),
    ('CBEA', 'BSENTREP',   'BS Entrepreneurship (BS Entrep)',                                  'student,teacher', 'Main, Sarmiento, Bustos', 60),

    -- CAFA
    ('CAFA', 'BSARCH',     'BS Architecture (BS Arch)',                                        'student,teacher', 'Main Campus', 10),
    ('CAFA', 'BLA',        'Bachelor of Landscape Architecture (BLA)',                         'student,teacher', 'Main Campus', 20),
    ('CAFA', 'BFA-VC',     'Bachelor of Fine Arts - Visual Communication (BFA)',               'student,teacher', 'Main Campus', 30),

    -- CIT
    ('CIT',  'BIT-COMP',   'Bachelor of Industrial Technology - Computer Technology',          'student,teacher', 'Main, Sarmiento, Bustos, Meneses', 10),
    ('CIT',  'BIT-AUTO',   'Bachelor of Industrial Technology - Automotive Technology',        'student,teacher', 'Main, Bustos', 20),
    ('CIT',  'BIT-DDGT',   'Bachelor of Industrial Technology - Drafting & Digital Graphics',  'student,teacher', 'Main, Bustos', 30),
    ('CIT',  'BIT-ELEC',   'Bachelor of Industrial Technology - Electrical Technology',        'student,teacher', 'Main, Bustos', 40),
    ('CIT',  'BIT-ELEX',   'Bachelor of Industrial Technology - Electronics Technology',       'student,teacher', 'Main, Bustos, Meneses', 50),
    ('CIT',  'BIT-FSM',    'Bachelor of Industrial Technology - Food Processing & Service',    'student,teacher', 'Main, Bustos, Meneses', 60),
    ('CIT',  'BIT-MECH',   'Bachelor of Industrial Technology - Mechanical Technology',        'student,teacher', 'Main Campus', 70),
    ('CIT',  'BIT-MCT',    'Bachelor of Industrial Technology - Mechatronics Technology',      'student,teacher', 'Main Campus', 80),
    ('CIT',  'BIT-HVACR',  'Bachelor of Industrial Technology - HVAC/R Technology',            'student,teacher', 'Main Campus', 90),
    ('CIT',  'BIT-WELD',   'Bachelor of Industrial Technology - Welding Technology',           'student,teacher', 'Main Campus', 100),

    -- CPTE
    ('CPTE', 'BEED',       'Bachelor of Elementary Education (BEEd)',                          'student,teacher', 'Main, Sarmiento, Bustos, Meneses, Hagonoy', 10),
    ('CPTE', 'BECED',      'Bachelor of Early Childhood Education (BECEd)',                    'student,teacher', 'Main, Bustos', 20),
    ('CPTE', 'BSED-ENG',   'Bachelor of Secondary Education - English (BSEd-Eng)',             'student,teacher', 'Main, Sarmiento, Bustos, Meneses', 30),
    ('CPTE', 'BSED-FIL',   'Bachelor of Secondary Education - Filipino (BSEd-Fil)',            'student,teacher', 'Main, Sarmiento, Meneses', 40),
    ('CPTE', 'BSED-MATH',  'Bachelor of Secondary Education - Mathematics (BSEd-Math)',        'student,teacher', 'Main, Sarmiento, Bustos, Meneses', 50),
    ('CPTE', 'BSED-SCI',   'Bachelor of Secondary Education - Science (BSEd-Sci)',             'student,teacher', 'Main, Sarmiento, Bustos, Meneses', 60),
    ('CPTE', 'BSED-SS',    'Bachelor of Secondary Education - Social Studies (BSEd-SS)',       'student,teacher', 'Main, Bustos', 70),
    ('CPTE', 'BTLED',      'Bachelor of Technology and Livelihood Education (BTLEd)',          'student,teacher', 'Main, Bustos', 80),
    ('CPTE', 'BPED',       'Bachelor of Physical Education (BPEd)',                            'student,teacher', 'Main, Bustos, Meneses', 90),

    -- CS
    ('CS',   'BSBIO',      'BS Biology',                                                       'student,teacher', 'Main Campus', 10),
    ('CS',   'BSENVSCI',   'BS Environmental Science',                                         'student,teacher', 'Main Campus', 20),
    ('CS',   'BSFT',       'BS Food Technology',                                               'student,teacher', 'Main Campus', 30),
    ('CS',   'BSMATH-CS',  'BS Mathematics - Computer Science',                                'student,teacher', 'Main Campus', 40),
    ('CS',   'BSMATH-AS',  'BS Mathematics - Applied Statistics',                              'student,teacher', 'Main Campus', 50),
    ('CS',   'BSMATH-BA',  'BS Mathematics - Business Applications',                           'student,teacher', 'Main Campus', 60),
    ('CS',   'BSMEDTECH',  'BS Medical Technology / Medical Laboratory Science',               'student,teacher', 'Main, San Rafael', 70),

    -- CHTM
    ('CHTM', 'BSHM',       'BS Hospitality Management (BSHM)',                                 'student,teacher', 'Main, Sarmiento, Meneses, Hagonoy', 10),
    ('CHTM', 'BSTM',       'BS Tourism Management (BSTM)',                                     'student,teacher', 'Main, Sarmiento, Hagonoy', 20),

    -- CSSP
    ('CSSP', 'BSPSYCH',    'BS Psychology',                                                    'student,teacher', 'Main, San Rafael', 10),
    ('CSSP', 'BPUBAD',     'Bachelor of Public Administration (BPA)',                          'student,teacher', 'Main Campus', 20),
    ('CSSP', 'BSSW',       'BS Social Work (BSSW)',                                            'student,teacher', 'Main Campus', 30),

    -- CAL
    ('CAL',  'BABROAD',    'BA Broadcasting',                                                  'student,teacher', 'Main Campus', 10),
    ('CAL',  'BAJOURN',    'BA Journalism',                                                    'student,teacher', 'Main Campus', 20),
    ('CAL',  'BPA-THEA',   'Bachelor of Performing Arts - Theater Track',                      'student,teacher', 'Main Campus', 30),
    ('CAL',  'BAMP',       'BA Malikhaing Pagsulat',                                           'student,teacher', 'Main Campus', 40),

    -- CCJE
    ('CCJE', 'BSCRIM',     'BS Criminology (BS Crim)',                                         'student,teacher', 'Main Campus', 10),
    ('CCJE', 'BALM',       'BA Legal Management (BALM)',                                       'student,teacher', 'Main Campus', 20),

    -- CON, CSER, COL, COM
    ('CON',  'BSN',        'BS Nursing (BSN)',                                                 'student,teacher', 'Main, San Rafael', 10),
    ('CSER', 'BSESS',      'BS Exercise and Sports Sciences (BSESS)',                          'student,teacher', 'Main Campus', 10),
    ('COL',  'JD',         'Juris Doctor (JD)',                                                'student,teacher', 'Main Campus', 10),
    ('COM',  'MD',         'Doctor of Medicine (MD)',                                          'student,teacher', 'Main Campus', 10),

    -- Graduate School
    ('GS',   'MIT',        'Master in Information Technology (MIT)',                           'student,teacher', 'Graduate School', 10),
    ('GS',   'MBA',        'Master in Business Administration (MBA)',                          'student,teacher', 'Graduate School', 20),
    ('GS',   'MPA',        'Master in Public Administration (MPA)',                            'student,teacher', 'Graduate School', 30),
    ('GS',   'MAED',       'Master of Arts in Education (MAEd)',                               'student,teacher', 'Graduate School', 40),
    ('GS',   'MENG',       'Master of Engineering (MEng)',                                     'student,teacher', 'Graduate School', 50),
    ('GS',   'EDD',        'Doctor of Education (EdD)',                                        'student,teacher', 'Graduate School', 60),
    ('GS',   'PHD',        'Doctor of Philosophy (PhD)',                                       'student,teacher', 'Graduate School', 70),
    ('GS',   'DPA',        'Doctor of Public Administration (DPA)',                            'student,teacher', 'Graduate School', 80),

    -- Laboratory High School
    ('LHS',  'SHS-STEM',   'Senior High School - STEM Strand',                                 'student,teacher', 'Laboratory High School', 10),
    ('LHS',  'SHS-ABM',    'Senior High School - ABM Strand',                                  'student,teacher', 'Laboratory High School', 20),
    ('LHS',  'SHS-HUMSS',  'Senior High School - HUMSS Strand',                                'student,teacher', 'Laboratory High School', 30),
    ('LHS',  'JHS',        'Laboratory Junior High School (Grades 7-10)',                      'student,teacher', 'Laboratory High School', 40),

    -- External Campuses (Direct Faculty / Personnel Affiliation Options)
    ('SARMIENTO',  'CAMP-SARM', 'BulSU Sarmiento Campus Department',                           'teacher,personnel', 'Sarmiento Campus', 10),
    ('BUSTOS',     'CAMP-BUST', 'BulSU Bustos Campus Department',                              'teacher,personnel', 'Bustos Campus', 10),
    ('MENESES',    'CAMP-MENE', 'BulSU Meneses Campus Department',                             'teacher,personnel', 'Meneses Campus', 10),
    ('HAGONOY',    'CAMP-HAGO', 'BulSU Hagonoy Campus Department',                             'teacher,personnel', 'Hagonoy Campus', 10),
    ('SAN_RAFAEL', 'CAMP-SANR', 'BulSU San Rafael Campus Department',                          'teacher,personnel', 'San Rafael Campus', 10),

    -- Administrative & Student Support Offices (Personnel)
    ('ADMIN', 'OFF-REG',   'Office of the University Registrar',                               'personnel', 'University-Wide', 10),
    ('ADMIN', 'OFF-OSAS',  'Office of Student Affairs and Services (OSAS)',                    'personnel', 'University-Wide', 20),
    ('ADMIN', 'OFF-ADM',   'Admissions and Orientation Office',                                'personnel', 'University-Wide', 30),
    ('ADMIN', 'OFF-ELIB',  'University E-Library & Learning Commons',                          'personnel', 'University-Wide', 40),
    ('ADMIN', 'OFF-MIS',   'Information Systems & ICT Office (MIS)',                           'personnel', 'University-Wide', 50),
    ('ADMIN', 'OFF-GUID',  'Guidance and Counseling Services Center',                          'personnel', 'University-Wide', 60),
    ('ADMIN', 'OFF-FIN',   'Accounting, Budget & Cashier''s Office',                           'personnel', 'University-Wide', 70),
    ('ADMIN', 'OFF-HRMO',  'Human Resource Management Office (HRMO)',                          'personnel', 'University-Wide', 80),
    ('ADMIN', 'OFF-CLIN',  'University Health & Medical Services (Clinic)',                    'personnel', 'University-Wide', 90),
    ('ADMIN', 'OFF-SCHOL', 'Scholarships and Financial Assistance Office',                     'personnel', 'University-Wide', 100)
ON CONFLICT (code) DO UPDATE SET
    unit_code = EXCLUDED.unit_code,
    name = EXCLUDED.name,
    applicable_roles = EXCLUDED.applicable_roles,
    campuses = EXCLUDED.campuses,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE;

-- 3. Year / Grade Levels (Students) & Academic Ranks (Teachers)
INSERT INTO academic_year_levels (code, label, applicable_role, sort_order) VALUES
    ('1ST_YEAR',  '1st Year',                 'student', 10),
    ('2ND_YEAR',  '2nd Year',                 'student', 20),
    ('3RD_YEAR',  '3rd Year',                 'student', 30),
    ('4TH_YEAR',  '4th Year',                 'student', 40),
    ('5TH_YEAR',  '5th Year',                 'student', 50),
    ('IRREGULAR', 'Irregular',                'student', 60),
    ('GRADUATE',  'Graduate / Master''s',     'student', 70),
    ('DOCTORAL',  'Doctoral',                 'student', 80),
    ('GRADE_12',  'Grade 12 (SHS)',           'student', 90),
    ('GRADE_11',  'Grade 11 (SHS)',           'student', 100),
    ('JHS_7_10',  'Grades 7–10 (Lab High)',   'student', 110),
    ('INST',      'Instructor I–III',         'teacher', 210),
    ('ASST_PROF', 'Assistant Professor I–IV', 'teacher', 220),
    ('ASSOC_PROF','Associate Professor I–V',  'teacher', 230),
    ('PROF',      'Professor I–VI',           'teacher', 240),
    ('LECTURER',  'Part-Time Lecturer',       'teacher', 250),
    ('CHAIR_DEAN','Program Chair / Dean',     'teacher', 260)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    applicable_role = EXCLUDED.applicable_role,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE;

COMMIT;

