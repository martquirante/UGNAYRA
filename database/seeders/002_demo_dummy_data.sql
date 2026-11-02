-- ============================================================================
-- UGNAYRA — Seeder 002: Live Demo Sample & Dummy Data
-- Comprehensive Test Dataset for Evaluation & Professor Demonstration
-- Targets: Supabase PostgreSQL 15+
-- Safe & Idempotent (ON CONFLICT DO UPDATE / DO NOTHING)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. TEST ACCOUNTS / PROFILES
-- Password for all dummy accounts: Password123!
-- Bcrypt Hash (cost 12): $2y$12$47UZzFiWrjEcTLzOFpCxBuy1kkDiVJL7oTQfuhWIp/R6DnF.Ff5ea
-- ----------------------------------------------------------------------------
INSERT INTO profiles (
    id, email, username, password_hash, full_name, role,
    school_id_number, department, year_or_grade, section, bio, avatar_url, is_active
) VALUES
    -- 1. School Administrator / Campus Director (Role: Personnel)
    (
        '11111111-1111-4111-8111-111111111111',
        'admin.ugnayra@bulsu.edu.ph',
        'bulsu_admin',
        '$2y$12$47UZzFiWrjEcTLzOFpCxBuy1kkDiVJL7oTQfuhWIp/R6DnF.Ff5ea',
        'Engr. Ernesto M. Santos',
        'personnel',
        'EMP-2015-0891',
        'ADMIN',
        'Staff',
        'Administrative Support',
        'Campus Director & University Administrator. Committed to academic excellence and modern digital campus infrastructure at BulSU.',
        'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
        TRUE
    ),
    -- 2. Lead Web Development Instructor (Role: Teacher)
    (
        '22222222-2222-4222-8222-222222222222',
        'prof.delacruz@bulsu.edu.ph',
        'prof_delacruz',
        '$2y$12$47UZzFiWrjEcTLzOFpCxBuy1kkDiVJL7oTQfuhWIp/R6DnF.Ff5ea',
        'Prof. Maria Elena Dela Cruz',
        'teacher',
        'FAC-2018-0412',
        'CICT',
        'Faculty',
        'IT Department',
        'Assistant Professor & IT 305W Lead Instructor. Research focus on Distributed Systems, Web Architectures, and Cloud Database Engineering.',
        'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
        TRUE
    ),
    -- 3. Engineering Faculty (Role: Teacher)
    (
        '33333333-3333-4333-8333-333333333333',
        'sir.ramirez@bulsu.edu.ph',
        'sir_ramirez',
        '$2y$12$47UZzFiWrjEcTLzOFpCxBuy1kkDiVJL7oTQfuhWIp/R6DnF.Ff5ea',
        'Engr. Arnel Ramirez',
        'teacher',
        'FAC-2019-0523',
        'COE',
        'Faculty',
        'Computer Engineering Dept',
        'Faculty, College of Engineering. Embedded Systems, Internet of Things (IoT), and Computer Hardware enthusiast.',
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        TRUE
    ),
    -- 4. Lead Student Proponent (Role: Student)
    (
        '44444444-4444-4444-8444-444444444444',
        'raymart.student@bulsu.edu.ph',
        'raymart_q',
        '$2y$12$47UZzFiWrjEcTLzOFpCxBuy1kkDiVJL7oTQfuhWIp/R6DnF.Ff5ea',
        'Raymart Quirante',
        'student',
        '2022-108921',
        'CICT',
        '3rd Year',
        'BSIT 3A',
        'BS Information Technology 3rd Year Student. Proponent and full-stack developer of UGNAYRA. Dedicated to building reliable campus software.',
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        TRUE
    ),
    -- 5. Student Peer / Teammate (Role: Student)
    (
        '55555555-5555-4555-8555-555555555555',
        'juan.luna@bulsu.edu.ph',
        'juan_luna',
        '$2y$12$47UZzFiWrjEcTLzOFpCxBuy1kkDiVJL7oTQfuhWIp/R6DnF.Ff5ea',
        'Juan D. Luna',
        'student',
        '2022-104412',
        'CICT',
        '3rd Year',
        'BSIT 3A',
        'BSIT 3rd Year Student. Frontend enthusiast, coffee enthusiast, and collaborative project contributor at BulSU CICT.',
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
        TRUE
    ),
    -- 6. Class Representative / Student Leader (Role: Student)
    (
        '66666666-6666-4666-8666-666666666666',
        'bea.reyes@bulsu.edu.ph',
        'bea_reyes',
        '$2y$12$47UZzFiWrjEcTLzOFpCxBuy1kkDiVJL7oTQfuhWIp/R6DnF.Ff5ea',
        'Bea Bianca Reyes',
        'student',
        '2022-109934',
        'CICT',
        '3rd Year',
        'BSIT 3A',
        'BSIT Class Representative | Tech event organizer | Passionate about UI/UX accessibility and student welfare.',
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
        TRUE
    )
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    school_id_number = EXCLUDED.school_id_number,
    department = EXCLUDED.department,
    year_or_grade = EXCLUDED.year_or_grade,
    section = EXCLUDED.section,
    bio = EXCLUDED.bio,
    avatar_url = EXCLUDED.avatar_url,
    is_active = TRUE;

-- ----------------------------------------------------------------------------
-- 2. ACADEMIC COMMUNITIES
-- ----------------------------------------------------------------------------
INSERT INTO communities (
    id, slug, name, category, description, rules, privacy, created_by, members_count, posts_count
) VALUES
    (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'cict-coders-society',
        'CICT Developers & Coders Society',
        'academic',
        'The official peer learning community for CICT programmers, web developers, and competitive coders.',
        '1. Respect all members. 2. Share academic code constructively. 3. No plagiarism in academic submissions.',
        'public',
        '22222222-2222-4222-8222-222222222222',
        4,
        1
    ),
    (
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'bulsu-it-3rd-year',
        'BulSU BSIT 3rd Year Batch',
        'department',
        'Collaboration space for 3rd Year BSIT students: study tips, reviewer sharing, and capstone discussions.',
        '1. Keep discussions academic and school-related. 2. Support your fellow batchmates.',
        'public',
        '44444444-4444-4444-8444-444444444444',
        4,
        0
    ),
    (
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'campus-innovators-hub',
        'BulSU Innovators & Tech Club',
        'organization',
        'A cross-disciplinary space for software builders, UI/UX designers, and tech innovators across all BulSU colleges.',
        '1. Collaborate openly. 2. Welcome beginner questions. 3. Share hackathon and seminar opportunities.',
        'public',
        '66666666-6666-4666-8666-666666666666',
        4,
        0
    )
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    rules = EXCLUDED.rules;

-- Community Memberships
INSERT INTO community_members (community_id, user_id, member_role) VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'admin'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'moderator'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '55555555-5555-4555-8555-555555555555', 'member'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '66666666-6666-4666-8666-666666666666', 'member'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '44444444-4444-4444-8444-444444444444', 'admin'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '55555555-5555-4555-8555-555555555555', 'member'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '66666666-6666-4666-8666-666666666666', 'moderator'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'member'),
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '66666666-6666-4666-8666-666666666666', 'admin'),
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '44444444-4444-4444-8444-444444444444', 'member'),
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '55555555-5555-4555-8555-555555555555', 'member'),
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-3333-4333-8333-333333333333', 'member')
ON CONFLICT (community_id, user_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. OFFICIAL CAMPUS ANNOUNCEMENTS
-- ----------------------------------------------------------------------------
INSERT INTO announcements (
    id, author_id, title, body, category, priority, target_department, is_pinned, published_at
) VALUES
    (
        'd1111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111111',
        'Official Campus Advisory: Inclement Weather Protocol & Online Modality',
        'Due to the severe weather forecast and continuous rainfall affecting Central Luzon, in-person classes across all BulSU campuses are temporarily suspended. Academic interactions will proceed asynchronously through the UGNAYRA LMS portal. All faculty and students are requested to stay safe and monitor official university advisories.',
        'urgent_notice',
        'urgent',
        'University-Wide',
        TRUE,
        NOW() - INTERVAL '2 hours'
    ),
    (
        'd2222222-2222-4222-8222-222222222222',
        '22222222-2222-4222-8222-222222222222',
        'IT 305W: Final Project Oral Defense Schedule & Compilation Checklist',
        'Attention IT 305W Students: The schedule for the Final Project Oral Defense has been posted. Please ensure your project repository satisfies all evaluation criteria: JSON as the primary payload format, zero-reload AJAX communication, structured PHP backend, and PostgreSQL relational data integrity. Review the rubrics PDF and test all demo accounts before your time slot.',
        'academic',
        'important',
        'CICT',
        TRUE,
        NOW() - INTERVAL '6 hours'
    ),
    (
        'd3333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111',
        'BulSU University Intramurals 2026: Opening Ceremonies and Schedules',
        'The University Athletic Directorate is pleased to invite the entire BulSU academic community to the grand opening of the 2026 University Intramurals. Cheer on your college athletes in basketball, volleyball, athletics, and esports. Check with your local college student councils for schedule details.',
        'campus_events',
        'normal',
        'University-Wide',
        FALSE,
        NOW() - INTERVAL '1 day'
    )
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. CAMPUS NEWS FEED POSTS
-- ----------------------------------------------------------------------------
INSERT INTO posts (
    id, author_id, community_id, content, visibility, likes_count, comments_count, shares_count, created_at
) VALUES
    -- Post 1: Lead student showing completion of the project (Campus Public)
    (
        'e1111111-1111-4111-8111-111111111111',
        '44444444-4444-4444-8444-444444444444',
        NULL,
        'Just finalized our term compilation for UGNAYRA — School-Based Social Networking Platform! 🚀 Built with a decoupled architecture: Vanilla ES6+ SPA on the frontend, custom PHP 8.2+ REST API router, and Supabase PostgreSQL with 100% parameterized queries. Zero page reloads via jQuery AJAX. Ready for our defense!',
        'campus',
        4,
        3,
        1,
        NOW() - INTERVAL '3 hours'
    ),
    -- Post 2: Professor reminder (Campus Public)
    (
        'e2222222-2222-4222-8222-222222222222',
        '22222222-2222-4222-8222-222222222222',
        NULL,
        'Reminder to all 3rd Year BSIT sections: Clean code organization, role-based access control (RBAC), and reliable error handling are critical aspects of enterprise web development. Looking forward to seeing the live demonstrations during the defense week. Keep up the great work everyone!',
        'campus',
        5,
        2,
        0,
        NOW() - INTERVAL '5 hours'
    ),
    -- Post 3: Community post in CICT Coders Society (Community Scoped)
    (
        'e3333333-3333-4333-8333-333333333333',
        '66666666-6666-4666-8666-666666666666',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'Quick tip for everyone testing the API locally: Remember to enable the pdo_pgsql extension in your php.ini file so your PHP backend can talk directly to Supabase PostgreSQL. If you encounter CORS warnings, check that withCredentials is true in your AJAX setup! 💻🔥',
        'community',
        3,
        1,
        0,
        NOW() - INTERVAL '1 day'
    ),
    -- Post 4: Student study post (Campus Public)
    (
        'e4444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555',
        NULL,
        'Late night coding sprint at CICT Lab 3! Nothing beats the feeling when your automated test suite runs 15/15 PASS! Good luck sa lahat ng sections sa project submissions natin! ☕💻',
        'campus',
        4,
        2,
        0,
        NOW() - INTERVAL '2 days'
    )
ON CONFLICT (id) DO NOTHING;

-- Link Community Post
INSERT INTO community_posts (community_id, post_id, is_announcement, is_pinned)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'e3333333-3333-4333-8333-333333333333', FALSE, TRUE)
ON CONFLICT (community_id, post_id) DO NOTHING;

-- Post Likes
INSERT INTO post_likes (post_id, user_id) VALUES
    ('e1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'),
    ('e1111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'),
    ('e1111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555'),
    ('e1111111-1111-4111-8111-111111111111', '66666666-6666-4666-8666-666666666666'),
    ('e2222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444'),
    ('e2222222-2222-4222-8222-222222222222', '55555555-5555-4555-8555-555555555555'),
    ('e2222222-2222-4222-8222-222222222222', '66666666-6666-4666-8666-666666666666'),
    ('e3333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'),
    ('e3333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555555'),
    ('e4444444-4444-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444'),
    ('e4444444-4444-4444-8444-444444444444', '66666666-6666-4666-8666-666666666666')
ON CONFLICT (post_id, user_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. POST COMMENTS
-- ----------------------------------------------------------------------------
INSERT INTO comments (id, post_id, author_id, parent_comment_id, content, created_at) VALUES
    -- Comments on Post 1
    (
        'c1111111-1111-4111-8111-111111111111',
        'e1111111-1111-4111-8111-111111111111',
        '55555555-5555-4555-8555-555555555555',
        NULL,
        'Solid architecture pre! Napakalinis ng decoupling ng frontend SPA at PHP REST endpoints.',
        NOW() - INTERVAL '2 hours'
    ),
    (
        'c2222222-2222-4222-8222-222222222222',
        'e1111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        NULL,
        'Commendable work Raymart and team! The PSR-4 structure and automated testing suite reflect excellent software engineering practices. Looking forward to your live defense.',
        NOW() - INTERVAL '90 minutes'
    ),
    (
        'c3333333-3333-4333-8333-333333333333',
        'e1111111-1111-4111-8111-111111111111',
        '66666666-6666-4666-8666-666666666666',
        NULL,
        'Ang ganda rin ng mobile responsiveness at adaptive theme toggle. Very accessible!',
        NOW() - INTERVAL '45 minutes'
    ),
    -- Comments on Post 2
    (
        'c4444444-4444-4444-8444-444444444444',
        'e2222222-2222-4222-8222-222222222222',
        '44444444-4444-4444-8444-444444444444',
        NULL,
        'Noted po Prof! Our backend test runner reports 15 passing tests across auth, validation, and session handling.',
        NOW() - INTERVAL '4 hours'
    ),
    (
        'c5555555-5555-4555-8555-555555555555',
        'e2222222-2222-4222-8222-222222222222',
        '55555555-5555-4555-8555-555555555555',
        NULL,
        'Thank you po Prof! Ready na po ang system demonstration ng aming grupo.',
        NOW() - INTERVAL '3 hours'
    ),
    -- Comments on Post 3
    (
        'c6666666-6666-4666-8666-666666666666',
        'e3333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444',
        NULL,
        'Very helpful reminder Bea! Handled din yan securely ng CorsMiddleware at CsrfMiddleware sa backend natin.',
        NOW() - INTERVAL '18 hours'
    ),
    -- Comments on Post 4
    (
        'c7777777-7777-4777-8777-777777777777',
        'e4444444-4444-4444-8444-444444444444',
        '66666666-6666-4666-8666-666666666666',
        NULL,
        'Laban lang Juan! Malapit na matapos ang 1st semester!',
        NOW() - INTERVAL '1 day'
    ),
    (
        'c8888888-8888-4888-8888-888888888888',
        'e4444444-4444-4444-8444-444444444444',
        '11111111-1111-4111-8111-111111111111',
        NULL,
        'Great dedication from our CICT students. Continue striving for academic excellence.',
        NOW() - INTERVAL '1 day'
    )
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. PRIVATE CONVERSATIONS & CHAT MESSAGES
-- ----------------------------------------------------------------------------
-- Conversation 1: Raymart Quirante & Prof. Maria Elena Dela Cruz
INSERT INTO conversations (id, is_group, title, direct_key, last_message_preview, last_message_at)
VALUES (
    '81111111-1111-4111-8111-111111111111',
    FALSE,
    NULL,
    '22222222-2222-4222-8222-222222222222:44444444-4444-4444-8444-444444444444',
    'Noted po Prof! Complete na po lahat including seeders and test accounts.',
    NOW() - INTERVAL '10 minutes'
) ON CONFLICT (direct_key) DO NOTHING;

INSERT INTO conversation_members (conversation_id, user_id, unread_count) VALUES
    ('81111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 0),
    ('81111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444444', 0)
ON CONFLICT (conversation_id, user_id) DO NOTHING;

INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES
    (
        '91111111-1111-4111-8111-111111111111',
        '81111111-1111-4111-8111-111111111111',
        '44444444-4444-4444-8444-444444444444',
        'Good evening po Prof! Ask lang po sana regarding our final project demonstration tomorrow.',
        NOW() - INTERVAL '25 minutes'
    ),
    (
        '92222222-2222-4222-8222-222222222222',
        '81111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        'Good evening Raymart. Yes, make sure your GitHub repo is updated and your test accounts are working smoothly for both Student and Teacher roles.',
        NOW() - INTERVAL '18 minutes'
    ),
    (
        '93333333-3333-4333-8333-333333333333',
        '81111111-1111-4111-8111-111111111111',
        '44444444-4444-4444-8444-444444444444',
        'Noted po Prof! Complete na po lahat including seeders and test accounts. Thank you po!',
        NOW() - INTERVAL '10 minutes'
    )
ON CONFLICT (id) DO NOTHING;

-- Conversation 2: Raymart Quirante & Juan Luna
INSERT INTO conversations (id, is_group, title, direct_key, last_message_preview, last_message_at)
VALUES (
    '82222222-2222-4222-8222-222222222222',
    FALSE,
    NULL,
    '44444444-4444-4444-8444-444444444444:55555555-5555-4555-8555-555555555555',
    'Ayos pre! Solid yan panigurado mataas score natin sa rubrics.',
    NOW() - INTERVAL '5 minutes'
) ON CONFLICT (direct_key) DO NOTHING;

INSERT INTO conversation_members (conversation_id, user_id, unread_count) VALUES
    ('82222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 0),
    ('82222222-2222-4222-8222-222222222222', '55555555-5555-4555-8555-555555555555', 0)
ON CONFLICT (conversation_id, user_id) DO NOTHING;

INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES
    (
        '94444444-4444-4444-8444-444444444444',
        '82222222-2222-4222-8222-222222222222',
        '55555555-5555-4555-8555-555555555555',
        'Pre, na-review mo ba yung presentation slides natin para sa IT 305W?',
        NOW() - INTERVAL '15 minutes'
    ),
    (
        '95555555-5555-4555-8555-555555555555',
        '82222222-2222-4222-8222-222222222222',
        '44444444-4444-4444-8444-444444444444',
        'Oo pre, all set na. Nag-insert din ako ng realistic dummy data sa feeds, announcements, at LMS para live at may laman agad.',
        NOW() - INTERVAL '8 minutes'
    ),
    (
        '96666666-6666-4666-8666-666666666666',
        '82222222-2222-4222-8222-222222222222',
        '55555555-5555-4555-8555-555555555555',
        'Ayos pre! Solid yan panigurado mataas score natin sa rubrics.',
        NOW() - INTERVAL '5 minutes'
    )
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7. LMS CLASSROOMS, ASSIGNMENTS & SUBMISSIONS
-- ----------------------------------------------------------------------------
-- Ensure Academic Term exists
INSERT INTO academic_terms (school_year, semester, is_current, starts_at, ends_at)
VALUES ('2026-2027', '1st Semester', TRUE, '2026-08-15', '2026-12-20')
ON CONFLICT (school_year, semester) DO UPDATE SET is_current = TRUE;

-- Ensure IT 305W Subject exists
INSERT INTO academic_subjects (program_code, code, title, lecture_units, lab_units, has_laboratory, is_active)
VALUES ('BSIT', 'IT 305W', 'Advanced Web Applications', 2.0, 1.0, TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Virtual Classroom for IT 305W - BSIT 3A
DO $$
DECLARE
    term_uuid UUID;
BEGIN
    SELECT id INTO term_uuid FROM academic_terms WHERE school_year = '2026-2027' AND semester = '1st Semester' LIMIT 1;

    INSERT INTO classrooms (
        id, teacher_id, term_id, subject_code, subject_title,
        section_designation, has_laboratory, join_code, theme_color, description
    ) VALUES (
        'f1111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        term_uuid,
        'IT 305W',
        'Advanced Web Applications',
        'BSIT 3A',
        TRUE,
        'IT305W-SEC3A',
        '#173B70',
        'Official virtual classroom for IT 305W — Advanced Web Applications. Complete syllabus coverage on REST APIs, client-side SPA architectures, and cloud databases.'
    ) ON CONFLICT (join_code) DO NOTHING;
END $$;

-- Classroom Enrollment
INSERT INTO classroom_members (classroom_id, user_id, role) VALUES
    ('f1111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'teacher'),
    ('f1111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444444', 'student'),
    ('f1111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', 'student'),
    ('f1111111-1111-4111-8111-111111111111', '66666666-6666-4666-8666-666666666666', 'class_rep')
ON CONFLICT (classroom_id, user_id) DO NOTHING;

-- LMS Assignment
INSERT INTO assignments (
    id, classroom_id, author_id, title, instructions, activity_type, max_score, due_at, is_published
) VALUES (
    'a1111111-1111-4111-8111-111111111111',
    'f1111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'Final Course Project: School-Based Social Networking Platform (UGNAYRA)',
    'Create a full website using PHP, AJAX, JSON, and PostgreSQL. Adhere strictly to the project rubrics. Submit your GitHub repository URL and deployment link for oral evaluation.',
    'project',
    100.00,
    NOW() + INTERVAL '5 days',
    TRUE
) ON CONFLICT (id) DO NOTHING;

-- Graded Student Submission (Raymart Quirante)
INSERT INTO submissions (
    id, assignment_id, student_id, status, current_score, current_feedback, current_version, submitted_at
) VALUES (
    'b1111111-1111-4111-8111-111111111111',
    'a1111111-1111-4111-8111-111111111111',
    '44444444-4444-4444-8444-444444444444',
    'GRADED',
    100.00,
    'Outstanding implementation! Exemplary use of pure JSON API envelopes, asynchronous jQuery AJAX SPA navigation, robust PHP architecture, and clean 3NF database design. Perfect score: 100/100.',
    1,
    NOW() - INTERVAL '1 day'
) ON CONFLICT (assignment_id, student_id) DO UPDATE SET
    status = EXCLUDED.status,
    current_score = EXCLUDED.current_score,
    current_feedback = EXCLUDED.current_feedback;

-- Pending Student Submission (Juan Luna)
INSERT INTO submissions (
    id, assignment_id, student_id, status, current_score, current_feedback, current_version, submitted_at
) VALUES (
    'b2222222-2222-4222-8222-222222222222',
    'a1111111-1111-4111-8111-111111111111',
    '55555555-5555-4555-8555-555555555555',
    'SUBMITTED',
    NULL,
    NULL,
    1,
    NOW() - INTERVAL '3 hours'
) ON CONFLICT (assignment_id, student_id) DO NOTHING;

COMMIT;
