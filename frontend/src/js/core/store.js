/**
 * UGNAYRA — Reactive Client JSON State Store
 * Demonstrates structured JSON state management, transformation, and export.
 */
(function (window) {
  'use strict';

  var STORAGE_TOKEN_KEY = 'ugnayra_session_token';
  var STORAGE_CSRF_KEY = 'ugnayra_csrf_token';

  var state = {
    initialized: false,
    authenticated: false,
    user: null,
    csrfToken: sessionStorage.getItem(STORAGE_CSRF_KEY) || '',
    sessionToken: sessionStorage.getItem(STORAGE_TOKEN_KEY) || '',
    route: { page: 'feed', param: '' },
    unreadMessages: 0,
    unreadNotifications: 0,
    onlineContacts: [],
    pinnedAnnouncements: [],
    suggestedCommunities: [],
    feedCache: []
  };

  var listeners = [];

  function getState() {
    return state;
  }

  function setState(patch) {
    Object.assign(state, patch);
    if (patch.csrfToken !== undefined) {
      if (patch.csrfToken) sessionStorage.setItem(STORAGE_CSRF_KEY, patch.csrfToken);
      else sessionStorage.removeItem(STORAGE_CSRF_KEY);
    }
    if (patch.sessionToken !== undefined) {
      if (patch.sessionToken) sessionStorage.setItem(STORAGE_TOKEN_KEY, patch.sessionToken);
      else sessionStorage.removeItem(STORAGE_TOKEN_KEY);
    }
    listeners.forEach(function (fn) {
      try {
        fn(state, patch);
      } catch (err) {
        console.error('[UgnayraStore] listener error:', err);
      }
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function unsubscribe() {
      listeners = listeners.filter(function (item) {
        return item !== fn;
      });
    };
  }

  function clearAuth() {
    setState({
      authenticated: false,
      user: null,
      csrfToken: '',
      sessionToken: '',
      unreadMessages: 0,
      unreadNotifications: 0,
      onlineContacts: [],
      feedCache: []
    });
  }

  /**
   * Produces a sanitized, structured JSON snapshot of the user's client state
   * for inspection and JSON export in Settings (IT305W JSON Rubric feature).
   */
  function buildPortableJsonSnapshot(customFilter) {
    var payload = {
      platform: 'UGNAYRA — School-Based Social Networking Platform',
      exported_at: new Date().toISOString(),
      profile: state.user ? {
        id: state.user.id,
        username: state.user.username,
        full_name: state.user.full_name,
        email: state.user.email,
        role: state.user.role,
        school_id_number: state.user.school_id_number,
        department: state.user.department,
        year_or_grade: state.user.year_or_grade,
        section: state.user.section,
        bio: state.user.bio,
        preferences: state.user.preferences || {}
      } : null,
      activity_summary: {
        unread_messages: state.unreadMessages,
        unread_notifications: state.unreadNotifications,
        online_campus_peers_visible: state.onlineContacts.length,
        cached_feed_posts_count: state.feedCache.length
      },
      recent_feed_snapshot: state.feedCache.slice(0, 10).map(function (p) {
        return {
          id: p.id,
          author: p.author ? p.author.full_name : '',
          visibility: p.visibility,
          content_preview: (p.content || '').substring(0, 140),
          likes_count: p.likes_count,
          comments_count: p.comments_count,
          created_at: p.created_at
        };
      })
    };

    if (customFilter === 'profile_only') {
      return {
        platform: payload.platform,
        exported_at: payload.exported_at,
        profile: payload.profile
      };
    }
    if (customFilter === 'preferences_only') {
      return {
        platform: payload.platform,
        exported_at: payload.exported_at,
        preferences: payload.profile ? payload.profile.preferences : {}
      };
    }
    return payload;
  }

  window.UgnayraStore = {
    getState: getState,
    setState: setState,
    subscribe: subscribe,
    clearAuth: clearAuth,
    buildPortableJsonSnapshot: buildPortableJsonSnapshot
  };
})(window);
