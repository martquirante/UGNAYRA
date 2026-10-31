/**
 * UGNAYRA — User Profile & Settings Module (Includes JSON Data Inspector & Export)
 */
(function (window, $) {
  'use strict';

  var fmt = window.UgnayraFormat;
  var UI = window.UgnayraUI;
  var Validator = window.UgnayraValidator;
  var Services = window.UgnayraServices;
  var Store = window.UgnayraStore;
  var PostCard = window.UgnayraPostCard;
  var Templates = window.UgnayraTemplates;

  var activeProfile = null;
  var jsonExportScope = 'full';

  function mountProfile(usernameOrId) {
    var me = Store.getState().user || {};
    var target = usernameOrId || me.username || me.id;

    $('#main-stage').html('<div class="feed-column-wrap" style="max-width:780px;">' + UI.renderPostSkeletons(2) + '</div>');

    Services.Profiles.get(target)
      .then(function (res) {
        var profile = res.data && res.data.profile;
        if (!profile) throw new Error('Profile not found.');
        activeProfile = profile;
        return renderProfileView(profile).then(function () {
          loadProfilePosts(profile.id);
        });
      })
      .catch(function (err) {
        $('#main-stage').html(UI.renderEmptyState(
          'user-x',
          'Profile not found',
          err.message || 'This campus member profile could not be loaded.',
          '<a href="/feed" class="btn btn-primary btn-sm">Back to Feed</a>'
        ));
        UI.refreshIcons($('#main-stage')[0]);
      });
  }

  function renderProfileView(u) {
    var me = Store.getState().user || {};
    var isOwn = Boolean(me && ((me.id && u.id && me.id === u.id) || (me.username && u.username && me.username.toLowerCase() === u.username.toLowerCase())));

    return Templates.renderInto('#main-stage', Templates.VIEWS.PROFILE).then(function ($stage) {
      if (u.cover_url) {
        $('#profile-cover-el').css('background-image', 'url("' + fmt.resolveMediaUrl(u.cover_url) + '")');
      } else {
        $('#profile-cover-el').css('background-image', '');
      }

      if (isOwn) {
        $('#profile-cover-edit-label, #profile-avatar-edit-label').removeClass('hidden');
        $('#profile-avatar-frame').css('cursor', 'pointer').attr('title', 'Click to change profile photo');
        $('#profile-action-buttons').html(
          '<button type="button" class="btn btn-secondary btn-sm" id="open-edit-profile-btn">' +
            '<i data-lucide="user-check" class="icon-sm"></i><span>Edit Profile</span>' +
          '</button>' +
          '<a href="/settings" class="btn btn-soft btn-sm">' +
            '<i data-lucide="settings" class="icon-sm"></i><span>Settings</span>' +
          '</a>'
        );
      } else {
        $('#profile-cover-edit-label, #profile-avatar-edit-label').addClass('hidden');
        $('#profile-action-buttons').html(
          '<button type="button" class="btn btn-primary btn-sm js-quick-message-user" data-user-id="' + fmt.escapeHtml(u.id) + '">' +
            '<i data-lucide="message-circle" class="icon-sm"></i><span>Message</span>' +
          '</button>'
        );
      }

      $('#profile-avatar-slot').html(fmt.renderAvatar(u, 'avatar-xl', true));
      $('#profile-full-name').text(u.full_name || '');
      $('#profile-role-badge').html(fmt.roleBadgeHtml(u.role));
      $('#profile-handle-line').text('@' + (u.username || '') + (u.school_id_number ? ' · ID: ' + u.school_id_number : ''));

      if (u.bio) {
        $('#profile-bio-text').text(u.bio).removeClass('hidden');
      } else {
        $('#profile-bio-text').empty().addClass('hidden');
      }

      var metaHtml =
        (u.department ? '<span class="inline-flex items-center gap-1"><i data-lucide="building-2" class="icon-xs"></i>' + fmt.escapeHtml(u.department) + '</span>' : '') +
        (u.year_or_grade ? '<span class="inline-flex items-center gap-1"><i data-lucide="graduation-cap" class="icon-xs"></i>' + fmt.escapeHtml(u.year_or_grade) + '</span>' : '') +
        (u.section ? '<span class="inline-flex items-center gap-1"><i data-lucide="users" class="icon-xs"></i>' + fmt.escapeHtml(u.section) + '</span>' : '') +
        '<span class="inline-flex items-center gap-1"><i data-lucide="calendar" class="icon-xs"></i>Joined ' + fmt.escapeHtml(fmt.formatDateShort(u.created_at)) + '</span>';

      $('#profile-academic-meta').html(metaHtml);
      $('#profile-posts-count-label').text(Number(u.posts_count || 0) + ' total posts');
      $('#profile-posts-stream').html(UI.renderPostSkeletons(2));

      UI.refreshIcons($stage[0]);
      return $stage;
    });
  }

  function loadProfilePosts(userId) {
    Services.Profiles.posts(userId, { limit: 20 })
      .then(function (res) {
        var items = (res.data && res.data.items) || [];
        var $stream = $('#profile-posts-stream');
        if (!items.length) {
          $stream.html(UI.renderEmptyState('file-text', 'No posts published yet', 'Shared updates and campus discussions will appear on this timeline.'));
        } else {
          $stream.html(items.map(PostCard.render).join(''));
        }
        UI.refreshIcons($stream[0]);
      })
      .catch(function (err) {
        $('#profile-posts-stream').html('<p class="form-error">' + fmt.escapeHtml(err.message) + '</p>');
      });
  }

  function openEditProfileModal() {
    var me = Store.getState().user || {};
    var role = me.role || 'student';
    var deptLabel = role === 'teacher'
      ? 'College / Department'
      : (role === 'personnel' ? 'Administrative Office / Unit' : 'Course / Program');
    var yearLabel = role === 'teacher' ? 'Academic Rank' : 'Year Level';
    var secLabel = role === 'teacher'
      ? 'Advisory / Unit'
      : (role === 'personnel' ? 'Building / Unit' : 'Section');

    var $modal = UI.openModal({
      title: 'Edit Academic Profile',
      bodyHtml:
        '<form id="edit-profile-form" novalidate>' +
          '<div class="flex items-center gap-3 mb-4" style="padding:10px 14px;background-color:var(--color-surface-subtle);border-radius:var(--radius-md);border:1px solid var(--color-border-subtle);">' +
            '<div id="modal-avatar-preview">' + fmt.renderAvatar(me, 'avatar-lg', false) + '</div>' +
            '<div class="flex-1 min-w-0">' +
              '<button type="button" class="btn btn-secondary btn-sm" id="modal-upload-avatar-trigger">' +
                '<i data-lucide="camera" class="icon-sm"></i><span>Change Profile Photo</span>' +
              '</button>' +
              '<p class="text-xs-muted mt-1" style="font-size:11px;">JPEG, PNG, WebP or GIF up to 5 MB</p>' +
            '</div>' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label" for="ep-fullname">Full Name</label>' +
            '<input type="text" id="ep-fullname" name="full_name" class="form-input" data-restrict="name" maxlength="120" value="' + fmt.escapeHtml(me.full_name || '') + '" required />' +
            '<div class="form-error"></div>' +
          '</div>' +
          '<div class="form-group">' +
            '<span class="form-label" id="ep-dept-label">' + fmt.escapeHtml(deptLabel) + '</span>' +
            '<div class="ug-combobox" id="ep-dept-combo" data-searchable="true">' +
              '<input type="hidden" id="ep-dept" name="department" value="' + fmt.escapeHtml(me.department || '') + '" />' +
              '<button type="button" class="ug-combobox-trigger" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="ep-dept-label">' +
                '<span class="ug-combobox-value is-placeholder" data-placeholder="Select your course or department">' +
                  fmt.escapeHtml(me.department || 'Select your course or department') +
                '</span>' +
                '<span class="ug-combobox-badge hidden"></span>' +
                '<span class="ug-combobox-chevron" aria-hidden="true"><i data-lucide="chevron-down" class="icon-sm"></i></span>' +
              '</button>' +
              '<div class="ug-combobox-popover hidden" role="dialog">' +
                '<div class="ug-combobox-search-wrap">' +
                  '<i data-lucide="search" class="icon-xs ug-combobox-search-icon"></i>' +
                  '<input type="text" class="ug-combobox-search-input" placeholder="Search course, acronym, or college..." autocomplete="off" spellcheck="false" />' +
                '</div>' +
                '<div class="ug-combobox-list" role="listbox"></div>' +
              '</div>' +
            '</div>' +
            '<div class="form-error"></div>' +
          '</div>' +
          '<div class="form-row-2' + (role === 'personnel' ? ' is-single-col' : '') + '">' +
            '<div class="form-group' + (role === 'personnel' ? ' hidden' : '') + '">' +
              '<span class="form-label" id="ep-year-label">' + fmt.escapeHtml(yearLabel) + '</span>' +
              '<div class="ug-combobox" id="ep-year-combo" data-searchable="false">' +
                '<input type="hidden" id="ep-year" name="year_or_grade" value="' + fmt.escapeHtml(me.year_or_grade || '') + '" />' +
                '<button type="button" class="ug-combobox-trigger" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="ep-year-label">' +
                  '<span class="ug-combobox-value is-placeholder" data-placeholder="Select year level">' +
                    fmt.escapeHtml(me.year_or_grade || 'Select year level') +
                  '</span>' +
                  '<span class="ug-combobox-chevron" aria-hidden="true"><i data-lucide="chevron-down" class="icon-sm"></i></span>' +
                '</button>' +
                '<div class="ug-combobox-popover hidden" role="dialog">' +
                  '<div class="ug-combobox-search-wrap hidden"><input type="text" class="ug-combobox-search-input" /></div>' +
                  '<div class="ug-combobox-list" role="listbox"></div>' +
                '</div>' +
              '</div>' +
              '<div class="form-error"></div>' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label" for="ep-section">' + fmt.escapeHtml(secLabel) + '</label>' +
              '<input type="text" id="ep-section" name="section" class="form-input" data-restrict="section" maxlength="20" placeholder="Enter section" value="' + fmt.escapeHtml(me.section || '') + '" />' +
              '<div class="form-error"></div>' +
            '</div>' +
          '</div>' +
          '<div class="form-group" style="margin-bottom:0;">' +
            '<label class="form-label" for="ep-bio">Academic Bio</label>' +
            '<textarea id="ep-bio" name="bio" class="form-textarea" rows="3" maxlength="500" ' +
              'placeholder="Enter your bio...">' + fmt.escapeHtml(me.bio || '') + '</textarea>' +
          '</div>' +
        '</form>',
      footerHtml:
        '<button type="button" class="btn btn-secondary js-close-modal">Cancel</button>' +
        '<button type="button" class="btn btn-primary" id="save-profile-btn">Save Profile</button>'
    });

    function hydrateProfileCombos(catalogData, currentDept, currentYear) {
      var built = UI.buildAcademicOptions(catalogData, role);
      UI.configureCombobox($modal.find('#ep-dept-combo'), {
        items: built.departmentItems,
        placeholder: 'Select your course or department',
        searchPlaceholder: 'Search course, acronym, or college...',
        searchable: true,
        allowExistingValue: true,
        value: currentDept
      });
      UI.configureCombobox($modal.find('#ep-year-combo'), {
        items: built.yearItems,
        placeholder: role === 'teacher' ? 'Select academic rank' : 'Select year level',
        searchable: false,
        allowExistingValue: true,
        value: currentYear
      });
    }

    hydrateProfileCombos(null, me.department || '', me.year_or_grade || '');

    Services.Academics.catalog()
      .then(function (res) {
        var curDept = $modal.find('#ep-dept').val() || me.department || '';
        var curYear = $modal.find('#ep-year').val() || me.year_or_grade || '';
        hydrateProfileCombos((res && res.data) || {}, curDept, curYear);
      })
      .catch(function () {});

    $modal.on('click', '#save-profile-btn', function () {
      var $btn = $(this);
      var $form = $modal.find('#edit-profile-form');
      var check = Validator.validateForm($form, {
        full_name: { required: true, minLength: 2, maxLength: 120, personName: true, requireTwoWords: true },
        department: { required: true, minLength: 2, maxLength: 120 },
        year_or_grade: { maxLength: 40 },
        section: { maxLength: 20, sectionCode: true },
        bio: { maxLength: 500 }
      });
      if (!check.valid) return;

      UI.setButtonLoading($btn, true, 'Saving...');
      Services.Profiles.updateMe(check.values)
        .then(function (res) {
          var updated = (res.data && res.data.profile) || Object.assign({}, me, check.values);
          Store.setState({ user: updated });
          window.UgnayraApp.syncShellAccountCard();
          UI.closeModal();
          UI.toast('Profile updated!', 'success');
          renderProfileView(updated).then(function () {
            loadProfilePosts(updated.id);
          });
        })
        .catch(function (err) {
          if (err.details) Validator.applyServerValidationErrors($form, err.details);
          UI.toast(err.message || 'Could not update profile.', 'error');
        })
        .finally(function () {
          UI.setButtonLoading($btn, false);
        });
    });
  }

  // -------------------------------------------------------------------------
  // SETTINGS & HUMAN-FRIENDLY CAMPUS DATA OVERVIEW / EXPORTER
  // -------------------------------------------------------------------------
  function updateSettingsRecordUI(me, scope) {
    me = me || Store.getState().user || {};
    var prefs = Object.assign({
      show_online_status: true,
      notify_comments: true,
      notify_likes: true,
      notify_messages: true
    }, me.preferences || {});

    var now = new Date();
    var formattedDate = now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    $('#rec-full-name').text(me.full_name || 'Campus Member');
    $('#rec-school-id').text(me.school_id_number || 'Not provided');
    $('#rec-role').text(me.role ? (me.role.charAt(0).toUpperCase() + me.role.slice(1)) : 'Student');
    $('#rec-department').text(me.department || 'Academic Department');
    var yrSec = [me.year_or_grade, me.section].filter(Boolean).join(' - ');
    $('#rec-year-section').text(yrSec || 'General Enrollment');
    $('#rec-email').text(me.email || '—');
    $('#rec-username').text('@' + (me.username || 'user'));

    var onlineActive = prefs.show_online_status !== false;
    $('#rec-presence-status')
      .text(onlineActive ? 'Visible to classmates' : 'Hidden (Private mode)')
      .attr('class', 'record-value ' + (onlineActive ? 'text-success' : 'text-muted'));

    var activeNotifs = [];
    if (prefs.notify_comments !== false) activeNotifs.push('Comments');
    if (prefs.notify_likes !== false) activeNotifs.push('Reactions');
    if (prefs.notify_messages !== false) activeNotifs.push('Messages');
    $('#rec-notify-status').text(activeNotifs.length ? (activeNotifs.length + ' alerts active') : 'All alerts muted');

    $('#rec-snapshot-date').text(formattedDate);

    // Responsive toggle between Academic Profile vs Privacy cards based on user tab selection
    if (scope === 'profile_only') {
      $('#record-card-profile').show();
      $('#record-card-privacy').hide();
    } else if (scope === 'preferences_only') {
      $('#record-card-profile').hide();
      $('#record-card-privacy').show();
    } else {
      $('#record-card-profile').show();
      $('#record-card-privacy').show();
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: $('#account-record-card-view')[0] });
    }
  }

  function mountSettings() {
    var me = Store.getState().user || {};
    var prefs = Object.assign({
      show_online_status: true,
      notify_comments: true,
      notify_likes: true,
      notify_messages: true
    }, me.preferences || {});

    jsonExportScope = 'full';
    var initialJson = JSON.stringify(Store.buildPortableJsonSnapshot('full'), null, 2);

    Templates.renderInto('#main-stage', Templates.VIEWS.SETTINGS)
      .then(function () {
        $('#pref-online-status').prop('checked', Boolean(prefs.show_online_status));
        $('#pref-notify-comments').prop('checked', Boolean(prefs.notify_comments));
        $('#pref-notify-likes').prop('checked', Boolean(prefs.notify_likes));
        $('#pref-notify-messages').prop('checked', Boolean(prefs.notify_messages));
        if (window.UgnayraTheme) {
          window.UgnayraTheme.syncSettingsUI();
        }
        updateSettingsRecordUI(me, 'full');
        $('#settings-json-preview').text(initialJson);
        UI.refreshIcons($('#settings-view-root')[0]);
      })
      .catch(function (err) {
        $('#main-stage').html(UI.renderEmptyState('alert-circle', 'Unable to load settings view', err.message));
        UI.refreshIcons($('#main-stage')[0]);
      });
  }

  // Event Bindings
  $(document).on('click', '#open-edit-profile-btn', openEditProfileModal);

  $(document).on('click', '#modal-upload-avatar-trigger', function (e) {
    e.preventDefault();
    $('#profile-avatar-input').trigger('click');
  });

  $(document).on('click', '.profile-avatar-frame', function (e) {
    var me = Store.getState().user || {};
    var isOwn = Boolean(activeProfile && me && (activeProfile.id === me.id || (activeProfile.username && me.username && activeProfile.username.toLowerCase() === me.username.toLowerCase())));
    if (isOwn && !$(e.target).closest('input, label').length) {
      $('#profile-avatar-input').trigger('click');
    }
  });

  $(document).on('change', '#profile-avatar-input', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    if (window.UGNAYRA_CONFIG.ALLOWED_IMAGE_TYPES.indexOf(file.type) === -1 || file.size > window.UGNAYRA_CONFIG.MAX_UPLOAD_BYTES) {
      UI.toast('Choose a JPEG, PNG, WebP, or GIF image under 5 MB.', 'error');
      return;
    }
    UI.toast('Uploading profile photo...', 'info');
    Services.Profiles.uploadAvatar(file)
      .then(function (res) {
        var updated = (res.data && res.data.profile) || Store.getState().user;
        Store.setState({ user: updated });
        window.UgnayraApp.syncShellAccountCard();
        $('#profile-avatar-slot').html(fmt.renderAvatar(updated, 'avatar-xl', true));
        $('#modal-avatar-preview').html(fmt.renderAvatar(updated, 'avatar-lg', false));
        UI.toast('Profile photo updated!', 'success');
      })
      .catch(function (err) {
        UI.toast(err.message || 'Avatar upload failed.', 'error');
      });
  });

  $(document).on('change', '#profile-cover-input', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    if (window.UGNAYRA_CONFIG.ALLOWED_IMAGE_TYPES.indexOf(file.type) === -1 || file.size > window.UGNAYRA_CONFIG.MAX_UPLOAD_BYTES) {
      UI.toast('Choose a JPEG, PNG, WebP, or GIF image under 5 MB.', 'error');
      return;
    }
    UI.toast('Uploading cover banner...', 'info');
    Services.Profiles.uploadCover(file)
      .then(function (res) {
        var updated = (res.data && res.data.profile) || Store.getState().user;
        Store.setState({ user: updated });
        if (updated && updated.cover_url) {
          $('#profile-cover-el').css('background-image', 'url("' + fmt.resolveMediaUrl(updated.cover_url) + '")');
        }
        UI.toast('Cover photo updated!', 'success');
      })
      .catch(function (err) {
        UI.toast(err.message || 'Cover upload failed.', 'error');
      });
  });

  $(document).on('click', '#save-json-prefs-btn', function () {
    var $btn = $(this);
    var $wrap = $('#settings-prefs-form');
    var prefs = {
      show_online_status: $wrap.find('[name="show_online_status"]').is(':checked'),
      notify_comments: $wrap.find('[name="notify_comments"]').is(':checked'),
      notify_likes: $wrap.find('[name="notify_likes"]').is(':checked'),
      notify_messages: $wrap.find('[name="notify_messages"]').is(':checked')
    };

    UI.setButtonLoading($btn, true, 'Saving...');
    Services.Profiles.updateMe({ preferences: prefs })
      .then(function (res) {
        var me = Store.getState().user || {};
        var updated = (res.data && res.data.profile) || Object.assign({}, me, { preferences: prefs });
        Store.setState({ user: updated });
        updateSettingsRecordUI(updated, jsonExportScope);
        $('#settings-json-preview').text(JSON.stringify(Store.buildPortableJsonSnapshot(jsonExportScope), null, 2));
        UI.toast('Preferences saved successfully!', 'success');
      })
      .catch(function (err) {
        UI.toast(err.message || 'Could not save preferences.', 'error');
      })
      .finally(function () {
        UI.setButtonLoading($btn, false);
      });
  });

  function buildHumanReadableRecordSummary(me, scope) {
    me = me || Store.getState().user || {};
    var prefs = Object.assign({
      show_online_status: true,
      notify_comments: true,
      notify_likes: true,
      notify_messages: true,
      theme: 'system'
    }, me.preferences || {});

    var now = new Date();
    var formattedDate = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    var yrSec = [me.year_or_grade, me.section].filter(Boolean).join(' - ') || 'General Enrollment';
    var roleLabel = me.role ? (me.role.charAt(0).toUpperCase() + me.role.slice(1)) : 'Student';
    var themeLabel = prefs.theme === 'dark' ? 'Midnight Sapphire (Dark)' : (prefs.theme === 'light' ? 'Daylight (Light)' : 'System Match (Auto)');

    var lines = [
      '========================================================================',
      '         UGNAYRA — OFFICIAL CAMPUS ACCOUNT RECORD SUMMARY',
      '            School-Based Social Networking Platform',
      '========================================================================',
      '',
      'Issued Date:        ' + formattedDate,
      'Institutional Role: ' + roleLabel,
      'Campus Status:      Verified & Protected',
      ''
    ];

    if (scope === 'full' || scope === 'profile_only') {
      lines.push(
        '------------------------------------------------------------------------',
        '1. UNIVERSITY ACADEMIC & ENROLLMENT DETAILS',
        '------------------------------------------------------------------------',
        '  • Full Name:            ' + (me.full_name || 'Campus Member'),
        '  • Student ID Number:    ' + (me.school_id_number || 'N/A'),
        '  • Campus Role:          ' + roleLabel,
        '  • Program / Department: ' + (me.department || 'Academic Department'),
        '  • Year & Section:       ' + yrSec,
        '  • Institutional Email:  ' + (me.email || '—'),
        '  • Campus Username:      @' + (me.username || 'user'),
        '  • About / Biography:    ' + (me.bio ? me.bio : '(No bio provided)'),
        ''
      );
    }

    if (scope === 'full' || scope === 'preferences_only') {
      lines.push(
        '------------------------------------------------------------------------',
        '2. CAMPUS PRIVACY, NOTIFICATION & SECURITY STATUS',
        '------------------------------------------------------------------------',
        '  • Online Presence:      ' + (prefs.show_online_status !== false ? 'Visible to classmates' : 'Hidden (Private mode)'),
        '  • Comment Alerts:       ' + (prefs.notify_comments !== false ? 'Enabled' : 'Disabled'),
        '  • Reaction Alerts:      ' + (prefs.notify_likes !== false ? 'Enabled' : 'Disabled'),
        '  • Direct Message Alerts:' + (prefs.notify_messages !== false ? 'Enabled' : 'Disabled'),
        '  • Visual Theme:         ' + themeLabel,
        '  • Account Security:     Encrypted & Protected (Argon2 / Bcrypt)',
        '  • Account Portability:  Ready for Download / Verified',
        ''
      );
    }

    lines.push(
      '========================================================================',
      '       UGNAYRA — School-Based Social Networking Platform',
      '========================================================================'
    );

    return lines.join('\r\n');
  }

  $(document).on('click', '.js-json-scope', function () {
    $('.js-json-scope').removeClass('is-active');
    $(this).addClass('is-active');
    jsonExportScope = $(this).attr('data-scope') || 'full';
    var me = Store.getState().user || {};
    updateSettingsRecordUI(me, jsonExportScope);
    $('#settings-json-preview').text(JSON.stringify(Store.buildPortableJsonSnapshot(jsonExportScope), null, 2));
  });

  $(document).on('click', '#copy-json-snapshot-btn', function () {
    var me = Store.getState().user || {};
    var humanSummary = buildHumanReadableRecordSummary(me, jsonExportScope);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(humanSummary).then(function () {
        UI.toast('Official account record summary copied to clipboard.', 'success');
      });
    } else {
      UI.toast('Official record summary is ready to export.', 'info');
    }
  });

  $(document).on('click', '#download-json-snapshot-btn', function () {
    var me = Store.getState().user || {};
    var humanSummary = buildHumanReadableRecordSummary(me, jsonExportScope);
    var blob = new Blob([humanSummary], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var username = me.username || 'user';
    a.href = url;
    a.download = 'ugnayra-account-record-' + username + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    UI.toast('Official account record document downloaded (.txt).', 'success');
  });

  window.UgnayraProfileModule = {
    mountProfile: mountProfile,
    mountSettings: mountSettings
  };
})(window, window.jQuery);
