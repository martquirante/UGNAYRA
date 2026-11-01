/**
 * UGNAYRA — Unified Notifications Module
 * Displays likes, comments, shares, messages, community updates & school advisories.
 */
(function (window, $) {
  'use strict';

  var fmt = window.UgnayraFormat;
  var UI = window.UgnayraUI;
  var Services = window.UgnayraServices;
  var Store = window.UgnayraStore;
  var Templates = window.UgnayraTemplates;

  var notifFilter = 'all';

  function iconForType(type) {
    if (type === 'post_like') return { icon: 'heart', cls: 'type-like' };
    if (type === 'post_comment') return { icon: 'message-square', cls: '' };
    if (type === 'new_message') return { icon: 'mail', cls: '' };
    if (type === 'school_announcement' || type === 'community_announcement') {
      return { icon: 'megaphone', cls: 'type-announcement' };
    }
    return { icon: 'bell', cls: '' };
  }

  function targetHashForNotification(n) {
    if (n.type === 'new_message' || n.entity_type === 'conversation') {
      return '#messages/' + encodeURIComponent(n.entity_id);
    }
    if (n.type === 'school_announcement' || n.entity_type === 'announcement') {
      return '#announcements';
    }
    if (n.entity_type === 'community') {
      return '#communities/' + encodeURIComponent(n.entity_id);
    }
    return '#feed';
  }

  function renderNotificationRow(n) {
    var meta = iconForType(n.type);
    return (
      '<div class="notification-item ' + (n.is_read ? '' : 'is-unread') + ' js-open-notification" ' +
        'data-notif-id="' + fmt.escapeHtml(n.id) + '" ' +
        'data-is-read="' + (n.is_read ? '1' : '0') + '" ' +
        'data-target-hash="' + fmt.escapeHtml(targetHashForNotification(n)) + '">' +
        '<div class="notification-type-icon ' + meta.cls + '">' +
          '<i data-lucide="' + meta.icon + '" class="icon-sm"></i>' +
        '</div>' +
        '<div class="flex-1 min-w-0">' +
          '<div class="flex items-center justify-between gap-2">' +
            '<span class="text-sm" style="font-weight:' + (n.is_read ? '500' : '700') + ';color:var(--color-ink-900);">' +
              fmt.escapeHtml(n.title) +
            '</span>' +
            '<span class="text-xs-muted">' + fmt.escapeHtml(fmt.timeAgo(n.created_at)) + '</span>' +
          '</div>' +
          (n.preview ? '<p class="text-secondary truncate mt-2" style="margin-top:2px;">' + fmt.escapeHtml(n.preview) + '</p>' : '') +
        '</div>' +
        (!n.is_read
          ? '<span style="width:8px;height:8px;border-radius:999px;background:var(--color-blue-700);margin-top:6px;flex-shrink:0;" title="Unread"></span>'
          : '') +
      '</div>'
    );
  }

  function loadNotifications() {
    var $box = $('#notifications-list-panel');
    if (!$box.length) return;
    $box.html('<div style="padding:20px;" class="text-xs-muted">Loading notifications...</div>');

    Services.Notifications.list({ filter: notifFilter, limit: 40 })
      .then(function (res) {
        var items = (res.data && res.data.items) || [];
        if (typeof (res.data && res.data.unread_count) === 'number') {
          Store.setState({ unreadNotifications: res.data.unread_count });
        }
        if (!items.length) {
          $box.html(UI.renderEmptyState({
            icon: 'notifications',
            title: notifFilter === 'unread' ? 'You are All Caught Up!' : 'No Campus Notifications Yet',
            description: notifFilter === 'unread'
              ? 'There are zero unread activity alerts in your feed. New assignments, grades, and mentions will notify you here.'
              : 'Interactions on your posts, direct messages, and campus advisories will appear in this notification center.',
            tip: 'You can customize your notification preferences anytime in Settings.'
          }));
        } else {
          $box.html('<div class="panel" style="overflow:hidden;">' + items.map(renderNotificationRow).join('') + '</div>');
        }
        UI.refreshIcons($box[0]);
      })
      .catch(function (err) {
        $box.html(UI.renderEmptyState('alert-circle', 'Could not load notifications', err.message));
        UI.refreshIcons($box[0]);
      });
  }

  function mount() {
    notifFilter = 'all';
    Templates.renderInto('#main-stage', Templates.VIEWS.NOTIFICATIONS)
      .then(function () {
        loadNotifications();
      })
      .catch(function (err) {
        $('#main-stage').html(UI.renderEmptyState('alert-circle', 'Unable to load notifications view', err.message));
        UI.refreshIcons($('#main-stage')[0]);
      });
  }

  $(document).on('click', '.js-notif-filter', function () {
    $('.js-notif-filter').removeClass('is-active');
    $(this).addClass('is-active');
    notifFilter = $(this).attr('data-filter') || 'all';
    loadNotifications();
  });

  $(document).on('click', '#mark-all-notifs-read-btn', function () {
    var $btn = $(this);
    UI.setButtonLoading($btn, true);
    Services.Notifications.markAllRead()
      .then(function () {
        Store.setState({ unreadNotifications: 0 });
        loadNotifications();
        UI.toast('All notifications marked as read.', 'success');
      })
      .catch(function (err) {
        UI.toast(err.message || 'Could not update notifications.', 'error');
      })
      .finally(function () {
        UI.setButtonLoading($btn, false);
      });
  });

  $(document).on('click', '.js-open-notification', function () {
    var $row = $(this);
    var id = $row.attr('data-notif-id');
    var wasUnread = $row.attr('data-is-read') === '0';
    var targetHash = $row.attr('data-target-hash') || '#feed';

    if (wasUnread) {
      Store.setState({ unreadNotifications: Math.max(0, Store.getState().unreadNotifications - 1) });
      Services.Notifications.markRead(id).catch(function () {});
    }
    if (window.UgnayraApp && typeof window.UgnayraApp.navigate === 'function') {
      window.UgnayraApp.navigate(targetHash);
    } else {
      window.location.hash = targetHash;
    }
  });

  window.UgnayraNotificationsModule = {
    mount: mount
  };
})(window, window.jQuery);
