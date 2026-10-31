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
