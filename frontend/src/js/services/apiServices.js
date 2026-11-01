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
      },
      yearLevels: function (program) {
        return api.get('/academics/year-levels', { program: program || '' }, { ignoreAuthRedirect: true });
      },
      sections: function (program, yearLevel, termId) {
        return api.get('/academics/sections', {
          program: program,
          year_level: yearLevel,
          term_id: termId || ''
        }, { ignoreAuthRedirect: true });
      },
      resolveDesignation: function (program, yearLevel, section, batch) {
        return api.post('/academics/designation/resolve', {
          program: program,
          year_level: yearLevel,
          section: section,
          batch: batch || null
        }, { ignoreAuthRedirect: true });
      }
    },

    Classrooms: {
      list: function () {
        return api.get('/classrooms');
      },
      create: function (data) {
        return api.post('/classrooms', data);
      },
      get: function (id) {
        return api.get('/classrooms/' + encodeURIComponent(id));
      },
      join: function (joinCode, batch) {
        return api.post('/classrooms/join', {
          join_code: joinCode,
          batch: batch || null
        });
      },
      people: function (id) {
        return api.get('/classrooms/' + encodeURIComponent(id) + '/people');
      },
      members: function (id) {
        return api.get('/classrooms/' + encodeURIComponent(id) + '/people');
      },
      stream: function (id) {
        return api.get('/classrooms/' + encodeURIComponent(id) + '/stream');
      },
      postAnnouncement: function (id, contentOrFormData, attachments) {
        if (contentOrFormData instanceof FormData) {
          return api.upload('/classrooms/' + encodeURIComponent(id) + '/stream', contentOrFormData);
        }
        return api.post('/classrooms/' + encodeURIComponent(id) + '/stream', {
          content: contentOrFormData,
          attachments: attachments || []
        });
      },
      studentGrades: function (id) {
        return api.get('/classrooms/' + encodeURIComponent(id) + '/assignments');
      },
      gradeMatrix: function (id) {
        return api.get('/classrooms/' + encodeURIComponent(id) + '/people');
      }
    },

    Assignments: {
      list: function (classroomId) {
        return api.get('/classrooms/' + encodeURIComponent(classroomId) + '/assignments');
      },
      create: function (classroomId, data) {
        if (data instanceof FormData) {
          return api.upload('/classrooms/' + encodeURIComponent(classroomId) + '/assignments', data);
        }
        return api.post('/classrooms/' + encodeURIComponent(classroomId) + '/assignments', data);
      },
      get: function (id) {
        return api.get('/assignments/' + encodeURIComponent(id));
      },
      getComments: function () {
        return Promise.resolve({ data: { comments: [] } });
      },
      postComment: function () {
        return Promise.resolve({ data: {} });
      }
    },

    Submissions: {
      submit: function (assignmentId, formData) {
        return api.upload('/assignments/' + encodeURIComponent(assignmentId) + '/submit', formData);
      },
      getMy: function (assignmentId) {
        return api.get('/assignments/' + encodeURIComponent(assignmentId)).then(function (res) {
          var a = (res && res.data && res.data.assignment) || res.data || {};
          return {
            data: {
              submission: a.my_submission || null,
              versions: (a.my_submission && a.my_submission.versions) || []
            }
          };
        });
      },
      unsubmit: function () {
        return Promise.resolve({ data: {} });
      },
      list: function (assignmentId) {
        return api.get('/assignments/' + encodeURIComponent(assignmentId) + '/submissions');
      },
      grade: function (submissionId, scoreOrData, feedback) {
        var body = typeof scoreOrData === 'object'
          ? scoreOrData
          : { score: scoreOrData, feedback: feedback || '' };
        return api.post('/submissions/' + encodeURIComponent(submissionId) + '/grade', body);
      }
    },

    Schedules: {
      list: function (classroomId) {
        return api.get('/classrooms/' + encodeURIComponent(classroomId) + '/schedules');
      },
      save: function (classroomId, data) {
        return api.post('/classrooms/' + encodeURIComponent(classroomId) + '/schedules', data);
      },
      create: function (data) {
        var cid = data.classroom_id;
        return api.post('/classrooms/' + encodeURIComponent(cid) + '/schedules', data);
      },
      activeSession: function (classroomId) {
        return api.get('/classrooms/' + encodeURIComponent(classroomId) + '/sessions/active');
      },
      active: function (classroomId) {
        return api.get('/classrooms/' + encodeURIComponent(classroomId) + '/sessions/active');
      },
      startInstantMeeting: function (classroomId, title) {
        return api.post('/classrooms/' + encodeURIComponent(classroomId) + '/meetings/instant', {
          title: title || 'Live Class Session'
        });
      },
      startInstant: function (classroomId, title) {
        return api.post('/classrooms/' + encodeURIComponent(classroomId) + '/meetings/instant', {
          title: title || 'Live Class Session'
        });
      },
      endMeeting: function (sessionId) {
        return api.post('/class-sessions/' + encodeURIComponent(sessionId) + '/end', {});
      },
      cancelSession: function (sessionId, reason) {
        return api.post('/class-sessions/' + encodeURIComponent(sessionId) + '/cancel', {
          reason: reason || 'Instructor unavailable'
        });
      },
      reschedule: function (data) {
        return api.post('/class-sessions/reschedule', data);
      },
      validateMeeting: function (meetingCode) {
        return api.get('/meetings/' + encodeURIComponent(meetingCode) + '/validate');
      }
    },

    Groups: {
      list: function (type) {
        return api.get('/groups', { type: type || '' });
      },
      create: function (data) {
        return api.post('/groups', data);
      },
      get: function (id) {
        return api.get('/groups/' + encodeURIComponent(id));
      },
      joinPreview: function (token) {
        return api.get('/groups/join-preview', { token: token });
      },
      join: function (token, note) {
        return api.post('/groups/join', { token: token, note: note || '' });
      },
      addMembers: function (id, data) {
        return api.post('/groups/' + encodeURIComponent(id) + '/members', data);
      },
      getInviteLink: function (id) {
        return api.get('/groups/' + encodeURIComponent(id));
      },
      updateAccess: function (id, data) {
        return api.post('/groups/' + encodeURIComponent(id) + '/access', data);
      }
    },

    Directory: {
      list: function (params) {
        return api.get('/directory/students', params || {});
      },
      students: function (params) {
        return api.get('/directory/students', params || {});
      }
    },

    Dashboard: {
      overview: function () {
        return api.get('/dashboard/overview');
      },
      getSummary: function () {
        return api.get('/dashboard/overview');
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

    Rtc: {
      createSession: function (targetOrConvId, callType) {
        return api.post('/rtc/sessions', {
          conversation_id: targetOrConvId,
          target_user_id: targetOrConvId,
          call_type: callType || 'audio'
        });
      },
      sendSignal: function (sessionId, type, payload) {
        return api.post('/rtc/sessions/' + encodeURIComponent(sessionId) + '/signal', {
          signal_type: type,
          payload: payload
        });
      },
      pollSignals: function (sessionId, afterIso) {
        return api.get('/rtc/sessions/' + encodeURIComponent(sessionId) + '/signal', { after: afterIso || '' });
      }
    },

    Meta: {
      linkPreview: function (url) {
        return api.get('/meta/link-preview', { url: url });
      }
    }
  };
})(window);
