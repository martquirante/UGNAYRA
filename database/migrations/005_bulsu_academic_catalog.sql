-- ============================================================================
-- UGNAYRA — Migration 005: BulSU Academic Units, Programs & Year Levels Catalog
-- Target: Supabase PostgreSQL 15+
-- Stores official Bulacan State University colleges, campuses, offices,
-- degree courses/programs, and year/rank levels for institutional dropdowns.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS academic_units (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code              VARCHAR(32) NOT NULL UNIQUE,
    name              VARCHAR(160) NOT NULL,
    unit_type         VARCHAR(24) NOT NULL DEFAULT 'college'
                      CHECK (unit_type IN ('college', 'external_campus', 'graduate', 'basic_ed', 'office')),
    campus            VARCHAR(80) NOT NULL DEFAULT 'Main Campus (Malolos)',
    sort_order        SMALLINT NOT NULL DEFAULT 0,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_programs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_code         VARCHAR(32) NOT NULL REFERENCES academic_units(code) ON UPDATE CASCADE ON DELETE CASCADE,
    code              VARCHAR(48) NOT NULL UNIQUE,
    name              VARCHAR(120) NOT NULL,
    applicable_roles  VARCHAR(40) NOT NULL DEFAULT 'student',
    campuses          VARCHAR(180) NOT NULL DEFAULT 'Main Campus',
    sort_order        SMALLINT NOT NULL DEFAULT 0,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_year_levels (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code              VARCHAR(32) NOT NULL UNIQUE,
    label             VARCHAR(60) NOT NULL,
    applicable_role   VARCHAR(24) NOT NULL DEFAULT 'student'
                      CHECK (applicable_role IN ('student', 'teacher', 'all')),
    sort_order        SMALLINT NOT NULL DEFAULT 0,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academic_units_active_order
    ON academic_units (is_active, sort_order, name);

CREATE INDEX IF NOT EXISTS idx_academic_programs_unit_order
    ON academic_programs (unit_code, is_active, sort_order, name);

CREATE INDEX IF NOT EXISTS idx_academic_year_levels_role_order
    ON academic_year_levels (applicable_role, is_active, sort_order);

-- Enable Row Level Security (Read-only public catalog for Sign Up & Onboarding)
ALTER TABLE academic_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_year_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_academic_units_select ON academic_units;
CREATE POLICY pol_academic_units_select ON academic_units
    FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS pol_academic_programs_select ON academic_programs;
CREATE POLICY pol_academic_programs_select ON academic_programs
    FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS pol_academic_year_levels_select ON academic_year_levels;
CREATE POLICY pol_academic_year_levels_select ON academic_year_levels
    FOR SELECT USING (is_active = TRUE);

COMMIT;
