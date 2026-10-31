-- ============================================================================
-- UGNAYRA — Migration 001: Extensions & Enumerated Types
-- Target: Supabase PostgreSQL 15+
-- ============================================================================

BEGIN;

-- Required PostgreSQL extensions (standard on Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Institutional user roles
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('student', 'teacher', 'personnel');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Post visibility boundary
DO $$ BEGIN
    CREATE TYPE post_visibility AS ENUM ('campus', 'community');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Community classification
DO $$ BEGIN
    CREATE TYPE community_category AS ENUM (
        'academic',
        'department',
        'organization',
        'study_group',
        'campus_life'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Community access control
DO $$ BEGIN
    CREATE TYPE community_privacy AS ENUM ('public', 'restricted');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Community membership hierarchy
DO $$ BEGIN
    CREATE TYPE community_member_role AS ENUM ('admin', 'moderator', 'member');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Official school announcement categories
DO $$ BEGIN
    CREATE TYPE announcement_category AS ENUM (
        'academic',
        'campus_events',
        'administrative',
        'urgent_notice',
        'student_affairs'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Official announcement urgency indicators
DO $$ BEGIN
    CREATE TYPE announcement_priority AS ENUM ('normal', 'important', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Unified notification classification
DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM (
        'post_like',
        'post_comment',
        'post_share',
        'new_message',
        'community_post',
        'community_announcement',
        'school_announcement'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
