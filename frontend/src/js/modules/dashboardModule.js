/**
 * UGNAYRA — Academic Cockpit Module (Role-Tailored Command Center)
 * Live 15-Minute Broadcast Pulse, Quick Actions, Upcoming Deadlines,
 * Class Schedules & Performance Metrics for Students & Faculty.
 */
(function (window, $) {
  'use strict';

  var Services = window.UgnayraServices;
  var Store = window.UgnayraStore;
  var UI = window.UgnayraUI;
  var Templates = window.UgnayraTemplates;
  var escapeHtml = window.UgnayraEscape ? window.UgnayraEscape.escapeHtml : function (s) { return s || ''; };

  function isTeacherOrFaculty() {
    var user = Store.getState().user || {};
    var role = String(user.role || '').toLowerCase();
    return role === 'teacher' || role === 'faculty' || role === 'personnel' || role === 'admin';
  }

  function mountCockpit() {
    return Templates.renderInto('#main-stage', Templates.VIEWS.COCKPIT).then(function () {
      var user = Store.getState().user || {};
      var isFaculty = isTeacherOrFaculty();

      // Hydrate User Profile Meta
      var fullName = user.full_name || 'Campus Member';
      $('#cockpit-user-avatar').text(fullName.charAt(0).toUpperCase());
      $('#cockpit-welcome-heading').text('Welcome back, ' + fullName.split(' ')[0] + '!');
      $('#cockpit-role-badge').text(isFaculty ? 'Faculty / Instructor' : 'Enrolled Student');

      var designation = user.academic_designation || (user.department ? (user.department + ' ' + (user.section || '')) : 'BulSU Campus');
      $('#cockpit-designation-chip').text(designation);

      // Customize Stat Card Labels by Role
      if (isFaculty) {
        $('#stat-lbl-1').text('Classes Taught');
        $('#stat-sub-1').text('Active courses');
        $('#stat-lbl-2').text('To Grade');
        $('#stat-sub-2').text('Pending submissions');
        $('#stat-lbl-3').text('Students');
        $('#stat-sub-3').text('Total enrolled');
        $('#stat-lbl-4').text('Live Lectures');
        $('#stat-sub-4').text('Scheduled today');
      }

      loadCockpitData();
      bindCockpitEvents();
    });
  }

  function loadCockpitData() {
    Services.Dashboard.getSummary()
      .then(function (res) {
        var data = (res && res.data) || {};

        // 1. Metric Counts
        $('#stat-val-1').text(data.classes_count || 0);
        $('#stat-val-2').text(data.pending_tasks_count || 0);
        $('#stat-val-3').text(data.completed_tasks_count || 0);
        $('#stat-val-4').text(data.live_sessions_today || 0);

        // 2. Dynamic Live Class Pulse Alert (Starts <= 15 minutes)
        var activeSession = data.active_session || null;
        var $alert = $('#cockpit-live-alert');

        if (activeSession && (activeSession.is_live || activeSession.status === 'in_progress' || (activeSession.minutes_until_start !== undefined && activeSession.minutes_until_start <= 15))) {
          $alert.removeClass('hidden');
          var title = escapeHtml(activeSession.title || 'Interactive Class Meeting');
          var code = escapeHtml(activeSession.meeting_code || '');

          if (activeSession.is_live || activeSession.status === 'in_progress') {
            $('#cockpit-alert-tag').text('LIVE CLASS NOW IN SESSION');
            $('#cockpit-alert-meta').text('Room: ' + code + ' \u2022 Joined by classmates');
          } else {
            var mins = activeSession.minutes_until_start || 10;
            $('#cockpit-alert-tag').text('ONLINE CLASS STARTS IN ' + mins + ' MINS');
            $('#cockpit-alert-meta').text('Room: ' + code + ' \u2022 Get ready to connect');
          }

          $('#cockpit-alert-title').text(title);
          $('#cockpit-btn-join-meeting').attr('data-meeting-code', code);
        } else {
          $alert.addClass('hidden');
        }

        // 3. Active Classrooms Cards
        renderCockpitClasses(data.classrooms || []);

        // 4. Deadlines List
        renderCockpitDeadlines(data.upcoming_deadlines || []);

        // 5. Today's Sessions
        renderCockpitSessions(data.today_sessions || []);
      })
      .catch(function () {
        // Fallback for clean initial state
        $('#cockpit-classes-container').html('<p class="text-xs text-muted col-span-2">No classrooms joined yet.</p>');
      });
  }

  function renderCockpitClasses(classes) {
    var $container = $('#cockpit-classes-container');
    if (!classes || classes.length === 0) {
      $container.html(
        '<div class="card p-4 text-center text-muted col-span-2">' +
          '<i data-lucide="graduation-cap" class="icon-md mb-2 text-secondary" style="margin: 0 auto;"></i>' +
          '<p class="text-sm">You are not enrolled in any classrooms yet.</p>' +
          '<a href="/classroom" class="btn btn-secondary btn-sm mt-3">Browse Classrooms</a>' +
        '</div>'
      );
      UI.refreshIcons($container[0]);
      return;
    }

    var html = classes.slice(0, 4).map(function (c) {
      var code = escapeHtml(c.subject_code || 'COURSE');
      var name = escapeHtml(c.name || 'Subject');
      var sec = escapeHtml(c.section || '');
      var id = escapeHtml(c.id);

      return (
        '<a href="/classroom/' + id + '" class="card p-3 classroom-tile-link block hover:shadow-md transition">' +
          '<div class="flex items-center justify-between mb-2">' +
            '<span class="classroom-subject-chip text-xs">' + code + '</span>' +
            '<span class="text-xs text-muted font-semibold">' + sec + '</span>' +
          '</div>' +
          '<h4 class="font-semibold text-sm line-clamp-1 mb-2">' + name + '</h4>' +
          '<div class="text-xs text-primary flex items-center gap-1 font-semibold">' +
            '<span>Open Room</span>' +
            '<i data-lucide="chevron-right" class="icon-xs"></i>' +
          '</div>' +
        '</a>'
      );
    }).join('');

    $container.html(html);
    UI.refreshIcons($container[0]);
  }

  function renderCockpitDeadlines(deadlines) {
    var $list = $('#cockpit-deadlines-list');
    if (!deadlines || deadlines.length === 0) {
      $list.html('<p class="text-xs text-muted">No pending assignments due this week.</p>');
      return;
    }

    var html = deadlines.map(function (d) {
      var title = escapeHtml(d.title || 'Assignment');
      var due = d.due_at ? new Date(d.due_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Due soon';
      return (
        '<a href="/assignment/' + d.id + '" class="block mb-2 pb-2 border-bottom hover:underline">' +
          '<div class="font-semibold text-xs">' + title + '</div>' +
          '<div class="text-xs text-gold font-medium mt-1">' + due + '</div>' +
        '</a>'
      );
    }).join('');

    $list.html(html);
  }

  function renderCockpitSessions(sessions) {
    var $list = $('#cockpit-sessions-list');
    if (!sessions || sessions.length === 0) {
      $list.html('<p class="text-xs text-muted">No live classes scheduled for today.</p>');
      return;
    }

    var html = sessions.map(function (s) {
      var title = escapeHtml(s.title || 'Live Lecture');
      var time = s.scheduled_start ? new Date(s.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBA';
      return (
        '<div class="mb-2 pb-2 border-bottom flex items-center justify-between">' +
          '<div>' +
            '<div class="font-semibold text-xs">' + title + '</div>' +
            '<div class="text-xs text-muted">' + time + '</div>' +
          '</div>' +
          '<a href="/meeting/' + s.meeting_code + '" class="btn btn-primary btn-sm">' +
            '<span>Join</span>' +
          '</a>' +
        '</div>'
      );
    }).join('');

    $list.html(html);
  }

  function bindCockpitEvents() {
    $(document).off('click', '#cockpit-btn-join-meeting').on('click', '#cockpit-btn-join-meeting', function () {
      var code = $(this).attr('data-meeting-code');
      if (code && window.UgnayraApp) {
        window.UgnayraApp.navigate('/meeting/' + code);
      }
    });
  }

  window.UgnayraCockpit = {
    mount: mountCockpit
  };
})(window, window.jQuery);
