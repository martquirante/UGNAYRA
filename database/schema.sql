-- ============================================================================
-- UGNAYRA — Master Canonical Supabase PostgreSQL Schema (schema.sql)
-- School-Based Social Networking Platform
-- Generated cleanly from database/migrations/001..004 + database/policies/001
-- Paste directly into Supabase SQL Editor to initialize the complete schema.
-- ============================================================================

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


-- ============================================================================
-- UGNAYRA — Migration 002: Normalized Core Relational Tables
-- Target: Supabase PostgreSQL 15+
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. PROFILES (Academic Users: Students, Teachers, Authorized Personnel)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email             CITEXT NOT NULL UNIQUE,
    username          CITEXT NOT NULL UNIQUE,
    password_hash     TEXT NOT NULL,
    full_name         VARCHAR(120) NOT NULL,
    role              user_role NOT NULL DEFAULT 'student',
    school_id_number  VARCHAR(40) UNIQUE,
    department        VARCHAR(120),
    year_or_grade     VARCHAR(40),
    section           VARCHAR(40),
    bio               VARCHAR(500) NOT NULL DEFAULT '',
    avatar_url        TEXT,
    cover_url         TEXT,
    preferences       JSONB NOT NULL DEFAULT '{"show_online_status": true, "notify_comments": true, "notify_likes": true, "notify_messages": true}'::jsonb,
    last_seen_at      TIMESTAMPTZ,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_profiles_username_format CHECK (username ~ '^[a-zA-Z0-9._-]{3,32}$'),
    CONSTRAINT chk_profiles_fullname_len CHECK (char_length(btrim(full_name)) >= 2)
);

-- ----------------------------------------------------------------------------
-- 2. USER_SESSIONS (Server-Backed PHP Session & CSRF Verification Store)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sessions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    php_session_id    VARCHAR(128),
    token_hash        CHAR(64) NOT NULL UNIQUE,
    csrf_token_hash   CHAR(64) NOT NULL,
    ip_address        VARCHAR(64),
    user_agent        VARCHAR(512),
    last_active_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ NOT NULL,
    revoked_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. COMMUNITIES (Academic Courses, Departments, Clubs & Study Groups)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS communities (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug              CITEXT NOT NULL UNIQUE,
    name              VARCHAR(120) NOT NULL,
    category          community_category NOT NULL DEFAULT 'academic',
    description       VARCHAR(1000) NOT NULL DEFAULT '',
    rules             VARCHAR(2000) NOT NULL DEFAULT '',
    avatar_url        TEXT,
    banner_url        TEXT,
    privacy           community_privacy NOT NULL DEFAULT 'public',
    created_by        UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    members_count     INTEGER NOT NULL DEFAULT 0 CHECK (members_count >= 0),
    posts_count       INTEGER NOT NULL DEFAULT 0 CHECK (posts_count >= 0),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_communities_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

-- ----------------------------------------------------------------------------
-- 4. COMMUNITY_MEMBERS (Membership & Role Matrix)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_members (
    community_id      UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    member_role       community_member_role NOT NULL DEFAULT 'member',
    joined_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (community_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 5. POSTS (Campus News Feed & Community Posts + Post Sharing)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    community_id      UUID REFERENCES communities(id) ON DELETE CASCADE,
    shared_post_id    UUID REFERENCES posts(id) ON DELETE SET NULL,
    content           TEXT NOT NULL DEFAULT '',
    visibility        post_visibility NOT NULL DEFAULT 'campus',
    likes_count       INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
    comments_count    INTEGER NOT NULL DEFAULT 0 CHECK (comments_count >= 0),
    shares_count      INTEGER NOT NULL DEFAULT 0 CHECK (shares_count >= 0),
    is_edited         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_posts_content_len CHECK (char_length(content) <= 5000),
    CONSTRAINT chk_posts_community_visibility CHECK (
        (community_id IS NULL AND visibility = 'campus')
        OR (community_id IS NOT NULL)
    )
);

-- ----------------------------------------------------------------------------
-- 6. COMMUNITY_POSTS (Community Curation Metadata without Duplicating Posts)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_posts (
    community_id      UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    post_id           UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    is_announcement   BOOLEAN NOT NULL DEFAULT FALSE,
    is_pinned         BOOLEAN NOT NULL DEFAULT FALSE,
    pinned_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (community_id, post_id)
);

-- ----------------------------------------------------------------------------
-- 7. POST_IMAGES (Normalized Multi-Image Attachments per Post)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_images (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    image_url         TEXT NOT NULL,
    storage_path      TEXT,
    mime_type         VARCHAR(64) NOT NULL DEFAULT 'image/jpeg',
    file_size_bytes   INTEGER CHECK (file_size_bytes IS NULL OR file_size_bytes > 0),
    width             INTEGER CHECK (width IS NULL OR width > 0),
    height            INTEGER CHECK (height IS NULL OR height > 0),
    alt_text          VARCHAR(255) NOT NULL DEFAULT '',
    sort_order        SMALLINT NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 8. POST_LIKES (Unique Reaction Matrix)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_likes (
    post_id           UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 9. COMMENTS (Post Discussions & Optional Threaded Replies)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    content           TEXT NOT NULL,
    is_edited         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_comments_content_nonempty CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000)
);

-- ----------------------------------------------------------------------------
-- 10. CONVERSATIONS (1-to-1 Private Threads & Academic Group Threads)
-- direct_key enforces deterministic uniqueness (e.g. "uuidA:uuidB") for 1-to-1
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_group              BOOLEAN NOT NULL DEFAULT FALSE,
    title                 VARCHAR(120),
    direct_key            VARCHAR(100) UNIQUE,
    last_message_preview  VARCHAR(240),
    last_message_at       TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 11. CONVERSATION_MEMBERS (Read Receipts, Unread Counters & Typing TTL)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id       UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    last_read_message_id  UUID,
    last_read_at          TIMESTAMPTZ,
    unread_count          INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
    typing_until          TIMESTAMPTZ,
    is_muted              BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 12. MESSAGES (Private Conversation Message History)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    body              TEXT NOT NULL DEFAULT '',
    attachment_url    TEXT,
    attachment_mime   VARCHAR(64),
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_messages_payload CHECK (
        char_length(btrim(body)) > 0 OR attachment_url IS NOT NULL
    ),
    CONSTRAINT chk_messages_body_len CHECK (char_length(body) <= 4000)
);

-- Link optional FK for last_read_message_id once messages exists
DO $$ BEGIN
    ALTER TABLE conversation_members
        ADD CONSTRAINT fk_conv_members_last_read_msg
        FOREIGN KEY (last_read_message_id) REFERENCES messages(id) ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 13. ANNOUNCEMENTS (Official School Bulletins by Teachers & Personnel)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    title             VARCHAR(180) NOT NULL,
    body              TEXT NOT NULL,
    category          announcement_category NOT NULL DEFAULT 'academic',
    priority          announcement_priority NOT NULL DEFAULT 'normal',
    target_department VARCHAR(120),
    attachment_url    TEXT,
    is_pinned         BOOLEAN NOT NULL DEFAULT FALSE,
    published_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_announcements_title_len CHECK (char_length(btrim(title)) >= 3),
    CONSTRAINT chk_announcements_body_len CHECK (char_length(btrim(body)) BETWEEN 5 AND 10000)
);

-- ----------------------------------------------------------------------------
-- 14. NOTIFICATIONS (Unified Activity & Alert Stream)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    actor_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
    type              notification_type NOT NULL,
    entity_type       VARCHAR(40) NOT NULL,
    entity_id         UUID NOT NULL,
    title             VARCHAR(180) NOT NULL,
    preview           VARCHAR(280),
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_read           BOOLEAN NOT NULL DEFAULT FALSE,
    read_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;


-- ============================================================================
-- UGNAYRA — Migration 003: Performance Indexes & Data Integrity Triggers
-- Target: Supabase PostgreSQL 15+
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. AUTOMATIC updated_at TIMESTAMP TRIGGER
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_communities_updated_at ON communities;
CREATE TRIGGER trg_communities_updated_at
    BEFORE UPDATE ON communities
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_posts_updated_at ON posts;
CREATE TRIGGER trg_posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_comments_updated_at ON comments;
CREATE TRIGGER trg_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON conversations;
CREATE TRIGGER trg_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_announcements_updated_at ON announcements;
CREATE TRIGGER trg_announcements_updated_at
    BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. DENORMALIZED COUNTER INTEGRITY TRIGGERS (Zero Counter Drift)
-- ----------------------------------------------------------------------------

-- Sync posts.likes_count
CREATE OR REPLACE FUNCTION fn_sync_post_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_post_likes_count ON post_likes;
CREATE TRIGGER trg_sync_post_likes_count
    AFTER INSERT OR DELETE ON post_likes
    FOR EACH ROW EXECUTE FUNCTION fn_sync_post_likes_count();

-- Sync posts.comments_count
CREATE OR REPLACE FUNCTION fn_sync_post_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_post_comments_count ON comments;
CREATE TRIGGER trg_sync_post_comments_count
    AFTER INSERT OR DELETE ON comments
    FOR EACH ROW EXECUTE FUNCTION fn_sync_post_comments_count();

-- Sync posts.shares_count when a post references shared_post_id
CREATE OR REPLACE FUNCTION fn_sync_post_shares_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.shared_post_id IS NOT NULL THEN
        UPDATE posts SET shares_count = shares_count + 1 WHERE id = NEW.shared_post_id;
    ELSIF TG_OP = 'DELETE' AND OLD.shared_post_id IS NOT NULL THEN
        UPDATE posts SET shares_count = GREATEST(0, shares_count - 1) WHERE id = OLD.shared_post_id;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_post_shares_count ON posts;
CREATE TRIGGER trg_sync_post_shares_count
    AFTER INSERT OR DELETE ON posts
    FOR EACH ROW EXECUTE FUNCTION fn_sync_post_shares_count();

-- Sync communities.members_count
CREATE OR REPLACE FUNCTION fn_sync_community_members_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE communities SET members_count = members_count + 1 WHERE id = NEW.community_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE communities SET members_count = GREATEST(0, members_count - 1) WHERE id = OLD.community_id;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_community_members_count ON community_members;
CREATE TRIGGER trg_sync_community_members_count
    AFTER INSERT OR DELETE ON community_members
    FOR EACH ROW EXECUTE FUNCTION fn_sync_community_members_count();

-- Sync communities.posts_count
CREATE OR REPLACE FUNCTION fn_sync_community_posts_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.community_id IS NOT NULL THEN
        UPDATE communities SET posts_count = posts_count + 1 WHERE id = NEW.community_id;
    ELSIF TG_OP = 'DELETE' AND OLD.community_id IS NOT NULL THEN
        UPDATE communities SET posts_count = GREATEST(0, posts_count - 1) WHERE id = OLD.community_id;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_community_posts_count ON posts;
CREATE TRIGGER trg_sync_community_posts_count
    AFTER INSERT OR DELETE ON posts
    FOR EACH ROW EXECUTE FUNCTION fn_sync_community_posts_count();

-- ----------------------------------------------------------------------------
-- 3. QUERY-ALIGNED COMPOSITE & SEARCH INDEXES
-- ----------------------------------------------------------------------------

-- Profiles: active directory, online classmates presence, and trigram name search
CREATE INDEX IF NOT EXISTS idx_profiles_role_active ON profiles (role, is_active);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON profiles (last_seen_at DESC NULLS LAST) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_search_trgm ON profiles USING GIN (
    (full_name || ' ' || username || ' ' || COALESCE(department, '')) gin_trgm_ops
);

-- Sessions: active session lookup & cleanup
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_expires ON user_sessions (user_id, expires_at DESC) WHERE revoked_at IS NULL;

-- Posts: cursor-paginated main feed, author timeline, community feed, and full-text search
CREATE INDEX IF NOT EXISTS idx_posts_campus_feed ON posts (created_at DESC, id DESC) WHERE visibility = 'campus';
CREATE INDEX IF NOT EXISTS idx_posts_author_feed ON posts (author_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_posts_community_feed ON posts (community_id, created_at DESC, id DESC) WHERE community_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_shared_parent ON posts (shared_post_id) WHERE shared_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_content_fts ON posts USING GIN (to_tsvector('english', content));

-- Post Images & Comments
CREATE INDEX IF NOT EXISTS idx_post_images_post_sort ON post_images (post_id, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments (post_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_post_likes_user ON post_likes (user_id, created_at DESC);

-- Communities & Members
CREATE INDEX IF NOT EXISTS idx_communities_category_members ON communities (category, members_count DESC);
CREATE INDEX IF NOT EXISTS idx_communities_search_trgm ON communities USING GIN (
    (name || ' ' || description) gin_trgm_ops
);
CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members (user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_pinned ON community_posts (community_id, is_pinned DESC, is_announcement DESC, created_at DESC);

-- Messaging: inbox ordering & delta message polling
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations (last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conv_members_user_unread ON conversation_members (user_id, unread_count DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages (conversation_id, created_at ASC, id ASC);

-- Announcements: pinned + priority + chronological campus board & search
CREATE INDEX IF NOT EXISTS idx_announcements_board ON announcements (is_pinned DESC, published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_category_priority ON announcements (category, priority, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_fts ON announcements USING GIN (
    to_tsvector('english', title || ' ' || body)
);

-- Notifications: unread badge counter & paginated activity drawer
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON notifications (recipient_id, is_read, created_at DESC);

COMMIT;


-- ============================================================================
-- UGNAYRA — Migration 004: Isolated WebRTC Video Signaling Seam (Future-Ready)
-- Separated per Section 6.I — No fake UI controls; ready for real SDP/ICE relay
-- ============================================================================

BEGIN;

DO $$ BEGIN
    CREATE TYPE rtc_call_status AS ENUM (
        'ringing',
        'connected',
        'ended',
        'declined',
        'missed'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS rtc_call_sessions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    initiator_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status            rtc_call_status NOT NULL DEFAULT 'ringing',
    started_at        TIMESTAMPTZ,
    ended_at          TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rtc_signaling_events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_session_id   UUID NOT NULL REFERENCES rtc_call_sessions(id) ON DELETE CASCADE,
    sender_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    signal_type       VARCHAR(24) NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice-candidate', 'hangup')),
    payload           JSONB NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rtc_signals_session_created
    ON rtc_signaling_events (call_session_id, created_at ASC);

COMMIT;


-- ============================================================================
-- UGNAYRA — Supabase Row Level Security (RLS) & Access Alignment Policies
-- ============================================================================
-- ARCHITECTURAL SECURITY NOTE:
-- 1. UGNAYRA's PHP 8.2+ REST API connects over TLS via PDO (pdo_pgsql) and
--    enforces authentication, session validation, CSRF, and role-based access
--    in PHP Middleware & Domain Services.
-- 2. By default, Supabase exposes the `public` schema through PostgREST (`anon`
--    and `authenticated` API roles). Leaving RLS disabled on `public` tables
--    would expose `profiles.password_hash` and `user_sessions` via PostgREST!
-- 3. Therefore, we enable RLS on EVERY table, revoke direct `anon` table grants
--    on sensitive credentials, and define defense-in-depth policies aligned with
--    PHP's optional `app.current_user_id` session setting (`SET LOCAL`).
-- ============================================================================

BEGIN;

-- Helper function reading PHP-set session context (`SET LOCAL app.current_user_id = '...'`)
-- or Supabase `auth.uid()` if present.
CREATE OR REPLACE FUNCTION app_current_user_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_uid TEXT;
BEGIN
    v_uid := NULLIF(current_setting('app.current_user_id', true), '');
    IF v_uid IS NOT NULL THEN
        RETURN v_uid::UUID;
    END IF;
    RETURN NULL;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$;

-- Enable Row Level Security across all 16 public tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE rtc_call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rtc_signaling_events ENABLE ROW LEVEL SECURITY;

-- Explicitly revoke direct PostgREST `anon` access to sensitive auth columns/tables
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE user_sessions FROM anon;
        REVOKE ALL ON TABLE profiles FROM anon;
        REVOKE ALL ON TABLE messages FROM anon;
        REVOKE ALL ON TABLE conversations FROM anon;
        REVOKE ALL ON TABLE conversation_members FROM anon;
        REVOKE ALL ON TABLE notifications FROM anon;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Defense-in-Depth Policies (Active for non-superuser / app-scoped DB roles)
-- ----------------------------------------------------------------------------

-- PROFILES: Authenticated campus members can view active profiles; users edit own
DROP POLICY IF EXISTS pol_profiles_select ON profiles;
CREATE POLICY pol_profiles_select ON profiles
    FOR SELECT USING (app_current_user_id() IS NOT NULL AND is_active = TRUE);

DROP POLICY IF EXISTS pol_profiles_update_own ON profiles;
CREATE POLICY pol_profiles_update_own ON profiles
    FOR UPDATE USING (id = app_current_user_id())
    WITH CHECK (id = app_current_user_id());

-- USER_SESSIONS: Strictly private to the session owner
DROP POLICY IF EXISTS pol_sessions_own ON user_sessions;
CREATE POLICY pol_sessions_own ON user_sessions
    FOR ALL USING (user_id = app_current_user_id());

-- POSTS: Campus posts visible to authenticated users; community posts follow membership/public privacy
DROP POLICY IF EXISTS pol_posts_select ON posts;
CREATE POLICY pol_posts_select ON posts
    FOR SELECT USING (
        app_current_user_id() IS NOT NULL
        AND (
            visibility = 'campus'
            OR EXISTS (
                SELECT 1 FROM communities c
                WHERE c.id = posts.community_id
                  AND (
                      c.privacy = 'public'
                      OR EXISTS (
                          SELECT 1 FROM community_members cm
                          WHERE cm.community_id = c.id
                            AND cm.user_id = app_current_user_id()
                      )
                  )
            )
        )
    );

DROP POLICY IF EXISTS pol_posts_insert_own ON posts;
CREATE POLICY pol_posts_insert_own ON posts
    FOR INSERT WITH CHECK (author_id = app_current_user_id());

DROP POLICY IF EXISTS pol_posts_modify_own ON posts;
CREATE POLICY pol_posts_modify_own ON posts
    FOR UPDATE USING (author_id = app_current_user_id())
    WITH CHECK (author_id = app_current_user_id());

DROP POLICY IF EXISTS pol_posts_delete_own_or_personnel ON posts;
CREATE POLICY pol_posts_delete_own_or_personnel ON posts
    FOR DELETE USING (
        author_id = app_current_user_id()
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = app_current_user_id() AND p.role = 'personnel'
        )
    );

-- COMMENTS & LIKES
DROP POLICY IF EXISTS pol_comments_select ON comments;
CREATE POLICY pol_comments_select ON comments
    FOR SELECT USING (app_current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS pol_comments_insert ON comments;
CREATE POLICY pol_comments_insert ON comments
    FOR INSERT WITH CHECK (author_id = app_current_user_id());

DROP POLICY IF EXISTS pol_likes_select ON post_likes;
CREATE POLICY pol_likes_select ON post_likes
    FOR SELECT USING (app_current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS pol_likes_manage ON post_likes;
CREATE POLICY pol_likes_manage ON post_likes
    FOR ALL USING (user_id = app_current_user_id())
    WITH CHECK (user_id = app_current_user_id());

-- MESSAGING: Strictly restricted to conversation participants
DROP POLICY IF EXISTS pol_conversations_member ON conversations;
CREATE POLICY pol_conversations_member ON conversations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM conversation_members cm
            WHERE cm.conversation_id = conversations.id
              AND cm.user_id = app_current_user_id()
        )
    );

DROP POLICY IF EXISTS pol_conv_members_member ON conversation_members;
CREATE POLICY pol_conv_members_member ON conversation_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM conversation_members cm
            WHERE cm.conversation_id = conversation_members.conversation_id
              AND cm.user_id = app_current_user_id()
        )
    );

DROP POLICY IF EXISTS pol_messages_member_select ON messages;
CREATE POLICY pol_messages_member_select ON messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM conversation_members cm
            WHERE cm.conversation_id = messages.conversation_id
              AND cm.user_id = app_current_user_id()
        )
    );

DROP POLICY IF EXISTS pol_messages_member_insert ON messages;
CREATE POLICY pol_messages_member_insert ON messages
    FOR INSERT WITH CHECK (
        sender_id = app_current_user_id()
        AND EXISTS (
            SELECT 1 FROM conversation_members cm
            WHERE cm.conversation_id = messages.conversation_id
              AND cm.user_id = app_current_user_id()
        )
    );

-- ANNOUNCEMENTS: Viewable by all authenticated campus members; authored only by teacher/personnel
DROP POLICY IF EXISTS pol_announcements_select ON announcements;
CREATE POLICY pol_announcements_select ON announcements
    FOR SELECT USING (app_current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS pol_announcements_publish ON announcements;
CREATE POLICY pol_announcements_publish ON announcements
    FOR INSERT WITH CHECK (
        author_id = app_current_user_id()
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = app_current_user_id()
              AND p.role IN ('teacher', 'personnel')
        )
    );

-- NOTIFICATIONS: Strictly private to recipient
DROP POLICY IF EXISTS pol_notifications_recipient ON notifications;
CREATE POLICY pol_notifications_recipient ON notifications
    FOR ALL USING (recipient_id = app_current_user_id())
    WITH CHECK (recipient_id = app_current_user_id());

COMMIT;


-- ============================================================================
-- UGNAYRA â€” Migration 005: BulSU Academic Units, Programs & Year Levels Catalog
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

-- ============================================================================
-- UGNAYRA â€” Seeder 001: Official Bulacan State University (BulSU) Academics
-- Source: https://www.bulsu.edu.ph/academics
-- Idempotent (ON CONFLICT DO UPDATE) â€” safe to run multiple times in Supabase.
-- ============================================================================

BEGIN;

-- 1. Academic Colleges, External Campuses, Graduate School, Lab High & Offices
INSERT INTO academic_units (code, name, unit_type, campus, sort_order) VALUES
    ('CICT',       'CICT â€” College of Information and Communications Technology', 'college',         'Main Campus (Malolos)', 10),
    ('COE',        'COE â€” College of Engineering',                                'college',         'Main Campus (Malolos)', 20),
    ('CBEA',       'CBEA â€” College of Business Education and Accountancy',        'college',         'Main Campus (Malolos)', 30),
    ('CAFA',       'CAFA â€” College of Architecture and Fine Arts',                'college',         'Main Campus (Malolos)', 40),
    ('CIT',        'CIT â€” College of Industrial Technology',                      'college',         'Main Campus (Malolos)', 50),
    ('CPTE',       'CPTE â€” College of Professional Teacher Education',            'college',         'Main Campus (Malolos)', 60),
    ('CS',         'CS â€” College of Science',                                     'college',         'Main Campus (Malolos)', 70),
    ('CHTM',       'CHTM â€” College of Hospitality and Tourism Management',        'college',         'Main Campus (Malolos)', 80),
    ('CSSP',       'CSSP â€” College of Social Sciences and Philosophy',            'college',         'Main Campus (Malolos)', 90),
    ('CAL',        'CAL â€” College of Arts and Letters',                           'college',         'Main Campus (Malolos)', 100),
    ('CCJE',       'CCJE â€” College of Criminal Justice Education',                'college',         'Main Campus (Malolos)', 110),
    ('CON',        'CON â€” College of Nursing',                                    'college',         'Main Campus (Malolos)', 120),
    ('CSER',       'CSER â€” College of Sports, Exercise and Recreation',           'college',         'Main Campus (Malolos)', 130),
    ('COL',        'COL â€” College of Law',                                        'college',         'Main Campus (Malolos)', 140),
    ('COM',        'COM â€” College of Medicine',                                   'college',         'Main Campus (Malolos)', 150),
    ('GS',         'GS â€” Graduate School',                                        'graduate',        'Main Campus (Malolos)', 160),
    ('LHS',        'LHS â€” Laboratory High School',                                'basic_ed',        'Main Campus (Malolos)', 170),
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
    ('JHS_7_10',  'Grades 7â€“10 (Lab High)',   'student', 110),
    ('INST',      'Instructor Iâ€“III',         'teacher', 210),
    ('ASST_PROF', 'Assistant Professor Iâ€“IV', 'teacher', 220),
    ('ASSOC_PROF','Associate Professor Iâ€“V',  'teacher', 230),
    ('PROF',      'Professor Iâ€“VI',           'teacher', 240),
    ('LECTURER',  'Part-Time Lecturer',       'teacher', 250),
    ('CHAIR_DEAN','Program Chair / Dean',     'teacher', 260)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    applicable_role = EXCLUDED.applicable_role,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE;

COMMIT;

