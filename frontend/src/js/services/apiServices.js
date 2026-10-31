/**
 * UGNAYRA — Domain API Service Layer
 * Clean modular wrappers over UgnayraApiClient returning JSON promises.
 */
(function (window) {
  'use strict';

  var api = window.UgnayraApiClient;
  var catalogPromiseCache = null;

  window.UgnayraServices = {
    Academics: {
      catalog: function () {
        if (!catalogPromiseCache) {
          catalogPromiseCache = api.get('/academics/catalog', null, { ignoreAuthRedirect: true })
            .catch(function (err) {
              catalogPromiseCache = null;
              throw err;
            });
        }
        return catalogPromiseCache;
      }
    },

    Auth: {
      me: function () { return api.get('/auth/me', null, { ignoreAuthRedirect: true }); },
      csrf: function () { return api.get('/auth/csrf', null, { ignoreAuthRedirect: true }); },
      providers: function () { return api.get('/auth/providers', null, { ignoreAuthRedirect: true }); },
      login: function (payload) { return api.post('/auth/login', payload, { ignoreAuthRedirect: true }); },
      register: function (payload) { return api.post('/auth/register', payload, { ignoreAuthRedirect: true }); },
      googleAuth: function (payload) { return api.post('/auth/google', payload, { ignoreAuthRedirect: true }); },
      googleComplete: function (payload) { return api.post('/auth/google/complete', payload, { ignoreAuthRedirect: true }); },
      logout: function () { return api.post('/auth/logout', {}); }
    },

    Profiles: {
      list: function (params) { return api.get('/profiles', params); },
      get: function (idOrUsername) { return api.get('/profiles/' + encodeURIComponent(idOrUsername)); },
      updateMe: function (payload) { return api.patch('/profiles/me', payload); },
      uploadAvatar: function (file) {
        var fd = new FormData();
        fd.append('avatar', file);
        return api.upload('/profiles/me/avatar', fd);
      },
      uploadCover: function (file) {
        var fd = new FormData();
        fd.append('cover', file);
        return api.upload('/profiles/me/cover', fd);
      },
      posts: function (idOrUsername, params) {
        return api.get('/profiles/' + encodeURIComponent(idOrUsername) + '/posts', params);
      }
    },

    Posts: {
      list: function (params) { return api.get('/posts', params); },
      get: function (id) { return api.get('/posts/' + encodeURIComponent(id)); },
      create: function (formDataOrJson) {
        if (typeof FormData !== 'undefined' && formDataOrJson instanceof FormData) {
          return api.upload('/posts', formDataOrJson);
        }
        return api.post('/posts', formDataOrJson);
      },
      update: function (id, payload) { return api.patch('/posts/' + encodeURIComponent(id), payload); },
      remove: function (id) { return api.delete('/posts/' + encodeURIComponent(id)); },
      like: function (id) { return api.post('/posts/' + encodeURIComponent(id) + '/like', {}); },
      unlike: function (id) { return api.delete('/posts/' + encodeURIComponent(id) + '/like'); },
      share: function (id, payload) { return api.post('/posts/' + encodeURIComponent(id) + '/share', payload || {}); },
      listComments: function (postId, params) { return api.get('/posts/' + encodeURIComponent(postId) + '/comments', params); },
      addComment: function (postId, payload) { return api.post('/posts/' + encodeURIComponent(postId) + '/comments', payload); },
      deleteComment: function (commentId) { return api.delete('/comments/' + encodeURIComponent(commentId)); }
    },

    Messages: {
      listConversations: function () { return api.get('/conversations'); },
      openDirect: function (recipientId) { return api.post('/conversations', { recipient_id: recipientId }); },
      listMessages: function (conversationId, params) {
        return api.get('/conversations/' + encodeURIComponent(conversationId) + '/messages', params);
      },
      send: function (conversationId, payloadOrFormData) {
        var path = '/conversations/' + encodeURIComponent(conversationId) + '/messages';
        if (typeof FormData !== 'undefined' && payloadOrFormData instanceof FormData) {
          return api.upload(path, payloadOrFormData);
        }
        return api.post(path, payloadOrFormData);
      },
      markRead: function (conversationId) {
        return api.post('/conversations/' + encodeURIComponent(conversationId) + '/read', {});
      },
      sendTyping: function (conversationId) {
        return api.post('/conversations/' + encodeURIComponent(conversationId) + '/typing', {});
      }
    },

    Communities: {
      list: function (params) { return api.get('/communities', params); },
      create: function (payload) { return api.post('/communities', payload); },
      get: function (idOrSlug) { return api.get('/communities/' + encodeURIComponent(idOrSlug)); },
      update: function (id, payload) { return api.patch('/communities/' + encodeURIComponent(id), payload); },
      join: function (id) { return api.post('/communities/' + encodeURIComponent(id) + '/join', {}); },
      leave: function (id) { return api.delete('/communities/' + encodeURIComponent(id) + '/leave'); },
      members: function (id, params) { return api.get('/communities/' + encodeURIComponent(id) + '/members', params); },
      posts: function (id, params) { return api.get('/communities/' + encodeURIComponent(id) + '/posts', params); },
      createPost: function (id, formDataOrJson) {
        var path = '/communities/' + encodeURIComponent(id) + '/posts';
        if (typeof FormData !== 'undefined' && formDataOrJson instanceof FormData) {
          return api.upload(path, formDataOrJson);
        }
        return api.post(path, formDataOrJson);
      }
    },

    Announcements: {
      list: function (params) { return api.get('/announcements', params); },
      create: function (payload) { return api.post('/announcements', payload); },
      update: function (id, payload) { return api.patch('/announcements/' + encodeURIComponent(id), payload); },
      remove: function (id) { return api.delete('/announcements/' + encodeURIComponent(id)); }
    },

    Notifications: {
      list: function (params) { return api.get('/notifications', params); },
      markRead: function (id) { return api.post('/notifications/' + encodeURIComponent(id) + '/read', {}); },
      markAllRead: function () { return api.post('/notifications/read-all', {}); }
    },

    Search: {
      query: function (params) { return api.get('/search', params); }
    },

    Presence: {
      heartbeat: function () { return api.post('/presence/heartbeat', {}, { ignoreAuthRedirect: true }); }
    },

    // Future-Ready WebRTC Signaling Seam (Isolated per Section 6.I)
    Rtc: {
      createSession: function (conversationId) { return api.post('/rtc/sessions', { conversation_id: conversationId }); },
      sendSignal: function (sessionId, type, payload) {
        return api.post('/rtc/sessions/' + encodeURIComponent(sessionId) + '/signal', {
          signal_type: type,
          payload: payload
        });
      },
      pollSignals: function (sessionId, afterIso) {
        return api.get('/rtc/sessions/' + encodeURIComponent(sessionId) + '/signal', { after: afterIso || '' });
      }
    }
  };
})(window);
