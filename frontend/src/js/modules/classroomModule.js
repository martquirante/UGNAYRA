/**
 * UGNAYRA — Classroom Module (Controller for classroom-list.html & classroom-detail.html)
 * Manages Course Workspaces, 4 Canonical Tabs (Stream, Classwork, People, Grades),
 * Live Meeting 15-Minute Countdown Detection & Roster Rendering.
 */
(function (window, $) {
  'use strict';

  var Services = window.UgnayraServices;
  var Store = window.UgnayraStore;
  var UI = window.UgnayraUI;
  var Templates = window.UgnayraTemplates;
  var escapeHtml = window.UgnayraEscape ? window.UgnayraEscape.escapeHtml : function (s) { return s || ''; };

  var currentClassroomId = null;
  var currentClassroomData = null;
  var activeTab = 'stream';
  var schedulePollingTimer = null;
  var cachedClassrooms = [];
  var currentFilter = 'all';

  function isTeacherOrFaculty() {
    var user = Store.getState().user || {};
    var role = String(user.role || '').toLowerCase();
    return role === 'teacher' || role === 'faculty' || role === 'personnel' || role === 'admin';
  }

  // --------------------------------------------------------------------------
  // 1. CLASSROOM LIST VIEW
  // --------------------------------------------------------------------------

  function mountClassroomList() {
    return Templates.renderInto('#main-stage', Templates.VIEWS.CLASSROOM_LIST).then(function () {
      if (isTeacherOrFaculty()) {
        $('.js-teacher-only').removeClass('hidden');
      }

      loadClassroomsList('all');
      bindListEvents();
    });
  }

  function filterAndRenderClassrooms() {
    var query = ($('#classroom-search-input').val() || '').trim().toLowerCase();
    var filtered = cachedClassrooms.slice();

    if (currentFilter === 'teaching') {
      var currUserId = (Store.getState().user || {}).id;
      filtered = filtered.filter(function (c) { return c.created_by === currUserId || c.teacher_id === currUserId; });
    } else if (currentFilter === 'archived') {
      filtered = filtered.filter(function (c) { return c.is_archived === true; });
    } else if (currentFilter === 'enrolled') {
      filtered = filtered.filter(function (c) { return !c.is_archived; });
    }

    if (query) {
      filtered = filtered.filter(function (c) {
        var code = (c.subject_code || '').toLowerCase();
        var name = (c.name || c.subject_title || '').toLowerCase();
        var teacher = ((c.teacher && c.teacher.full_name) || c.instructor_name || '').toLowerCase();
        var sec = (c.section || c.section_designation || '').toLowerCase();
        return code.indexOf(query) !== -1 || name.indexOf(query) !== -1 || teacher.indexOf(query) !== -1 || sec.indexOf(query) !== -1;
      });
    }

    renderClassroomCards(filtered, query);
  }

  function loadClassroomsList(filter) {
    if (filter !== undefined) {
      currentFilter = filter;
    }
    var $grid = $('#classroom-cards-grid');
    $grid.html('<div class="card-skeleton" style="height: 180px;"></div><div class="card-skeleton" style="height: 180px;"></div>');

    Services.Classrooms.list()
      .then(function (res) {
        cachedClassrooms = (res && res.data && (res.data.classrooms || res.data.items || (Array.isArray(res.data) ? res.data : []))) || [];
        filterAndRenderClassrooms();
      })
      .catch(function (err) {
        $grid.html(
          UI.renderEmptyState({
            icon: 'alert-circle',
            title: 'Unable to Sync Classrooms',
            description: escapeHtml(err.message || 'There was an issue contacting the BulSU classroom servers. Please check your network connection and retry.'),
            ctaHtml: '<button type="button" class="btn btn-secondary js-retry-classrooms"><i data-lucide="refresh-cw"></i><span>Try Again</span></button>',
            apiBadge: 'Connection Offline'
          })
        );
        UI.refreshIcons($grid[0]);
      });
  }

  function renderClassroomCards(list, searchQuery) {
    var $grid = $('#classroom-cards-grid');
    if (!list || list.length === 0) {
      var isTeacher = isTeacherOrFaculty();

      if (searchQuery) {
        $grid.html(
          UI.renderEmptyState({
            icon: 'search',
            title: 'No Classrooms Found',
            description: 'We couldn\'t find any courses matching "' + escapeHtml(searchQuery) + '". Try searching by subject code (e.g. IT 305W), course title, or instructor name.',
            ctaHtml: '<button type="button" class="btn btn-secondary js-clear-classroom-search"><i data-lucide="x"></i><span>Clear Search</span></button>',
            apiBadge: 'Search Query: ' + searchQuery
          })
        );
      } else if (currentFilter === 'archived') {
        $grid.html(
          UI.renderEmptyState({
            icon: 'classroom',
            title: 'No Archived Classrooms',
            description: 'You do not have any archived course spaces from previous academic semesters on file.',
            ctaHtml: '<button type="button" class="btn btn-secondary js-view-all-classes"><i data-lucide="arrow-left"></i><span>View Active Classes</span></button>',
            apiBadge: 'BulSU Academic Cloud'
          })
        );
      } else if (currentFilter === 'teaching') {
        $grid.html(
          UI.renderEmptyState({
            icon: 'classroom',
            title: 'No Teaching Classrooms Yet',
            description: 'You have not created any course spaces yet. Create a course room to generate a 7-character invite code and manage syllabus streams and assignments.',
            ctaHtml: '<button type="button" class="btn btn-primary js-trigger-create-class"><i data-lucide="plus"></i><span>Create Classroom</span></button>',
            apiBadge: 'Faculty Academic Portal'
          })
        );
      } else {
        $grid.html(
          UI.renderEmptyState({
            icon: 'classroom',
            title: 'Your Academic Course Hub is Ready',
            description: 'You have not joined or created any course classrooms yet for this semester. Enter your instructor\'s 7-character course code to access syllabus streams, classwork submissions, and live video sessions.',
            ctaHtml: '<button type="button" class="btn btn-primary" id="card-empty-join-btn"><i data-lucide="key-round"></i><span>Join Class with Code</span></button>',
            secondaryCtaHtml: isTeacher ? '<button type="button" class="btn btn-secondary js-trigger-create-class"><i data-lucide="plus"></i><span>Create Class</span></button>' : '',
            tip: 'Ask your professor or subject instructor for the 7-character join code (e.g. UG-7X9B2).',
            apiBadge: 'BulSU API \u2022 0 Enrolled Courses'
          })
        );
      }
      UI.refreshIcons($grid[0]);
      return;
    }

    var html = list.map(function (c) {
      var subjectCode = escapeHtml(c.subject_code || 'COURSE');
      var name = escapeHtml(c.name || c.subject_title || 'Untitled Subject');
      var section = escapeHtml(c.section || c.section_designation || 'All Sections');
      var teacherName = escapeHtml((c.teacher && c.teacher.full_name) || c.instructor_name || 'Faculty Instructor');
      var initial = teacherName.charAt(0).toUpperCase();
      var id = escapeHtml(c.id);

      return (
        '<div class="card classroom-card-tile" data-classroom-id="' + id + '">' +
          '<div class="classroom-tile-header">' +
            '<div class="tile-header-tags">' +
              '<span class="classroom-subject-chip">' + subjectCode + '</span>' +
              '<span class="classroom-section-chip">' + section + '</span>' +
            '</div>' +
            '<h3 class="classroom-tile-title">' + name + '</h3>' +
          '</div>' +
          '<div class="classroom-tile-body">' +
            '<div class="tile-teacher-row">' +
              '<div class="avatar-sm font-semibold">' + initial + '</div>' +
              '<span class="text-sm text-secondary">' + teacherName + '</span>' +
            '</div>' +
            '<div class="tile-meta-row mt-3">' +
              '<a href="/classroom/' + id + '" class="btn btn-primary btn-sm w-full js-open-classroom" data-id="' + id + '">' +
                '<span>Enter Classroom</span>' +
                '<i data-lucide="arrow-right" class="icon-xs"></i>' +
              '</a>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    $grid.html(html);
    UI.refreshIcons($grid[0]);
  }

  function bindListEvents() {
    $(document).off('click', '.js-classroom-filter').on('click', '.js-classroom-filter', function () {
      $('.js-classroom-filter').removeClass('is-active');
      $(this).addClass('is-active');
      var filter = $(this).attr('data-filter') || 'all';
      loadClassroomsList(filter);
    });

    $(document).off('input', '#classroom-search-input').on('input', '#classroom-search-input', function () {
      filterAndRenderClassrooms();
    });

    $(document).off('click', '.js-clear-classroom-search').on('click', '.js-clear-classroom-search', function () {
      $('#classroom-search-input').val('');
      filterAndRenderClassrooms();
    });

    $(document).off('click', '.js-view-all-classes').on('click', '.js-view-all-classes', function () {
      $('.js-classroom-filter').removeClass('is-active');
      $('.js-classroom-filter[data-filter="all"]').addClass('is-active');
      loadClassroomsList('all');
    });

    $(document).off('click', '.js-retry-classrooms').on('click', '.js-retry-classrooms', function () {
      loadClassroomsList(currentFilter);
    });

    $(document).off('click', '#open-create-class-modal-btn, .js-trigger-create-class').on('click', '#open-create-class-modal-btn, .js-trigger-create-class', function () {
      $('#create-classroom-modal').removeClass('hidden');
      $('#new-class-name').val('').focus();
    });

    $(document).off('click', '#open-join-class-modal-btn, #card-empty-join-btn').on('click', '#open-join-class-modal-btn, #card-empty-join-btn', function () {
      $('#join-classroom-modal').removeClass('hidden');
      $('#join-class-code').val('').focus();
    });

    $(document).off('click', '.js-close-join-modal').on('click', '.js-close-join-modal', function () {
      $('#join-classroom-modal').addClass('hidden');
    });

    $(document).off('submit', '#join-classroom-form').on('submit', '#join-classroom-form', function (e) {
      e.preventDefault();
      var code = ($('#join-class-code').val() || '').trim().toUpperCase();
      if (!code) return;

      var $btn = $('#join-class-submit-btn');
      UI.setButtonLoading($btn, true, 'Joining...');

      Services.Classrooms.join(code)
        .then(function (res) {
          UI.toast('Successfully enrolled in classroom!', 'success');
          $('#join-classroom-modal').addClass('hidden');
          var classId = res.data && res.data.classroom && res.data.classroom.id;
          if (classId && window.UgnayraApp) {
            window.UgnayraApp.navigate('/classroom/' + classId);
          } else {
            loadClassroomsList('all');
          }
        })
        .catch(function (err) {
          UI.toast(err.message || 'Invalid or expired classroom code.', 'error');
        })
        .finally(function () {
          UI.setButtonLoading($btn, false);
        });
    });

    $(document).off('click', '#open-create-class-modal-btn').on('click', '#open-create-class-modal-btn', function () {
      $('#create-classroom-modal').removeClass('hidden');
      $('#new-class-name').val('').focus();
    });

    $(document).off('click', '.js-close-create-modal').on('click', '.js-close-create-modal', function () {
      $('#create-classroom-modal').addClass('hidden');
    });

    $(document).off('submit', '#create-classroom-form').on('submit', '#create-classroom-form', function (e) {
      e.preventDefault();
      var name = ($('#new-class-name').val() || '').trim();
      var code = ($('#new-class-code').val() || '').trim();
      var section = ($('#new-class-section').val() || '').trim();
      var room = ($('#new-class-room').val() || '').trim();
      var batches = parseInt($('#new-class-lab-batches').val() || '0', 10);
      var desc = ($('#new-class-desc').val() || '').trim();

      if (!name || !code || !section) {
        UI.toast('Please provide course name, code, and section.', 'error');
        return;
      }

      var $btn = $('#create-class-submit-btn');
      UI.setButtonLoading($btn, true, 'Creating...');

      Services.Classrooms.create({
        name: name,
        subject_title: name,
        subject_code: code,
        section: section,
        section_designation: section,
        room: room,
        default_lab_batches: batches,
        description: desc
      })
        .then(function (res) {
          UI.toast('Classroom created successfully!', 'success');
          $('#create-classroom-modal').addClass('hidden');
          var classId = res.data && ((res.data.classroom && res.data.classroom.id) || res.data.id);
          if (classId && window.UgnayraApp) {
            window.UgnayraApp.navigate('/classroom/' + classId);
          } else {
            loadClassroomsList('all');
          }
        })
        .catch(function (err) {
          UI.toast(err.message || 'Failed to create classroom.', 'error');
        })
        .finally(function () {
          UI.setButtonLoading($btn, false);
        });
    });

    $(document).off('input', '#classroom-search-input').on('input', '#classroom-search-input', function () {
      var query = ($(this).val() || '').toLowerCase();
      $('.classroom-card-tile').each(function () {
        var text = $(this).text().toLowerCase();
        $(this).toggle(text.indexOf(query) !== -1);
      });
    });
  }

  // --------------------------------------------------------------------------
  // 2. CLASSROOM DETAIL VIEW (Stream, Classwork, People, Grades)
  // --------------------------------------------------------------------------

  function mountClassroomDetail(classroomId) {
    currentClassroomId = classroomId;
    activeTab = 'stream';

    return Templates.renderInto('#main-stage', Templates.VIEWS.CLASSROOM_DETAIL).then(function () {
      if (isTeacherOrFaculty()) {
        $('#classroom-teacher-toolbar').removeClass('hidden');
        $('#btn-classwork-new-assignment').removeClass('hidden');
      }

      loadClassroomData(classroomId);
      bindDetailEvents(classroomId);
      startScheduleLivePolling(classroomId);
    });
  }

  function loadClassroomData(id) {
    Services.Classrooms.get(id)
      .then(function (res) {
        var c = (res && res.data && (res.data.classroom || res.data)) || {};
        currentClassroomData = c;

        $('#crumb-subject-code').text(c.subject_code || c.name || 'Classroom');
        $('#detail-subject-code').text(c.subject_code || 'COURSE');
        $('#detail-section-code').text(c.section || 'All Sections');
        $('#detail-join-code').text(c.join_code || 'UG-XXXXX');
        $('#detail-subject-name').text(c.name || 'Untitled Subject');
        $('#detail-subject-desc').text(c.description || 'Welcome to your official academic classroom space.');

        var teacherName = (c.teacher && c.teacher.full_name) || c.instructor_name || 'Faculty Professor';
        $('#detail-teacher-name').text(teacherName);
        $('#detail-teacher-avatar').text(teacherName.charAt(0).toUpperCase());

        if (c.room) {
          $('#detail-room-name').text(c.room);
        }

        loadStreamPosts(id);
        loadUpcomingWork(id);
        checkLiveSession(id);
      })
      .catch(function (err) {
        UI.toast(err.message || 'Failed to load classroom details.', 'error');
      });
  }

  function checkLiveSession(id) {
    Services.Schedules.active(id)
      .then(function (res) {
        var session = res && res.data && res.data.session;
        var $banner = $('#classroom-live-alert');
        if (session && (session.status === 'in_progress' || session.status === 'active' || session.is_live)) {
          $banner.removeClass('hidden');
          $('#live-banner-status-text').text('LIVE ONLINE CLASS IN PROGRESS');
          $('#live-banner-topic-text').text('Topic: ' + (session.title || 'Interactive Virtual Recitation'));
          $('#btn-join-live-meeting').attr('data-meeting-code', session.meeting_code || session.id);
        } else if (session && session.minutes_until_start !== undefined && session.minutes_until_start <= 15 && session.minutes_until_start >= 0) {
          $banner.removeClass('hidden');
          $('#live-banner-status-text').text('ONLINE CLASS STARTS IN ' + session.minutes_until_start + ' MINS');
          $('#live-banner-topic-text').text('Topic: ' + (session.title || 'Upcoming Lecture'));
          $('#btn-join-live-meeting').attr('data-meeting-code', session.meeting_code || session.id);
        } else {
          $banner.addClass('hidden');
        }
      })
      .catch(function () {
        $('#classroom-live-alert').addClass('hidden');
      });
  }

  function startScheduleLivePolling(id) {
    if (schedulePollingTimer) clearInterval(schedulePollingTimer);
    schedulePollingTimer = setInterval(function () {
      if (currentClassroomId === id) {
        checkLiveSession(id);
      } else {
        clearInterval(schedulePollingTimer);
      }
    }, 20000); // Poll every 20 seconds
  }

  // Tab 1: Stream
  function loadStreamPosts(id) {
    var $posts = $('#stream-posts-list');
    Services.Classrooms.stream(id)
      .then(function (res) {
        var posts = (res && res.data && res.data.posts) || [];
        if (posts.length === 0) {
          $posts.html(
            '<div class="card p-4 text-center text-muted">' +
              '<i data-lucide="message-square" class="icon-md mb-2 text-secondary" style="margin: 0 auto;"></i>' +
              '<p class="text-sm">This is where your professor and classmates post announcements, questions, and resources.</p>' +
            '</div>'
          );
          UI.refreshIcons($posts[0]);
          return;
        }

        var html = posts.map(function (p) {
          var author = escapeHtml((p.author && p.author.full_name) || 'Class Instructor');
          var initial = author.charAt(0).toUpperCase();
          var time = p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Recent';
          var content = escapeHtml(p.content || '');

          var attachHtml = '';
          if (p.attachment_url) {
            var fileName = escapeHtml(p.attachment_name || 'Attached File');
            attachHtml = (
              '<div class="attachment-pill mt-2">' +
                '<i data-lucide="paperclip" class="icon-xs"></i>' +
                '<a href="' + escapeHtml(p.attachment_url) + '" target="_blank" rel="noopener">' + fileName + '</a>' +
              '</div>'
            );
          }

          return (
            '<div class="card p-4 mb-3 stream-post-item">' +
              '<div class="post-header-row mb-2">' +
                '<div class="avatar-sm font-semibold">' + initial + '</div>' +
                '<div>' +
                  '<div class="font-semibold text-sm">' + author + '</div>' +
                  '<div class="text-xs text-muted">' + time + '</div>' +
                '</div>' +
              '</div>' +
              '<div class="post-content-body text-sm mb-2" style="white-space: pre-wrap;">' + content + '</div>' +
              attachHtml +
            '</div>'
          );
        }).join('');

        $posts.html(html);
        UI.refreshIcons($posts[0]);
      })
      .catch(function () {
        $posts.html('<p class="text-xs text-muted">Unable to load stream updates.</p>');
      });
  }

  function loadUpcomingWork(id) {
    Services.Assignments.list(id)
      .then(function (res) {
        var list = (res && res.data && (res.data.assignments || res.data.items || (Array.isArray(res.data) ? res.data : []))) || [];
        var pending = list.filter(function (a) { return !a.submitted; }).slice(0, 3);
        var $target = $('#stream-upcoming-work-list');

        if (pending.length === 0) {
          $target.html('<p class="text-xs text-muted">Woohoo, no work due soon!</p>');
          return;
        }

        var html = pending.map(function (a) {
          var title = escapeHtml(a.title || 'Assignment');
          var due = a.due_at ? new Date(a.due_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No due date';
          return (
            '<a href="/assignment/' + a.id + '" class="upcoming-item-link mb-2 block">' +
              '<div class="font-semibold text-xs">' + title + '</div>' +
              '<div class="text-xs text-muted">Due ' + due + '</div>' +
            '</a>'
          );
        }).join('');

        $target.html(html);
      })
      .catch(function () {});
  }

  // Tab 2: Classwork
  function loadClasswork(id) {
    var $list = $('#classwork-assignments-list');
    $list.html('<div class="card-skeleton" style="height: 90px;"></div>');

    Services.Assignments.list(id)
      .then(function (res) {
        var assignments = (res && res.data && (res.data.assignments || res.data.items || (Array.isArray(res.data) ? res.data : []))) || [];
        if (assignments.length === 0) {
          var isTeacher = isTeacherOrFaculty();
          $list.html(
            UI.renderEmptyState({
              icon: 'assignments',
              title: 'No Coursework Assigned Yet',
              description: 'Course assignments, laboratory tasks, and syllabus deliverables will appear here once published by the faculty instructor.',
              ctaHtml: isTeacher ? '<button type="button" class="btn btn-primary" id="open-create-assignment-btn"><i data-lucide="plus"></i><span>Create Assignment</span></button>' : '',
              tip: 'Upcoming deadlines will alert you directly on your student Cockpit dashboard.',
              apiBadge: 'Classroom Syllabus Stream'
            })
          );
          UI.refreshIcons($list[0]);
          return;
        }

        var html = assignments.map(function (a) {
          var title = escapeHtml(a.title || 'Untitled Assignment');
          var points = a.max_score || 100;
          var due = a.due_at ? ('Due ' + new Date(a.due_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })) : 'No due date';
          var status = a.submitted ? (a.graded ? 'Graded' : 'Turned In') : 'Assigned';
          var statusClass = a.submitted ? (a.graded ? 'is-graded' : 'is-submitted') : 'is-assigned';

          var batchBadge = '';
          if (a.target_lab_batch) {
            batchBadge = '<span class="badge badge-secondary text-xs mr-2">Lab Batch ' + a.target_lab_batch + '</span>';
          }

          return (
            '<div class="classwork-item-card js-open-assignment" data-id="' + a.id + '">' +
              '<div class="classwork-item-left">' +
                '<div class="classwork-item-icon">' +
                  '<i data-lucide="file-text" class="icon-md text-primary"></i>' +
                '</div>' +
                '<div>' +
                  '<div class="font-semibold text-md">' + title + '</div>' +
                  '<div class="text-xs text-muted mt-1">' + batchBadge + '<span>' + points + ' points &bull; ' + due + '</span></div>' +
                '</div>' +
              '</div>' +
              '<div class="classwork-item-right">' +
                '<span class="status-chip ' + statusClass + '">' + status + '</span>' +
                '<i data-lucide="chevron-right" class="icon-sm text-muted"></i>' +
              '</div>' +
            '</div>'
          );
        }).join('');

        $list.html(html);
        UI.refreshIcons($list[0]);
      })
      .catch(function (err) {
        $list.html('<p class="text-xs text-danger">' + escapeHtml(err.message || 'Error loading classwork.') + '</p>');
      });
  }

  // Tab 3: People
  function loadPeople(id) {
    var $teachers = $('#people-teachers-list');
    var $students = $('#people-students-list');

    Services.Classrooms.members(id)
      .then(function (res) {
        var data = res.data || {};
        var teachers = data.teachers || [];
        var students = data.students || [];

        $('#people-teachers-count').text(teachers.length);
        $('#people-students-count').text(students.length);

        // Render Teachers
        var tHtml = teachers.map(function (t) {
          var name = escapeHtml(t.full_name || 'Professor');
          var initial = name.charAt(0).toUpperCase();
          var email = escapeHtml(t.email || '');
          return (
            '<div class="student-roster-card mb-2">' +
              '<div class="student-roster-left">' +
                '<div class="avatar-sm font-semibold">' + initial + '</div>' +
                '<div>' +
                  '<div class="font-semibold text-sm">' + name + '</div>' +
                  '<div class="text-xs text-muted">' + email + '</div>' +
                '</div>' +
              '</div>' +
              '<span class="badge badge-primary text-xs">Instructor</span>' +
            '</div>'
          );
        }).join('');
        $teachers.html(tHtml || UI.renderCompactEmptyState({
          icon: 'users',
          title: 'No Instructors Listed',
          description: 'Faculty assignments for this section will be updated by the academic department.'
        }));

        // Render Students
        var sHtml = students.map(function (s) {
          var name = escapeHtml(s.full_name || 'Student');
          var initial = name.charAt(0).toUpperCase();
          var schoolId = escapeHtml(s.school_id_number || 'N/A');
          var batch = s.assigned_lab_batch ? ('Batch ' + s.assigned_lab_batch) : 'Lecture';
          var designation = escapeHtml(s.academic_designation || (s.department + ' ' + (s.section || '')));

          return (
            '<div class="student-roster-card mb-2">' +
              '<div class="student-roster-left">' +
                '<div class="avatar-sm font-semibold">' + initial + '</div>' +
                '<div>' +
                  '<div class="font-semibold text-sm">' + name + '</div>' +
                  '<div class="text-xs text-muted">ID: ' + schoolId + ' &bull; <strong class="text-gold">' + designation + '</strong></div>' +
                '</div>' +
              '</div>' +
              '<div class="student-roster-right flex items-center gap-2">' +
                '<span class="designation-chip text-xs">' + batch + '</span>' +
                '<a href="/messages?to=' + s.id + '" class="btn-icon-subtle" title="Send message">' +
                  '<i data-lucide="message-square" class="icon-xs"></i>' +
                '</a>' +
              '</div>' +
            '</div>'
          );
        }).join('');
        $students.html(sHtml || UI.renderCompactEmptyState({
          icon: 'users',
          title: 'No Students Enrolled Yet',
          description: 'Enrolled students who join with the classroom code will appear here in the class roster.'
        }));
        UI.refreshIcons($('#tab-pane-people')[0]);
      })
      .catch(function () {});
  }

  // Tab 4: Grades
  function loadGrades(id) {
    if (isTeacherOrFaculty()) {
      $('#student-grades-container').addClass('hidden');
      $('#teacher-grades-container').removeClass('hidden');
      loadTeacherGradesMatrix(id);
    } else {
      $('#student-grades-container').removeClass('hidden');
      $('#teacher-grades-container').addClass('hidden');
      loadStudentGradesSummary(id);
    }
  }

  function loadStudentGradesSummary(id) {
    Services.Classrooms.studentGrades(id)
      .then(function (res) {
        var data = res.data || {};
        var assignments = data.assignments || [];
        var avg = data.average_percentage || 0;
        var done = data.turned_in_count || 0;
        var pending = data.pending_count || 0;

        $('#student-grade-avg').text(avg ? (Math.round(avg) + '%') : '--%');
        $('#student-sub-done').text(done);
        $('#student-sub-pending').text(pending);

        if (assignments.length === 0) {
          $('#student-grades-tbody').html('<tr><td colspan="5" class="text-center py-4 text-muted">No assignments listed.</td></tr>');
          return;
        }

        var tbodyHtml = assignments.map(function (a) {
          var title = escapeHtml(a.title || 'Assignment');
          var due = a.due_at ? new Date(a.due_at).toLocaleDateString() : 'N/A';
          var status = a.submitted ? (a.graded ? 'Graded' : 'Turned In') : 'Assigned';
          var score = a.score !== null ? (a.score + ' / ' + a.max_score) : '-- / ' + a.max_score;
          var feedback = escapeHtml(a.feedback || 'No comments');

          return (
            '<tr>' +
              '<td><strong class="text-sm">' + title + '</strong></td>' +
              '<td class="text-xs text-muted">' + due + '</td>' +
              '<td><span class="status-chip ' + (a.submitted ? 'is-done' : 'is-assigned') + '">' + status + '</span></td>' +
              '<td class="font-mono font-semibold">' + score + '</td>' +
              '<td class="text-xs text-secondary">' + feedback + '</td>' +
            '</tr>'
          );
        }).join('');

        $('#student-grades-tbody').html(tbodyHtml);
      })
      .catch(function () {});
  }

  function loadTeacherGradesMatrix(id) {
    Services.Classrooms.gradeMatrix(id)
      .then(function (res) {
        var data = res.data || {};
        var students = data.students || [];
        var assignments = data.assignments || [];

        // Build Table Header
        var thead = '<tr><th>Student Name</th><th>Student ID</th><th>Lab Batch</th>';
        assignments.forEach(function (a) {
          thead += '<th>' + escapeHtml(a.title) + ' (' + a.max_score + ' pts)</th>';
        });
        thead += '</tr>';
        $('#teacher-matrix-thead').html(thead);

        if (students.length === 0) {
          $('#teacher-matrix-tbody').html('<tr><td colspan="' + (3 + assignments.length) + '" class="text-center py-4 text-muted">No students enrolled.</td></tr>');
          return;
        }

        // Build Table Body
        var tbody = students.map(function (s) {
          var row = '<tr>';
          row += '<td><strong class="text-sm">' + escapeHtml(s.full_name) + '</strong></td>';
          row += '<td class="text-xs font-mono">' + escapeHtml(s.school_id_number || 'N/A') + '</td>';
          row += '<td><span class="designation-chip text-xs">' + (s.assigned_lab_batch ? ('Batch ' + s.assigned_lab_batch) : 'Lecture') + '</span></td>';

          assignments.forEach(function (a) {
            var sub = (s.submissions && s.submissions[a.id]) || null;
            if (sub && sub.score !== null) {
              row += '<td class="font-mono font-semibold text-gold">' + sub.score + ' / ' + a.max_score + '</td>';
            } else if (sub) {
              row += '<td><span class="status-chip is-submitted text-xs">Submitted</span></td>';
            } else {
              row += '<td><span class="text-muted text-xs">Missing</span></td>';
            }
          });

          row += '</tr>';
          return row;
        }).join('');

        $('#teacher-matrix-tbody').html(tbody);
      })
      .catch(function () {});
  }

  function bindDetailEvents(classroomId) {
    // Tab switching
    $(document).off('click', '.js-tab-btn').on('click', '.js-tab-btn', function () {
      var tab = $(this).attr('data-tab');
      $('.js-tab-btn').removeClass('is-active').attr('aria-selected', 'false');
      $(this).addClass('is-active').attr('aria-selected', 'true');

      $('.classroom-tab-pane').addClass('hidden');
      $('#tab-pane-' + tab).removeClass('hidden');
      activeTab = tab;

      if (tab === 'classwork') loadClasswork(classroomId);
      else if (tab === 'people') loadPeople(classroomId);
      else if (tab === 'grades') loadGrades(classroomId);
    });

    // Copy Join Code
    $(document).off('click', '#btn-copy-class-code, #detail-join-code-pill').on('click', '#btn-copy-class-code, #detail-join-code-pill', function (e) {
      e.stopPropagation();
      var code = $('#detail-join-code').text();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(function () {
          UI.toast('Class code copied to clipboard!', 'info');
        });
      }
    });

    // Join Live Meeting
    $(document).off('click', '#btn-join-live-meeting').on('click', '#btn-join-live-meeting', function () {
      var code = $(this).attr('data-meeting-code');
      if (code && window.UgnayraApp) {
        window.UgnayraApp.navigate('/meeting/' + code);
      }
    });

    // Stream Post Announcement
    $(document).off('submit', '#stream-announcement-form').on('submit', '#stream-announcement-form', function (e) {
      e.preventDefault();
      var text = ($('#stream-announcement-text').val() || '').trim();
      if (!text) return;

      var fileInput = document.getElementById('stream-announcement-file');
      var file = fileInput && fileInput.files && fileInput.files[0];

      var $btn = $('#btn-post-announcement');
      UI.setButtonLoading($btn, true, 'Posting...');

      var formData = new FormData();
      formData.append('content', text);
      if (file) formData.append('attachment', file);

      Services.Classrooms.postAnnouncement(classroomId, formData)
        .then(function () {
          $('#stream-announcement-text').val('');
          if (fileInput) fileInput.value = '';
          $('#stream-file-preview').text('');
          UI.toast('Announcement published to class stream.', 'success');
          loadStreamPosts(classroomId);
        })
        .catch(function (err) {
          UI.toast(err.message || 'Failed to post announcement.', 'error');
        })
        .finally(function () {
          UI.setButtonLoading($btn, false);
        });
    });

    // Attachment file label change preview
    $(document).off('change', '#stream-announcement-file').on('change', '#stream-announcement-file', function () {
      var name = this.files && this.files[0] ? this.files[0].name : '';
      $('#stream-file-preview').text(name);
    });

    // Open Assignment Item
    $(document).off('click', '.js-open-assignment').on('click', '.js-open-assignment', function () {
      var assignId = $(this).attr('data-id');
      if (assignId && window.UgnayraApp) {
        window.UgnayraApp.navigate('/assignment/' + assignId);
      }
    });

    // Modals: Create Assignment
    $(document).off('click', '#btn-open-create-assignment, #btn-classwork-new-assignment').on('click', '#btn-open-create-assignment, #btn-classwork-new-assignment', function () {
      $('#create-assignment-modal').removeClass('hidden');
      $('#assign-title').val('').focus();
    });

    $(document).off('click', '.js-close-assignment-modal').on('click', '.js-close-assignment-modal', function () {
      $('#create-assignment-modal').addClass('hidden');
    });

    $(document).off('submit', '#create-assignment-form').on('submit', '#create-assignment-form', function (e) {
      e.preventDefault();
      var title = ($('#assign-title').val() || '').trim();
      var points = parseInt($('#assign-points').val() || '100', 10);
      var due = $('#assign-due-date').val();
      var targetBatch = $('#assign-target-batch').val();
      var instructions = ($('#assign-instructions').val() || '').trim();

      if (!title || !due || !instructions) {
        UI.toast('Please fill all required assignment fields.', 'error');
        return;
      }

      var fileInput = document.getElementById('assign-file');
      var file = fileInput && fileInput.files && fileInput.files[0];

      var formData = new FormData();
      formData.append('title', title);
      formData.append('max_score', points);
      formData.append('due_at', due);
      formData.append('target_lab_batch', targetBatch || '');
      formData.append('instructions', instructions);
      if (file) formData.append('attachment', file);

      var $btn = $('#btn-save-assignment');
      UI.setButtonLoading($btn, true, 'Assigning...');

      Services.Assignments.create(classroomId, formData)
        .then(function () {
          UI.toast('Assignment published to class!', 'success');
          $('#create-assignment-modal').addClass('hidden');
          loadClasswork(classroomId);
          loadUpcomingWork(classroomId);
        })
        .catch(function (err) {
          UI.toast(err.message || 'Failed to create assignment.', 'error');
        })
        .finally(function () {
          UI.setButtonLoading($btn, false);
        });
    });

    // Modals: Schedule Live Class
    $(document).off('click', '#btn-open-schedule-modal').on('click', '#btn-open-schedule-modal', function () {
      $('#schedule-session-modal').removeClass('hidden');
      $('#sched-title').val('').focus();
    });

    $(document).off('click', '.js-close-sched-modal').on('click', '.js-close-sched-modal', function () {
      $('#schedule-session-modal').addClass('hidden');
    });

    $(document).off('submit', '#schedule-session-form').on('submit', '#schedule-session-form', function (e) {
      e.preventDefault();
      var title = ($('#sched-title').val() || '').trim();
      var start = $('#sched-start-time').val();
      var end = $('#sched-end-time').val();
      var desc = ($('#sched-desc').val() || '').trim();

      if (!title || !start || !end) {
        UI.toast('Please provide title, start time, and end time.', 'error');
        return;
      }

      var $btn = $('#btn-save-schedule');
      UI.setButtonLoading($btn, true, 'Scheduling...');

      Services.Schedules.create({
        classroom_id: classroomId,
        title: title,
        scheduled_start: start,
        scheduled_end: end,
        description: desc
      })
        .then(function (res) {
          UI.toast('Live virtual class scheduled!', 'success');
          $('#schedule-session-modal').addClass('hidden');
          checkLiveSession(classroomId);
        })
        .catch(function (err) {
          UI.toast(err.message || 'Failed to schedule class session.', 'error');
        })
        .finally(function () {
          UI.setButtonLoading($btn, false);
        });
    });

    // Instant Meeting
    $(document).off('click', '#btn-start-instant-meeting').on('click', '#btn-start-instant-meeting', function () {
      var $btn = $(this);
      UI.setButtonLoading($btn, true, 'Launching...');

      Services.Schedules.startInstant(classroomId)
        .then(function (res) {
          var meetingCode = res.data && res.data.session && res.data.session.meeting_code;
          if (meetingCode && window.UgnayraApp) {
            window.UgnayraApp.navigate('/meeting/' + meetingCode);
          }
        })
        .catch(function (err) {
          UI.toast(err.message || 'Failed to start instant meeting.', 'error');
        })
        .finally(function () {
          UI.setButtonLoading($btn, false);
        });
    });
  }

  window.UgnayraClassroom = {
    mountList: mountClassroomList,
    mountDetail: mountClassroomDetail
  };
})(window, window.jQuery);
