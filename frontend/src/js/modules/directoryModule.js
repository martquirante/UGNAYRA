/**
 * UGNAYRA — Academic Student Directory & Cohort Filter Module
 * Complies with Section 6.D / 6.E: Cascading cohort filtering by College,
 * Program, Year Level, and Section, with bulk selection for Section GCs.
 */
(function (window, $) {
  'use strict';

  var Services = window.UgnayraServices;
  var UI = window.UgnayraUI;
  var escapeHtml = (window.UgnayraFormat && window.UgnayraFormat.escapeHtml) || function (s) { return String(s || ''); };

  var currentRosterList = [];
  var selectedStudentIds = [];

  function mountDirectory() {
    UI.renderInto('#app-content', 'src/pages/directory/student-directory.html')
      .then(function () {
        bindDirectoryEvents();
        loadDirectoryStudents();
      })
      .catch(function (err) {
        console.error('Failed to load student directory view:', err);
      });
  }

  function loadDirectoryStudents() {
    var $grid = $('#dir-students-grid');
    $grid.html(
      '<div class="card-skeleton" style="height: 100px;"></div>' +
      '<div class="card-skeleton" style="height: 100px;"></div>'
    );

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

    // Update active cohort label
    var parts = [];
    if (program) parts.push(program);
    if (yearLevel) parts.push(yearLevel.replace('_', ' '));
    if (section) parts.push('Section ' + section);
    var cohortLabel = parts.length > 0 ? ('Filtered by: ' + parts.join(' • ')) : 'All Students';
    $('#dir-cohort-text').text(cohortLabel);

    Services.Directory.list(params)
      .then(function (res) {
        var raw = res && res.data;
        var students = (raw && (raw.students || (Array.isArray(raw) ? raw : []))) || [];
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
        UI.renderEmptyState({
          icon: 'users',
          title: 'No Students Found',
          description: 'Try adjusting your search query, selecting another year level or section, or search by student name.',
          ctaHtml: '<button type="button" class="btn btn-secondary js-reset-directory-filters"><i data-lucide="rotate-ccw"></i><span>Reset Filters</span></button>'
        })
      );
      UI.refreshIcons($grid[0]);
      return;
    }

    var html = students.map(function (s) {
      var id = escapeHtml(s.id);
      var name = escapeHtml(s.full_name || 'Student');
      var schoolId = escapeHtml(s.school_id_number || '');
      var designation = escapeHtml(s.academic_designation || ((s.department || 'Student') + (s.section ? ' • Section ' + s.section : '')));
      var isChecked = selectedStudentIds.indexOf(s.id) !== -1;
      var avatarHtml = (window.UgnayraFormat && window.UgnayraFormat.renderAvatar)
        ? window.UgnayraFormat.renderAvatar(s, 'avatar-sm', false)
        : ('<div class="avatar-sm font-semibold">' + name.charAt(0).toUpperCase() + '</div>');

      return (
        '<div class="student-roster-card" data-student-id="' + id + '">' +
          '<div class="student-roster-left">' +
            '<input type="checkbox" class="js-select-student-check custom-checkbox" data-id="' + id + '" ' + (isChecked ? 'checked' : '') + ' aria-label="Select student" />' +
            avatarHtml +
            '<div class="student-roster-info">' +
              '<div class="font-semibold text-sm student-roster-name">' + name + '</div>' +
              '<div class="text-xs text-secondary">' + (schoolId ? ('ID: ' + schoolId + ' &bull; ') : '') + designation + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="student-roster-right">' +
            '<a href="/messages?to=' + id + '" class="btn btn-secondary btn-sm" title="Send Message" aria-label="Send Message">' +
              '<i data-lucide="message-square" class="icon-xs"></i><span>Message</span>' +
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
    $(document).off('click', '#btn-reset-dir-filters, .js-reset-directory-filters').on('click', '#btn-reset-dir-filters, .js-reset-directory-filters', function () {
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
