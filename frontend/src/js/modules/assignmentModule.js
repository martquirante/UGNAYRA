/**
 * UGNAYRA — Assignment Detail & Submission Module
 * Multi-file Dropzone (Drag-and-Drop), Version Tracking, Real MIME Detection,
 * Turn In / Unsubmit Workflows & Teacher Grade Return Panel.
 */
(function (window, $) {
  'use strict';

  var Services = window.UgnayraServices;
  var Store = window.UgnayraStore;
  var UI = window.UgnayraUI;
  var Templates = window.UgnayraTemplates;
  var escapeHtml = window.UgnayraEscape ? window.UgnayraEscape.escapeHtml : function (s) { return s || ''; };

  var currentAssignmentId = null;
  var currentAssignmentData = null;
  var stagedFiles = [];
  var rosterSubmissionsCache = [];

  function isTeacherOrFaculty() {
    var user = Store.getState().user || {};
    var role = String(user.role || '').toLowerCase();
    return role === 'teacher' || role === 'faculty' || role === 'personnel' || role === 'admin';
  }

  function mountAssignmentDetail(assignmentId) {
    currentAssignmentId = assignmentId;
    stagedFiles = [];

    return Templates.renderInto('#main-stage', Templates.VIEWS.ASSIGNMENT_DETAIL).then(function () {
      if (isTeacherOrFaculty()) {
        $('#teacher-grading-panel').removeClass('hidden');
        $('#student-submission-box').addClass('hidden');
        loadRosterSubmissions(assignmentId);
      } else {
        $('#student-submission-box').removeClass('hidden');
        $('#teacher-grading-panel').addClass('hidden');
        loadMySubmission(assignmentId);
      }

      loadAssignmentOverview(assignmentId);
      loadComments(assignmentId);
      bindDropzoneEvents();
      bindSubmissionEvents(assignmentId);
    });
  }

  function loadAssignmentOverview(id) {
    Services.Assignments.get(id)
      .then(function (res) {
        var a = (res && res.data && res.data.assignment) || {};
        currentAssignmentData = a;

        $('#crumb-assignment-title').text(a.title || 'Assignment Details');
        $('#crumb-classroom-link').text(a.classroom_name || 'Classroom').attr('href', '/classroom/' + a.classroom_id);
        $('#assign-display-title').text(a.title || 'Untitled Deliverable');
        $('#assign-instructions-text').html(escapeHtml(a.instructions || 'No special instructions provided.').replace(/\n/g, '<br/>'));
        $('#assign-points-badge').text((a.max_score || 100) + ' Points');
        $('#grade-max-points').text(a.max_score || 100);

        var authorName = (a.author && a.author.full_name) || 'Class Instructor';
        $('#assign-author-name').text(authorName);
        $('#assign-author-avatar').text(authorName.charAt(0).toUpperCase());

        if (a.due_at) {
          var dueStr = new Date(a.due_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          $('#assign-due-badge').text('Due ' + dueStr);
        } else {
          $('#assign-due-badge').text('No Due Date');
        }

        if (a.created_at) {
          $('#assign-created-date').text('Posted ' + new Date(a.created_at).toLocaleDateString());
        }

        if (a.attachment_url) {
          $('#assign-attachments-section').removeClass('hidden');
          var fileName = escapeHtml(a.attachment_name || 'Assignment Material');
          $('#assign-attachment-item').html(
            '<div class="flex items-center justify-between p-2">' +
              '<div class="flex items-center gap-2">' +
                '<i data-lucide="file" class="icon-sm text-primary"></i>' +
                '<span class="text-sm font-semibold">' + fileName + '</span>' +
              '</div>' +
              '<a href="' + escapeHtml(a.attachment_url) + '" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">' +
                '<i data-lucide="download" class="icon-xs"></i><span>Download</span>' +
              '</a>' +
            '</div>'
          );
          UI.refreshIcons($('#assign-attachments-section')[0]);
        }
      })
      .catch(function (err) {
        UI.toast(err.message || 'Failed to load assignment.', 'error');
      });
  }

  function loadMySubmission(id) {
    Services.Submissions.getMy(id)
      .then(function (res) {
        var sub = res && res.data && res.data.submission;
        var versions = (res && res.data && res.data.versions) || [];

        if (sub && sub.status === 'submitted') {
          $('#submission-status-chip').text(sub.is_late ? 'Turned In Late' : 'Turned In').attr('class', 'status-chip is-submitted');
          $('#btn-turn-in-work').addClass('hidden');
          $('#btn-unsubmit-work').removeClass('hidden');
          $('#submission-dropzone').addClass('hidden');
        } else if (sub && sub.status === 'graded') {
          $('#submission-status-chip').text('Graded').attr('class', 'status-chip is-graded');
          $('#btn-turn-in-work').addClass('hidden');
          $('#btn-unsubmit-work').addClass('hidden');
          $('#submission-dropzone').addClass('hidden');

          $('#student-grade-feedback-box').removeClass('hidden');
          $('#student-final-score').text(sub.score + ' / ' + (currentAssignmentData ? currentAssignmentData.max_score : 100));
          $('#student-feedback-text').text(sub.feedback || 'No comments left by instructor.');
        } else {
          $('#submission-status-chip').text('Assigned').attr('class', 'status-chip is-assigned');
          $('#btn-turn-in-work').removeClass('hidden');
          $('#btn-unsubmit-work').addClass('hidden');
          $('#submission-dropzone').removeClass('hidden');
          $('#student-grade-feedback-box').addClass('hidden');
        }

        renderVersionHistory(versions);
      })
      .catch(function () {});
  }

  function renderVersionHistory(versions) {
    var $list = $('#submission-versions-list');
    if (!versions || versions.length === 0) {
      $list.html('<p class="text-xs text-muted">No submissions recorded yet.</p>');
      return;
    }

    var html = versions.map(function (v) {
      var num = v.version_number || 1;
      var date = v.submitted_at ? new Date(v.submitted_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent';
      var files = Array.isArray(v.files) ? v.files : [];

      var filesHtml = files.map(function (f) {
        var name = escapeHtml(f.original_name || f.file_name || 'Deliverable File');
        var url = escapeHtml(f.file_url || '#');
        return (
          '<a href="' + url + '" target="_blank" rel="noopener" class="text-xs text-primary block hover:underline">' +
            '<i data-lucide="file-check" class="icon-xs inline mr-1"></i>' + name +
          '</a>'
        );
      }).join('');

      return (
        '<div class="version-timeline-item mb-3 pb-2 border-bottom">' +
          '<div class="flex items-center justify-between">' +
            '<strong class="text-xs">Version ' + num + '</strong>' +
            '<span class="text-xs text-muted">' + date + '</span>' +
          '</div>' +
          '<div class="version-files-list mt-1">' + filesHtml + '</div>' +
        '</div>'
      );
    }).join('');

    $list.html(html);
    UI.refreshIcons($list[0]);
  }

  function bindDropzoneEvents() {
    var $dropzone = $('#submission-dropzone');
    var fileInput = document.getElementById('submission-file-input');

    $(document).off('click', '#btn-browse-submission-files, #submission-dropzone').on('click', '#btn-browse-submission-files, #submission-dropzone', function (e) {
      if (e.target !== fileInput) {
        fileInput.click();
      }
    });

    $dropzone.on('dragover dragenter', function (e) {
      e.preventDefault();
      e.stopPropagation();
      $dropzone.addClass('is-dragover');
    });

    $dropzone.on('dragleave dragend drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      $dropzone.removeClass('is-dragover');
    });

    $dropzone.on('drop', function (e) {
      var files = e.originalEvent.dataTransfer.files;
      if (files && files.length > 0) {
        addFilesToStaging(files);
      }
    });

    $(fileInput).on('change', function () {
      if (this.files && this.files.length > 0) {
        addFilesToStaging(this.files);
      }
    });

    $(document).off('click', '.js-remove-staged-file').on('click', '.js-remove-staged-file', function (e) {
      e.stopPropagation();
      var idx = parseInt($(this).attr('data-index'), 10);
      stagedFiles.splice(idx, 1);
      renderStagedFiles();
    });
  }

  function addFilesToStaging(fileList) {
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      if (f.size > 25 * 1024 * 1024) {
        UI.toast('File ' + f.name + ' exceeds 25MB limit.', 'error');
        continue;
      }
      stagedFiles.push(f);
    }
    renderStagedFiles();
  }

  function renderStagedFiles() {
    var $container = $('#staged-files-container');
    if (stagedFiles.length === 0) {
      $container.empty();
      return;
    }

    var html = stagedFiles.map(function (f, idx) {
      var sizeMb = (f.size / (1024 * 1024)).toFixed(2) + ' MB';
      return (
        '<div class="staged-file-pill">' +
          '<div class="flex items-center gap-2">' +
            '<i data-lucide="file" class="icon-sm text-primary"></i>' +
            '<div>' +
              '<div class="font-semibold text-xs">' + escapeHtml(f.name) + '</div>' +
              '<div class="text-xs text-muted">' + sizeMb + '</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="btn-icon-subtle js-remove-staged-file" data-index="' + idx + '" aria-label="Remove file">' +
            '<i data-lucide="x" class="icon-xs"></i>' +
          '</button>' +
        '</div>'
      );
    }).join('');

    $container.html(html);
    UI.refreshIcons($container[0]);
  }

  function bindSubmissionEvents(assignmentId) {
    // Turn In Work
    $(document).off('click', '#btn-turn-in-work').on('click', '#btn-turn-in-work', function () {
      if (stagedFiles.length === 0) {
        UI.toast('Please attach at least one deliverable file to turn in.', 'info');
        return;
      }

      var $btn = $(this);
      UI.setButtonLoading($btn, true, 'Submitting...');

      var formData = new FormData();
      stagedFiles.forEach(function (f) {
        formData.append('files[]', f);
      });

      Services.Submissions.submit(assignmentId, formData)
        .then(function () {
          UI.toast('Work turned in successfully!', 'success');
          stagedFiles = [];
          renderStagedFiles();
          loadMySubmission(assignmentId);
        })
        .catch(function (err) {
          UI.toast(err.message || 'Failed to submit deliverables.', 'error');
        })
        .finally(function () {
          UI.setButtonLoading($btn, false);
        });
    });

    // Unsubmit Work
    $(document).off('click', '#btn-unsubmit-work').on('click', '#btn-unsubmit-work', function () {
      UI.confirm('Are you sure you want to unsubmit? Don\'t forget to re-submit before the due date.', function () {
        Services.Submissions.unsubmit(assignmentId)
          .then(function () {
            UI.toast('Work unsubmitted.', 'info');
            loadMySubmission(assignmentId);
          })
          .catch(function (err) {
            UI.toast(err.message || 'Failed to unsubmit work.', 'error');
          });
      });
    });

    // Teacher: Select Student from Roster Dropdown
    $(document).off('change', '#grading-student-select').on('change', '#grading-student-select', function () {
      var subId = $(this).val();
      if (!subId) {
        $('#selected-submission-details').addClass('hidden');
        $('#teacher-score-input').val('');
        $('#teacher-feedback-input').val('');
        return;
      }

      var sub = rosterSubmissionsCache.find(function (s) { return s.id === subId; });
      if (!sub) return;

      $('#selected-submission-details').removeClass('hidden');
      $('#grade-sub-student-name').text((sub.student && sub.student.full_name) || 'Enrolled Student');
      $('#grade-sub-status').text(sub.status === 'graded' ? 'Graded' : (sub.is_late ? 'Turned In Late' : 'Turned In'));
      $('#teacher-score-input').val(sub.score !== null ? sub.score : '');
      $('#teacher-feedback-input').val(sub.feedback || '');

      var files = Array.isArray(sub.files) ? sub.files : [];
      var fHtml = files.map(function (f) {
        return (
          '<a href="' + escapeHtml(f.file_url) + '" target="_blank" rel="noopener" class="btn btn-secondary btn-sm block mb-1">' +
            '<i data-lucide="download" class="icon-xs inline mr-1"></i>' + escapeHtml(f.original_name) +
          '</a>'
        );
      }).join('');
      $('#grade-sub-files-list').html(fHtml || '<span class="text-xs text-muted">No files attached.</span>');
      UI.refreshIcons($('#grade-sub-files-list')[0]);
    });

    // Teacher: Submit Grade Form
    $(document).off('submit', '#teacher-grade-form').on('submit', '#teacher-grade-form', function (e) {
      e.preventDefault();
      var subId = $('#grading-student-select').val();
      if (!subId) {
        UI.toast('Please select a student submission to grade.', 'error');
        return;
      }

      var score = parseInt($('#teacher-score-input').val(), 10);
      var feedback = ($('#teacher-feedback-input').val() || '').trim();

      if (isNaN(score) || score < 0) {
        UI.toast('Please enter a valid numeric score.', 'error');
        return;
      }

      var $btn = $('#btn-submit-grade');
      UI.setButtonLoading($btn, true, 'Returning grade...');

      Services.Submissions.grade(subId, {
        score: score,
        feedback: feedback
      })
        .then(function () {
          UI.toast('Grade returned to student!', 'success');
          loadRosterSubmissions(assignmentId);
        })
        .catch(function (err) {
          UI.toast(err.message || 'Failed to submit grade.', 'error');
        })
        .finally(function () {
          UI.setButtonLoading($btn, false);
        });
    });

    // Class Comments
    $(document).off('submit', '#assign-comment-form').on('submit', '#assign-comment-form', function (e) {
      e.preventDefault();
      var text = ($('#assign-comment-input').val() || '').trim();
      if (!text) return;

      Services.Assignments.postComment(assignmentId, { comment: text })
        .then(function () {
          $('#assign-comment-input').val('');
          loadComments(assignmentId);
        })
        .catch(function () {});
    });
  }

  function loadRosterSubmissions(id) {
    Services.Submissions.list(id)
      .then(function (res) {
        var list = (res && res.data && res.data.submissions) || [];
        rosterSubmissionsCache = list;
        var $select = $('#grading-student-select');

        if (list.length === 0) {
          $select.html('<option value="">No submissions turned in yet.</option>');
          return;
        }

        var opts = '<option value="">-- Choose student roster (' + list.length + ') --</option>';
        list.forEach(function (s) {
          var name = escapeHtml((s.student && s.student.full_name) || 'Student');
          var scoreText = s.score !== null ? ('[' + s.score + ' pts]') : '[Unmarked]';
          var lateText = s.is_late ? ' (Late)' : '';
          opts += '<option value="' + s.id + '">' + name + ' ' + scoreText + lateText + '</option>';
        });

        $select.html(opts);
      })
      .catch(function () {});
  }

  function loadComments(id) {
    Services.Assignments.getComments(id)
      .then(function (res) {
        var comments = (res && res.data && res.data.comments) || [];
        var $list = $('#assign-comments-list');

        if (comments.length === 0) {
          $list.html('<p class="text-xs text-muted">No comments posted yet.</p>');
          return;
        }

        var html = comments.map(function (c) {
          var author = escapeHtml((c.author && c.author.full_name) || 'Classmate');
          var text = escapeHtml(c.comment || '');
          var time = c.created_at ? new Date(c.created_at).toLocaleDateString() : '';
          return (
            '<div class="comment-item mb-2 pb-1 border-bottom">' +
              '<div class="flex items-center justify-between">' +
                '<strong class="text-xs">' + author + '</strong>' +
                '<span class="text-xs text-muted">' + time + '</span>' +
              '</div>' +
              '<p class="text-xs text-secondary mt-1">' + text + '</p>' +
            '</div>'
          );
        }).join('');

        $list.html(html);
      })
      .catch(function () {});
  }

  window.UgnayraAssignment = {
    mountDetail: mountAssignmentDetail
  };
})(window, window.jQuery);
