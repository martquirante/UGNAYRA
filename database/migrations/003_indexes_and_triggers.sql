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
