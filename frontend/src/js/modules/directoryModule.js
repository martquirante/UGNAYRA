/**
 * UGNAYRA — Academic Student Directory & Cohort Filter Module
 * Cascading Filters (College -> Program -> Year Level -> Section -> Lab Batch),
 * Multi-Student Selection & Bulk Group Chat Provisioning.
 */
(function (window, $) {
  'use strict';

  var Services = window.UgnayraServices;
  var UI = window.UgnayraUI;
  var Templates = window.UgnayraTemplates;
  var escapeHtml = window.UgnayraEscape ? window.UgnayraEscape.escapeHtml : function (s) { return s || ''; };

  var selectedStudentIds = [];
  var currentRosterList = [];

  function mountDirectory() {
    selectedStudentIds = [];
    return Templates.renderInto('#main-stage', Templates.VIEWS.STUDENT_DIRECTORY).then(function () {
      loadDirectoryStudents();
      bindDirectoryEvents();
    });
  }

  function loadDirectoryStudents() {
    var $grid = $('#dir-students-grid');
    $grid.html('<div class="card-skeleton" style="height: 100px;"></div><div class="card-skeleton" style="height: 100px;"></div>');

    var query = ($('#dir-search-input').val() || '').trim();
    var college = $('#dir-college-select').val();
    var program = $('#dir-program-select').val();
    var yearLevel = $('#dir-year-select').val();
    var section = $('#dir-section-select').val();
    var batch = $('#dir-batch-select').val();

    var params = {
      q: query,
      college: college,
      program: program,
      year_level: yearLevel,
      section: section,
      lab_batch: batch
    };

    // Update active cohort badge
    var cohortLabel = (program || 'All') + ' ' + (yearLevel ? yearLevel.replace('_', ' ') : '') + (section ? (' Section ' + section) : '');
    $('#dir-cohort-text').text('Filtered by: ' + cohortLabel);

    Services.Directory.list(params)
      .then(function (res) {
        var students = (res && res.data && res.data.students) || [];
        currentRosterList = students;
        $('#dir-results-count').text(students.length);
        renderStudentCards(students);
      })
      .catch(function () {
        $grid.html('<p class="text-xs text-muted p-4 text-center col-span-2">No students match the current filters.</p>');
      });
  }

  function renderStudentCards(students) {
    var $grid = $('#dir-students-grid');
    if (!students || students.length === 0) {
      $grid.html(
        '<div class="card p-4 text-center text-muted col-span-2">' +
          '<i data-lucide="users" class="icon-lg mb-2 text-secondary" style="margin: 0 auto;"></i>' +
          '<p class="text-sm">No students found matching your criteria.</p>' +
        '</div>'
      );
      UI.refreshIcons($grid[0]);
      return;
    }

    var html = students.map(function (s) {
      var id = escapeHtml(s.id);
      var name = escapeHtml(s.full_name || 'Student');
      var initial = name.charAt(0).toUpperCase();
      var schoolId = escapeHtml(s.school_id_number || 'N/A');
      var designation = escapeHtml(s.academic_designation || (s.department + ' ' + (s.section || '')));
      var isChecked = selectedStudentIds.indexOf(s.id) !== -1;

      return (
        '<div class="student-roster-card" data-student-id="' + id + '">' +
          '<div class="student-roster-left">' +
            '<input type="checkbox" class="js-select-student-check" data-id="' + id + '" ' + (isChecked ? 'checked' : '') + ' />' +
            '<div class="avatar-sm font-semibold">' + initial + '</div>' +
            '<div>' +
              '<div class="font-semibold text-sm">' + name + '</div>' +
              '<div class="text-xs text-muted">ID: ' + schoolId + ' &bull; <strong class="text-gold">' + designation + '</strong></div>' +
            '</div>' +
          '</div>' +
          '<div class="student-roster-right">' +
            '<a href="/messages?to=' + id + '" class="btn btn-secondary btn-sm" title="Message">' +
              '<i data-lucide="message-square" class="icon-xs"></i>' +
            '</a>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    $grid.html(html);
    UI.refreshIcons($grid[0]);
  }

  function updateBulkActionState() {
    var count = selectedStudentIds.length;
    $('#selected-students-count').text(count);
    $('#btn-bulk-add-gc').prop('disabled', count === 0);
    $('#modal-gc-selected-count').text(count);
  }

  function bindDirectoryEvents() {
    // Dynamic Filter Change
    $(document).off('change', '#dir-college-select, #dir-program-select, #dir-year-select, #dir-section-select, #dir-batch-select')
      .on('change', '#dir-college-select, #dir-program-select, #dir-year-select, #dir-section-select, #dir-batch-select', function () {
        loadDirectoryStudents();
      });

    // Search Input debounce
    var searchTimer = null;
    $(document).off('input', '#dir-search-input').on('input', '#dir-search-input', function () {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        loadDirectoryStudents();
      }, 300);
    });

    // Reset Filters
    $(document).off('click', '#btn-reset-dir-filters').on('click', '#btn-reset-dir-filters', function () {
      $('#dir-search-input').val('');
      $('#dir-college-select').val('');
      $('#dir-program-select').val('');
      $('#dir-year-select').val('');
      $('#dir-section-select').val('');
      $('#dir-batch-select').val('');
      loadDirectoryStudents();
    });

    // Select All Checkbox
    $(document).off('change', '#dir-select-all-checkbox').on('change', '#dir-select-all-checkbox', function () {
      var isChecked = $(this).is(':checked');
      if (isChecked) {
        selectedStudentIds = currentRosterList.map(function (s) { return s.id; });
      } else {
        selectedStudentIds = [];
      }
      $('.js-select-student-check').prop('checked', isChecked);
      updateBulkActionState();
    });

    // Individual Student Checkbox
    $(document).off('change', '.js-select-student-check').on('change', '.js-select-student-check', function () {
      var id = $(this).attr('data-id');
      if ($(this).is(':checked')) {
        if (selectedStudentIds.indexOf(id) === -1) selectedStudentIds.push(id);
      } else {
        selectedStudentIds = selectedStudentIds.filter(function (sid) { return sid !== id; });
      }
      updateBulkActionState();
    });

    // Open Bulk Add to GC Modal
    $(document).off('click', '#btn-bulk-add-gc, #btn-create-section-gc').on('click', '#btn-bulk-add-gc, #btn-create-section-gc', function () {
      $('#dir-add-to-gc-modal').removeClass('hidden');

      // Populate user's groups in dropdown
      Services.Groups.list()
        .then(function (res) {
          var groups = (res && res.data && res.data.groups) || [];
          var opts = '<option value="">-- Choose existing group --</option>';
          groups.forEach(function (g) {
            opts += '<option value="' + g.id + '">' + escapeHtml(g.name) + '</option>';
          });
          $('#dir-target-gc-select').html(opts);
        })
        .catch(function () {});
    });

    $(document).off('click', '.js-close-gc-modal').on('click', '.js-close-gc-modal', function () {
      $('#dir-add-to-gc-modal').addClass('hidden');
    });

    // Confirm Add to GC Form
    $(document).off('submit', '#dir-add-to-gc-form').on('submit', '#dir-add-to-gc-form', function (e) {
      e.preventDefault();
      var targetGroupId = $('#dir-target-gc-select').val();
      var newGroupName = ($('#dir-new-gc-name').val() || '').trim();

      if (!targetGroupId && !newGroupName) {
        UI.toast('Please select an existing group or enter a new group name.', 'error');
        return;
      }

      var $btn = $('#btn-confirm-add-to-gc');
      UI.setButtonLoading($btn, true, 'Adding...');

      var promise;
      if (newGroupName) {
        promise = Services.Groups.create({
          name: newGroupName,
          type: 'section',
          member_ids: selectedStudentIds
        });
      } else {
        promise = Services.Groups.addMembers(targetGroupId, {
          member_ids: selectedStudentIds
        });
      }

      promise
        .then(function () {
          UI.toast('Students added to group chat successfully!', 'success');
          $('#dir-add-to-gc-modal').addClass('hidden');
          selectedStudentIds = [];
          updateBulkActionState();
          $('.js-select-student-check').prop('checked', false);
          $('#dir-select-all-checkbox').prop('checked', false);
        })
        .catch(function (err) {
          UI.toast(err.message || 'Failed to add members to group chat.', 'error');
        })
        .finally(function () {
          UI.setButtonLoading($btn, false);
        });
    });
  }

  window.UgnayraDirectory = {
    mount: mountDirectory
  };
})(window, window.jQuery);
