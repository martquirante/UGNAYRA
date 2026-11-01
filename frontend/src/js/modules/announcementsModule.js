/**
 * UGNAYRA — Official School Announcements Module
 * Role-gated publishing for Teachers & School Personnel; viewable by all students.
 */
(function (window, $) {
  'use strict';

  var fmt = window.UgnayraFormat;
  var UI = window.UgnayraUI;
  var Validator = window.UgnayraValidator;
  var Services = window.UgnayraServices;
  var Store = window.UgnayraStore;
  var Templates = window.UgnayraTemplates;

  var annState = {
    category: 'all'
  };

  function categoryDisplay(cat) {
    var labels = {
      academic: 'Academic',
      campus_events: 'Campus Events',
      administrative: 'Administrative',
      urgent_notice: 'Urgent Notice',
      student_affairs: 'Student Affairs'
    };
    return labels[cat] || 'Academic';
  }

  function renderAnnouncementCard(a) {
    var me = Store.getState().user || {};
    var author = a.author || {};
    var canManage = me.role === 'personnel' || (me.role === 'teacher' && (me.id === a.author_id || me.id === author.id));
    var priority = a.priority || 'normal';
    var badgeHtml = priority === 'urgent'
      ? '<span class="badge badge-urgent"><i data-lucide="alert-octagon" class="icon-xs"></i>Urgent</span>'
      : (priority === 'important'
          ? '<span class="badge badge-important"><i data-lucide="star" class="icon-xs"></i>Important</span>'
          : '<span class="badge badge-category">Standard</span>');

    return (
      '<article class="announcement-card priority-' + fmt.escapeHtml(priority) + '" data-announcement-id="' + fmt.escapeHtml(a.id) + '">' +
        '<div class="flex items-center justify-between gap-2 flex-wrap mb-2">' +
          '<div class="flex items-center gap-2 flex-wrap">' +
            (a.is_pinned ? '<span class="badge badge-important"><i data-lucide="pin" class="icon-xs"></i>Pinned</span>' : '') +
            badgeHtml +
            '<span class="badge badge-category">' + fmt.escapeHtml(categoryDisplay(a.category)) + '</span>' +
            (a.target_department ? '<span class="text-xs-muted">· Target: ' + fmt.escapeHtml(a.target_department) + '</span>' : '') +
          '</div>' +
          (canManage
            ? '<button type="button" class="btn-icon js-delete-announcement" data-announcement-id="' + fmt.escapeHtml(a.id) + '" title="Delete bulletin" aria-label="Delete bulletin">' +
                '<i data-lucide="trash-2" class="icon-sm"></i>' +
              '</button>'
            : '') +
        '</div>' +

        '<h2 class="heading-lg mt-2">' + fmt.escapeHtml(a.title) + '</h2>' +
        '<div class="text-body mt-3" style="white-space:pre-wrap;">' + fmt.formatPostContent(a.body) + '</div>' +

        '<div class="flex items-center justify-between gap-3 flex-wrap mt-4" style="padding-top:12px;border-top:1px solid var(--color-border-subtle);">' +
          '<div class="flex items-center gap-2">' +
            fmt.renderAvatar(author, 'avatar-xs', false) +
            '<span class="text-xs-muted"><strong style="color:var(--color-ink-900);">' + fmt.escapeHtml(author.full_name || 'School Office') + '</strong> · ' +
              fmt.escapeHtml(author.department || fmt.roleLabel(author.role)) +
            '</span>' +
          '</div>' +
          '<time class="text-xs-muted" datetime="' + fmt.escapeHtml(a.published_at || a.created_at) + '">' +
            'Published ' + fmt.escapeHtml(fmt.formatDateTime(a.published_at || a.created_at)) +
          '</time>' +
        '</div>' +
      '</article>'
    );
  }

  function loadAnnouncements() {
    var $list = $('#announcements-list-box');
    if (!$list.length) return;
    $list.html(UI.renderPostSkeletons(2));

    Services.Announcements.list({
      category: annState.category === 'all' ? '' : annState.category,
      limit: 30
    })
      .then(function (res) {
        var items = (res.data && (res.data.items || res.data.announcements)) || [];
        if (!items.length) {
          $list.html(UI.renderEmptyState({
            icon: 'announcements',
            title: 'No Announcements in This Category',
            description: 'Official school advisories, academic circulars, and departmental memos will appear on this bulletin board once published.',
            tip: 'Urgent campus alerts will also highlight directly on your main dashboard.',
            apiBadge: 'BulSU Official Gazette'
          }));
        } else {
          $list.html(items.map(renderAnnouncementCard).join(''));
        }
        UI.refreshIcons($list[0]);
      })
      .catch(function (err) {
        $list.html(UI.renderEmptyState('alert-circle', 'Unable to load announcements', err.message));
        UI.refreshIcons($list[0]);
      });
  }

  function openPublishAnnouncementModal() {
    var me = Store.getState().user || {};
    var $modal = UI.openModal({
      title: 'Publish Official School Announcement',
      size: 'lg',
      bodyHtml:
        '<form id="publish-announcement-form" novalidate>' +
          '<div class="form-group">' +
            '<label class="form-label" for="ann-title">Headline / Subject</label>' +
            '<input type="text" id="ann-title" name="title" class="form-input" maxlength="180" ' +
              'placeholder="Enter announcement headline" required />' +
            '<div class="form-error"></div>' +
          '</div>' +
          '<div class="form-row-2">' +
            '<div class="form-group">' +
              '<label class="form-label" for="ann-category">Category</label>' +
              '<select id="ann-category" name="category" class="form-select">' +
                '<option value="academic">Academic</option>' +
                '<option value="campus_events">Campus Events</option>' +
                '<option value="administrative">Administrative</option>' +
                '<option value="student_affairs">Student Affairs</option>' +
                '<option value="urgent_notice">Urgent Notice</option>' +
              '</select>' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label" for="ann-priority">Priority Indicator</label>' +
              '<select id="ann-priority" name="priority" class="form-select">' +
                '<option value="normal">Standard Notice</option>' +
                '<option value="important">Important Highlight</option>' +
                '<option value="urgent">Urgent Advisory</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label" for="ann-dept">Target Audience / Department <span class="form-label-optional">Optional</span></label>' +
            '<input type="text" id="ann-dept" name="target_department" class="form-input" placeholder="Enter target department or audience" />' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label" for="ann-body">Official Bulletin Details</label>' +
            '<textarea id="ann-body" name="body" class="form-textarea" rows="5" maxlength="10000" ' +
              'placeholder="Provide complete dates, instructions, and point-of-contact details..." required></textarea>' +
            '<div class="form-error"></div>' +
          '</div>' +
          (me.role === 'personnel' || me.role === 'teacher'
            ? '<label class="inline-flex items-center gap-2 text-sm" style="cursor:pointer;font-weight:600;color:var(--color-navy-900);">' +
                '<input type="checkbox" name="is_pinned" />' +
                '<span>Pin to top of Campus Feed & Bulletin Board</span>' +
              '</label>'
            : '') +
        '</form>',
      footerHtml:
        '<button type="button" class="btn btn-secondary js-close-modal">Cancel</button>' +
        '<button type="button" class="btn btn-primary" id="submit-announcement-btn">' +
          '<i data-lucide="megaphone" class="icon-sm"></i><span>Publish Bulletin</span>' +
        '</button>'
    });

    $modal.on('click', '#submit-announcement-btn', function () {
      var $btn = $(this);
      var $form = $modal.find('#publish-announcement-form');
      var check = Validator.validateForm($form, {
        title: { required: true, minLength: 4, maxLength: 180 },
        category: { required: true },
        priority: { required: true },
        target_department: { maxLength: 120 },
        body: { required: true, minLength: 10, maxLength: 10000 },
        is_pinned: {}
      });
      if (!check.valid) return;

      UI.setButtonLoading($btn, true, 'Publishing...');
      Services.Announcements.create(check.values)
        .then(function () {
          UI.closeModal();
          UI.toast('Official announcement published!', 'success');
          loadAnnouncements();
        })
        .catch(function (err) {
          if (err.details) Validator.applyServerValidationErrors($form, err.details);
          UI.toast(err.message || 'Unable to publish announcement.', 'error');
        })
        .finally(function () {
          UI.setButtonLoading($btn, false);
        });
    });
  }

  function mount() {
    annState.category = 'all';
    var me = Store.getState().user || {};
    var canPublish = me.role === 'teacher' || me.role === 'personnel';

    Templates.renderInto('#main-stage', Templates.VIEWS.ANNOUNCEMENTS)
      .then(function () {
        if (canPublish) {
          $('#open-publish-ann-btn').removeClass('hidden');
        } else {
          $('#open-publish-ann-btn').addClass('hidden');
        }
        loadAnnouncements();
      })
      .catch(function (err) {
        $('#main-stage').html(UI.renderEmptyState('alert-circle', 'Unable to load announcements view', err.message));
        UI.refreshIcons($('#main-stage')[0]);
      });
  }

  $(document).on('click', '#open-publish-ann-btn', openPublishAnnouncementModal);

  $(document).on('click', '.js-ann-filter', function () {
    $('.js-ann-filter').removeClass('is-active');
    $(this).addClass('is-active');
    annState.category = $(this).attr('data-category') || 'all';
    loadAnnouncements();
  });

  $(document).on('click', '.js-delete-announcement', function () {
    var id = $(this).attr('data-announcement-id');
    var $card = $(this).closest('.announcement-card');
    UI.confirm({
      title: 'Remove Announcement',
      message: 'Are you sure you want to remove this official bulletin?',
      confirmLabel: 'Remove',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      Services.Announcements.remove(id)
        .then(function () {
          $card.fadeOut(160, function () { $card.remove(); });
          UI.toast('Announcement removed.', 'info');
        })
        .catch(function (err) {
          UI.toast(err.message || 'Could not delete announcement.', 'error');
        });
    });
  });

  window.UgnayraAnnouncementsModule = {
    mount: mount,
    renderAnnouncementCard: renderAnnouncementCard
  };
})(window, window.jQuery);
