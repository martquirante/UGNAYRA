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
