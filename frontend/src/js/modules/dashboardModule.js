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

        var enrolledList = data.enrolled_classes || data.classes || [];
        var pendingList = data.pending_assignments || data.pending_grading || [];
        var sessionsList = data.upcoming_sessions || data.today_sessions || [];
        var completedList = data.completed_tasks || [];

        // 1. Metric Counts with accurate fallbacks from API arrays
        $('#stat-val-1').text(data.classes_count !== undefined ? data.classes_count : enrolledList.length);
        $('#stat-val-2').text(data.pending_tasks_count !== undefined ? data.pending_tasks_count : pendingList.length);
        $('#stat-val-3').text(data.completed_tasks_count !== undefined ? data.completed_tasks_count : completedList.length);
        $('#stat-val-4').text(data.live_sessions_today !== undefined ? data.live_sessions_today : sessionsList.length);

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
        renderCockpitClasses(enrolledList);

        // 4. Deadlines List
        renderCockpitDeadlines(pendingList);

        // 5. Today's Sessions
        renderCockpitSessions(sessionsList);

        // 6. Real-time Campus Announcements
        loadCockpitAnnouncements();
      })
      .catch(function () {
        // Fallback for clean initial state
        renderCockpitClasses([]);
        renderCockpitDeadlines([]);
        renderCockpitSessions([]);
        loadCockpitAnnouncements();
      });
  }

  function loadCockpitAnnouncements() {
    var $box = $('#cockpit-announcements-container');
    if (!$box.length) return;

    Services.Announcements.list({ limit: 3 })
      .then(function (res) {
        var items = (res && res.data && res.data.announcements) || [];
        if (!items.length) {
          $box.html(
            UI.renderEmptyState({
              icon: 'announcements',
              title: 'No Active Campus Advisories',
              description: 'All quiet across BulSU campuses. Official University bulletins and academic advisories will appear here once published.',
              ctaHtml: '<a href="/announcements" class="btn btn-secondary btn-sm"><i data-lucide="archive"></i><span>View Past Bulletins</span></a>',
              variant: 'compact',
              apiBadge: 'Campus Bulletin Stream'
            })
          );
          UI.refreshIcons($box[0]);
          return;
        }

        var html = items.map(function (item) {
          var title = escapeHtml(item.title || 'Official Campus Bulletin');
          var content = escapeHtml(item.content || item.summary || '');
          var date = item.created_at ? new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
          var priority = (item.priority || 'NORMAL').toLowerCase();
          var priorityClass = priority === 'urgent' ? 'priority-urgent' : (priority === 'important' ? 'priority-important' : '');
          var priorityLabel = priority === 'urgent' ? 'Urgent Alert' : (priority === 'important' ? 'Priority' : 'Notice');

          return (
            '<a href="/announcements" class="cockpit-bulletin-card ' + priorityClass + '">' +
              '<div class="cockpit-bulletin-meta">' +
                '<span class="badge badge-secondary text-xs">' + priorityLabel + '</span>' +
                '<span class="text-xs text-muted">' + date + '</span>' +
              '</div>' +
              '<h4 class="cockpit-bulletin-title">' + title + '</h4>' +
              '<p class="cockpit-bulletin-snippet">' + content + '</p>' +
            '</a>'
          );
        }).join('');

        $box.html(html);
        UI.refreshIcons($box[0]);
      })
      .catch(function () {
        $box.html(
          UI.renderCompactEmptyState({
            icon: 'bell',
            title: 'Campus Advisories Synced',
            description: 'No new urgent bulletins posted today.'
          })
        );
        UI.refreshIcons($box[0]);
      });
  }

  function renderCockpitClasses(classes) {
    var $container = $('#cockpit-classes-container');
    if (!classes || classes.length === 0) {
      $container.html(
        UI.renderEmptyState({
          icon: 'classroom',
          title: 'No Classrooms Joined Yet',
          description: 'Enroll in your academic subjects using an instructor code to access syllabus streams, coursework, and live video sessions.',
          ctaHtml: '<a href="/classroom" class="btn btn-primary btn-sm"><i data-lucide="key-round"></i><span>Join Class with Code</span></a>',
          secondaryCtaHtml: '<a href="/classroom" class="btn btn-secondary btn-sm"><i data-lucide="graduation-cap"></i><span>Browse Classrooms</span></a>',
          tip: 'Ask your professor or instructor for the 7-character join code.',
          apiBadge: 'BulSU Academic Cloud'
        })
      );
      UI.refreshIcons($container[0]);
      return;
    }

    var html = classes.slice(0, 4).map(function (c) {
      var code = escapeHtml(c.subject_code || 'COURSE');
      var name = escapeHtml(c.name || c.subject_title || 'Subject');
      var sec = escapeHtml(c.section || c.section_designation || '');
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
      $list.html(
        UI.renderCompactEmptyState({
          icon: 'deadlines',
          title: 'All Caught Up!',
          description: 'No pending assignments due this week. Excellent work!',
          apiBadge: 'Zero Pending Tasks'
        })
      );
      UI.refreshIcons($list[0]);
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
      $list.html(
        UI.renderCompactEmptyState({
          icon: 'calendar',
          title: 'Schedule Clear Today',
          description: 'No live class meetings or video sessions scheduled for today.',
          apiBadge: 'No Active Sessions'
        })
      );
      UI.refreshIcons($list[0]);
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
