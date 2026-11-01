-- ============================================================================
-- UGNAYRA — Migration 006: Academic LMS, Virtual Classrooms, Smart Scheduling & Groups
-- Target: Supabase PostgreSQL 15+
-- Dependencies: 001_extensions_and_types.sql, 002_core_tables.sql, 005_bulsu_academic_catalog.sql
-- Transactional Safety: Strict RESTRICT foreign keys, soft-archival, zero cascading deletes
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. ACADEMIC TERMS (Historical School Years & Semesters)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academic_terms (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_year       VARCHAR(20) NOT NULL, -- e.g. '2026-2027'
    semester          VARCHAR(24) NOT NULL, -- '1st Semester', '2nd Semester', 'Midyear'
    is_current        BOOLEAN NOT NULL DEFAULT FALSE,
    starts_at         DATE NOT NULL,
    ends_at           DATE NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_academic_terms UNIQUE (school_year, semester),
    CONSTRAINT chk_term_dates CHECK (ends_at >= starts_at)
);

-- ----------------------------------------------------------------------------
-- 2. DYNAMIC ACADEMIC SECTIONS (Configurable per Term, Program & Year Level)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academic_sections (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    term_id               UUID NOT NULL REFERENCES academic_terms(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    program_code          VARCHAR(48) NOT NULL REFERENCES academic_programs(code) ON UPDATE CASCADE ON DELETE RESTRICT,
    year_level_code       VARCHAR(32) NOT NULL REFERENCES academic_year_levels(code) ON UPDATE CASCADE ON DELETE RESTRICT,
    section_letter        VARCHAR(8) NOT NULL, -- e.g. 'A', 'B', 'C', 'D', 'E', 'F' (unbounded)
    default_lab_batches   SMALLINT NOT NULL DEFAULT 0 CHECK (default_lab_batches BETWEEN 0 AND 8),
    max_capacity          SMALLINT NOT NULL DEFAULT 45 CHECK (max_capacity > 0),
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_term_program_year_section UNIQUE (term_id, program_code, year_level_code, section_letter)
);

-- ----------------------------------------------------------------------------
-- 3. PROFILES ACADEMIC EXTENSIONS (Cohort Identity & Verification State)
-- ----------------------------------------------------------------------------
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS program_code VARCHAR(48) REFERENCES academic_programs(code) ON UPDATE CASCADE ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS year_level_code VARCHAR(32) REFERENCES academic_year_levels(code) ON UPDATE CASCADE ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS section_letter VARCHAR(8) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS academic_status VARCHAR(24) NOT NULL DEFAULT 'pending_verification'
        CHECK (academic_status IN ('verified', 'pending_verification', 'rejected', 'irregular', 'alumni'));

-- ----------------------------------------------------------------------------
-- 4. ACADEMIC SUBJECTS CATALOG
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academic_subjects (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_code      VARCHAR(48) NOT NULL REFERENCES academic_programs(code) ON UPDATE CASCADE ON DELETE RESTRICT,
    code              VARCHAR(40) NOT NULL UNIQUE,  -- e.g. 'IT 305W'
    title             VARCHAR(160) NOT NULL,        -- e.g. 'Advanced Web Applications'
    lecture_units     NUMERIC(3,1) NOT NULL DEFAULT 3.0 CHECK (lecture_units >= 0),
    lab_units         NUMERIC(3,1) NOT NULL DEFAULT 0.0 CHECK (lab_units >= 0),
    has_laboratory    BOOLEAN NOT NULL DEFAULT FALSE,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. CLASSROOMS (Term-Specific Subject Offerings)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classrooms (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id            UUID NOT NULL REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    term_id               UUID NOT NULL REFERENCES academic_terms(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    subject_code          VARCHAR(40) NOT NULL REFERENCES academic_subjects(code) ON UPDATE CASCADE ON DELETE RESTRICT,
    subject_title         VARCHAR(160) NOT NULL,
    section_designation   VARCHAR(40) NOT NULL, -- e.g. 'BSIT 2D'
    has_laboratory        BOOLEAN NOT NULL DEFAULT FALSE,
    join_code             VARCHAR(12) UNIQUE NOT NULL,
    theme_color           VARCHAR(16) NOT NULL DEFAULT '#173B70',
    banner_url            TEXT,
    description           TEXT DEFAULT '',
    is_archived           BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at           TIMESTAMPTZ DEFAULT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. CLASSROOM MEMBERSHIPS (Subject Enrollment & Modular Lab Batch)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classroom_members (
    classroom_id          UUID NOT NULL REFERENCES classrooms(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    user_id               UUID NOT NULL REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    role                  VARCHAR(24) NOT NULL DEFAULT 'student' 
                          CHECK (role IN ('student', 'teacher', 'class_rep')),
    assigned_lab_batch    SMALLINT DEFAULT NULL CHECK (assigned_lab_batch IS NULL OR assigned_lab_batch > 0),
    enrolled_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (classroom_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 7. CLASS SCHEDULES (Official Weekly Timetable)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_schedules (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_id      UUID NOT NULL REFERENCES classrooms(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    schedule_type     VARCHAR(20) NOT NULL DEFAULT 'lecture' CHECK (schedule_type IN ('lecture', 'laboratory')),
    applicable_batch  SMALLINT DEFAULT NULL CHECK (applicable_batch IS NULL OR applicable_batch > 0),
    day_of_week       SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1=Monday, 7=Sunday
    start_time        TIME NOT NULL,
    end_time          TIME NOT NULL,
    room_location     VARCHAR(80) DEFAULT 'Online / Virtual',
    meeting_mode      VARCHAR(24) NOT NULL DEFAULT 'online' CHECK (meeting_mode IN ('online', 'in_person', 'hybrid')),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_schedule_time CHECK (end_time > start_time)
);

-- ----------------------------------------------------------------------------
-- 8. SCHEDULED CLASS SESSIONS & REPLACEMENT AUDIT
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_sessions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_id      UUID NOT NULL REFERENCES classrooms(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    schedule_id       UUID REFERENCES class_schedules(id) ON UPDATE CASCADE ON DELETE SET NULL,
    host_id           UUID NOT NULL REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    title             VARCHAR(180) NOT NULL,
    meeting_code      VARCHAR(24) UNIQUE NOT NULL,
    session_type      VARCHAR(32) NOT NULL DEFAULT 'regular_scheduled'
                      CHECK (session_type IN ('regular_scheduled', 'rescheduled', 'replacement', 'consultation')),
    status            VARCHAR(24) NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
    scheduled_start   TIMESTAMPTZ NOT NULL,
    scheduled_end     TIMESTAMPTZ NOT NULL,
    actual_started_at TIMESTAMPTZ,
    actual_ended_at   TIMESTAMPTZ,
    cancel_reason     TEXT,
    replacement_for_id UUID REFERENCES class_sessions(id) ON UPDATE CASCADE ON DELETE SET NULL,
    settings          JSONB NOT NULL DEFAULT '{"mute_on_entry": true, "allow_screen_share": true, "waiting_room": true}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_session_window CHECK (scheduled_end > scheduled_start)
);

-- Attendance Records
CREATE TABLE IF NOT EXISTS session_participants (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id        UUID NOT NULL REFERENCES class_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    user_id           UUID NOT NULL REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    role              VARCHAR(24) NOT NULL DEFAULT 'participant' CHECK (role IN ('host', 'co-host', 'participant')),
    joined_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at           TIMESTAMPTZ,
    duration_seconds  INTEGER DEFAULT 0 CHECK (duration_seconds >= 0),
    device_info       VARCHAR(120),
    UNIQUE (session_id, user_id, joined_at)
);

-- ----------------------------------------------------------------------------
-- 9. CLASSROOM STREAM ANNOUNCEMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classroom_announcements (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_id      UUID NOT NULL REFERENCES classrooms(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    author_id         UUID NOT NULL REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    content           TEXT NOT NULL,
    attachments       JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_pinned         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 10. CLASSWORK ASSIGNMENTS & LEARNING ACTIVITIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_id      UUID NOT NULL REFERENCES classrooms(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    author_id         UUID NOT NULL REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    title             VARCHAR(200) NOT NULL,
    instructions      TEXT NOT NULL DEFAULT '',
    activity_type     VARCHAR(32) NOT NULL DEFAULT 'assignment' 
                      CHECK (activity_type IN ('assignment', 'activity', 'quiz', 'project', 'material')),
    max_score         NUMERIC(5,2) NOT NULL DEFAULT 100.00 CHECK (max_score > 0),
    due_at            TIMESTAMPTZ,
    allowed_formats   TEXT[] DEFAULT ARRAY['pdf','docx','pptx','xlsx','zip','jpg','png'],
    max_attachments   SMALLINT NOT NULL DEFAULT 5 CHECK (max_attachments BETWEEN 1 AND 20),
    max_file_size_mb  SMALLINT NOT NULL DEFAULT 25 CHECK (max_file_size_mb BETWEEN 1 AND 100),
    allow_resubmit    BOOLEAN NOT NULL DEFAULT TRUE,
    reference_files   JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_published      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 11. STUDENT SUBMISSIONS & VERSION HISTORY
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submissions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id     UUID NOT NULL REFERENCES assignments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    student_id        UUID NOT NULL REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    status            VARCHAR(24) NOT NULL DEFAULT 'SUBMITTED' 
                      CHECK (status IN ('NOT_SUBMITTED', 'DRAFT', 'SUBMITTED', 'LATE', 'RETURNED', 'GRADED')),
    current_score     NUMERIC(5,2) DEFAULT NULL,
    current_feedback  TEXT DEFAULT NULL,
    current_version   SMALLINT NOT NULL DEFAULT 1 CHECK (current_version >= 1),
    submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (assignment_id, student_id)
);

CREATE TABLE IF NOT EXISTS submission_files (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id     UUID NOT NULL REFERENCES submissions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    version_number    SMALLINT NOT NULL DEFAULT 1,
    file_name         VARCHAR(255) NOT NULL,
    file_size_bytes   BIGINT NOT NULL CHECK (file_size_bytes > 0),
    file_mime         VARCHAR(120) NOT NULL,
    storage_path      TEXT NOT NULL,
    is_secure         BOOLEAN NOT NULL DEFAULT TRUE,
    uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submission_versions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id     UUID NOT NULL REFERENCES submissions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    version_number    SMALLINT NOT NULL,
    file_manifest     JSONB NOT NULL DEFAULT '[]'::jsonb,
    student_notes     TEXT DEFAULT '',
    is_late           BOOLEAN NOT NULL DEFAULT FALSE,
    uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (submission_id, version_number)
);

CREATE TABLE IF NOT EXISTS grade_audit_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id     UUID NOT NULL REFERENCES submissions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    graded_by         UUID NOT NULL REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    previous_score    NUMERIC(5,2) DEFAULT NULL,
    new_score         NUMERIC(5,2) NOT NULL,
    feedback          TEXT DEFAULT NULL,
    action_type       VARCHAR(24) NOT NULL CHECK (action_type IN ('grade_assigned', 'grade_updated', 'work_returned')),
    recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 12. ACADEMIC GROUPS (Personal Groups vs. Official Academic Channels)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academic_groups (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   UUID NOT NULL UNIQUE REFERENCES conversations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    name              VARCHAR(120) NOT NULL,
    description       TEXT DEFAULT '',
    avatar_url        TEXT,
    group_type        VARCHAR(32) NOT NULL DEFAULT 'personal'
                      CHECK (group_type IN ('personal', 'academic_section', 'academic_batch', 'academic_subject', 'campus_lounge')),
    privacy           VARCHAR(24) NOT NULL DEFAULT 'open'
                      CHECK (privacy IN ('open', 'closed', 'secret')),
    join_policy       VARCHAR(32) NOT NULL DEFAULT 'open_link'
                      CHECK (join_policy IN ('open_link', 'approval_required', 'invite_only')),
    classroom_id      UUID REFERENCES classrooms(id) ON UPDATE CASCADE ON DELETE SET NULL,
    section_code      VARCHAR(40),
    creator_id        UUID NOT NULL REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    is_archived       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_invitations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id          UUID NOT NULL REFERENCES academic_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    token             VARCHAR(64) NOT NULL UNIQUE,
    created_by        UUID NOT NULL REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    invite_type       VARCHAR(24) NOT NULL DEFAULT 'link' CHECK (invite_type IN ('link', 'direct_invite')),
    max_uses          INTEGER DEFAULT NULL,
    uses_count        INTEGER NOT NULL DEFAULT 0,
    expires_at        TIMESTAMPTZ DEFAULT NULL,
    is_revoked        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_join_requests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id          UUID NOT NULL REFERENCES academic_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    user_id           UUID NOT NULL REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    status            VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    request_note      TEXT DEFAULT '',
    reviewed_by       UUID REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL,
    reviewed_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (group_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 13. COMPOSITE INDEXES & PERFORMANCE OPTIMIZATIONS
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_academic_sections_lookup 
    ON academic_sections (term_id, program_code, year_level_code, is_active);

CREATE INDEX IF NOT EXISTS idx_classrooms_term_teacher 
    ON classrooms (term_id, teacher_id, is_archived);

CREATE INDEX IF NOT EXISTS idx_classroom_members_user 
    ON classroom_members (user_id);

CREATE INDEX IF NOT EXISTS idx_class_schedules_lookup 
    ON class_schedules (classroom_id, day_of_week, is_active);

CREATE INDEX IF NOT EXISTS idx_class_sessions_room_status 
    ON class_sessions (classroom_id, status, scheduled_start);

CREATE INDEX IF NOT EXISTS idx_assignments_classroom_due 
    ON assignments (classroom_id, due_at, is_published);

CREATE INDEX IF NOT EXISTS idx_submissions_lookup 
    ON submissions (assignment_id, student_id);

CREATE INDEX IF NOT EXISTS idx_submission_versions_sub 
    ON submission_versions (submission_id, version_number);

CREATE INDEX IF NOT EXISTS idx_grade_audit_sub 
    ON grade_audit_logs (submission_id, recorded_at ASC);

CREATE INDEX IF NOT EXISTS idx_academic_groups_type 
    ON academic_groups (group_type, section_code, is_archived);

CREATE INDEX IF NOT EXISTS idx_group_invitations_token 
    ON group_invitations (token) WHERE is_revoked = FALSE;

-- ----------------------------------------------------------------------------
-- 14. ROW LEVEL SECURITY (RLS) POLICIES & DEFENSE-IN-DEPTH
-- ----------------------------------------------------------------------------
ALTER TABLE academic_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE classroom_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE classroom_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_join_requests ENABLE ROW LEVEL SECURITY;

-- Revoke all direct PostgREST anon access to academic coursework and grades
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE submissions, submission_files, submission_versions, grade_audit_logs, session_participants FROM anon;
    END IF;
END $$;

-- Academic Catalog / Terms / Sections (Publicly Readable by authenticated campus members)
DROP POLICY IF EXISTS pol_academic_terms_select ON academic_terms;
CREATE POLICY pol_academic_terms_select ON academic_terms FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS pol_academic_sections_select ON academic_sections;
CREATE POLICY pol_academic_sections_select ON academic_sections FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS pol_academic_subjects_select ON academic_subjects;
CREATE POLICY pol_academic_subjects_select ON academic_subjects FOR SELECT USING (is_active = TRUE);

-- Classrooms: Visible to enrolled students and the assigned teacher
DROP POLICY IF EXISTS pol_classrooms_select ON classrooms;
CREATE POLICY pol_classrooms_select ON classrooms FOR SELECT USING (
    teacher_id = app_current_user_id()
    OR id IN (SELECT classroom_id FROM classroom_members WHERE user_id = app_current_user_id())
);

-- Submissions: Students only see their own work; Teachers see all submissions in their classrooms
DROP POLICY IF EXISTS pol_submissions_select ON submissions;
CREATE POLICY pol_submissions_select ON submissions FOR SELECT USING (
    student_id = app_current_user_id()
    OR assignment_id IN (
        SELECT a.id FROM assignments a
        JOIN classrooms c ON c.id = a.classroom_id
        WHERE c.teacher_id = app_current_user_id()
    )
);

-- Grade Audit Logs: Teachers see full audit trail; Students see their own finalized records
DROP POLICY IF EXISTS pol_grade_audit_select ON grade_audit_logs;
CREATE POLICY pol_grade_audit_select ON grade_audit_logs FOR SELECT USING (
    graded_by = app_current_user_id()
    OR submission_id IN (
        SELECT s.id FROM submissions s WHERE s.student_id = app_current_user_id()
    )
);

-- ----------------------------------------------------------------------------
-- 15. BASELINE SEED DATA (Current Academic Term, Core Subjects & Sections)
-- ----------------------------------------------------------------------------
INSERT INTO academic_terms (school_year, semester, is_current, starts_at, ends_at)
VALUES ('2026-2027', '1st Semester', TRUE, '2026-08-15', '2026-12-20')
ON CONFLICT (school_year, semester) DO UPDATE SET is_current = TRUE;

-- Seed IT 305W Core Subject
INSERT INTO academic_subjects (program_code, code, title, lecture_units, lab_units, has_laboratory, is_active)
VALUES ('BSIT', 'IT 305W', 'Advanced Web Applications', 2.0, 1.0, TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Seed Dynamic Sections for BSIT (Sections A, B, C, D, E for Year Levels 1-4)
DO $$
DECLARE
    term_uuid UUID;
    y_code VARCHAR(32);
    sec_letter VARCHAR(8);
BEGIN
    SELECT id INTO term_uuid FROM academic_terms WHERE school_year = '2026-2027' AND semester = '1st Semester' LIMIT 1;
    
    FOREACH y_code IN ARRAY ARRAY['1st_year', '2nd_year', '3rd_year', '4th_year'] LOOP
        FOREACH sec_letter IN ARRAY ARRAY['A', 'B', 'C', 'D', 'E'] LOOP
            INSERT INTO academic_sections (term_id, program_code, year_level_code, section_letter, default_lab_batches, max_capacity, is_active)
            VALUES (term_uuid, 'BSIT', y_code, sec_letter, 2, 45, TRUE)
            ON CONFLICT (term_id, program_code, year_level_code, section_letter) DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

COMMIT;
