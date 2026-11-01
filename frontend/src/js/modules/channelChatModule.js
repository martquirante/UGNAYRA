/**
 * UGNAYRA — Academic Group Channels & Section GC Controller
 * Handles Section GCs, Subject GCs, Personal Groups, Cryptographic Invite Links,
 * Open/Closed Access Policies & Join Request Approvals.
 */
(function (window, $) {
  'use strict';

  var Services = window.UgnayraServices;
  var Store = window.UgnayraStore;
  var UI = window.UgnayraUI;
  var escapeHtml = window.UgnayraEscape ? window.UgnayraEscape.escapeHtml : function (s) { return s || ''; };

  var channelState = {
    groups: [],
    activeGroupId: null,
    members: [],
    joinRequests: []
  };

  function loadUserGroups() {
    return Services.Groups.list()
      .then(function (res) {
        channelState.groups = (res && res.data && res.data.groups) || [];
        renderGroupsSidebar();
        return channelState.groups;
      })
      .catch(function () {
        return [];
      });
  }

  function renderGroupsSidebar() {
    var $box = $('#channel-groups-list');
    if (!$box.length) return;

    if (channelState.groups.length === 0) {
      $box.html('<p class="text-xs text-muted p-3">No group chats yet.</p>');
      return;
    }

    var html = channelState.groups.map(function (g) {
      var name = escapeHtml(g.name || 'Group Chat');
      var type = g.type || 'personal';
      var badge = type === 'section' ? 'Section GC' : (type === 'subject' ? 'Subject' : 'Group');
      var active = g.id === channelState.activeGroupId ? 'is-active' : '';

      return (
        '<button type="button" class="channel-group-item ' + active + ' js-select-channel-group" data-id="' + g.id + '">' +
          '<div class="flex items-center gap-2">' +
            '<i data-lucide="' + (type === 'section' ? 'users' : 'messages-square') + '" class="icon-sm text-gold"></i>' +
            '<span class="font-semibold text-xs truncate">' + name + '</span>' +
          '</div>' +
          '<span class="badge badge-secondary text-xs">' + badge + '</span>' +
        '</button>'
      );
    }).join('');

    $box.html(html);
    UI.refreshIcons($box[0]);
  }

  function openInviteLinkModal(groupId) {
    Services.Groups.getInviteLink(groupId)
      .then(function (res) {
        var link = (res && res.data && res.data.invite_url) || window.location.origin + '/join-group/' + groupId;
        var isOpen = res && res.data && res.data.is_open;

        var modalHtml = (
          '<div class="ug-modal" id="group-invite-modal" role="dialog">' +
            '<div class="ug-modal-backdrop js-close-invite-modal"></div>' +
            '<div class="ug-modal-dialog">' +
              '<div class="ug-modal-header">' +
                '<div class="modal-title-wrap">' +
                  '<i data-lucide="link" class="icon-md text-primary"></i>' +
                  '<h2 class="heading-md">Group Invite Link</h2>' +
                '</div>' +
                '<button type="button" class="btn-icon-subtle js-close-invite-modal"><i data-lucide="x" class="icon-sm"></i></button>' +
              '</div>' +
              '<div class="ug-modal-body">' +
                '<p class="text-sm text-secondary mb-3">Share this cryptographic invite link with classmates or students to join this group chat.</p>' +
                '<div class="input-wrapper mb-3">' +
                  '<input type="text" id="group-invite-link-val" class="form-input text-xs font-mono" value="' + escapeHtml(link) + '" readonly />' +
                '</div>' +
                '<div class="flex items-center justify-between p-2 card-subtle rounded mb-2">' +
                  '<div>' +
                    '<div class="font-semibold text-xs">Direct Access (Open Link)</div>' +
                    '<div class="text-xs text-muted">When open, students join immediately without approval.</div>' +
                  '</div>' +
                  '<input type="checkbox" id="group-open-toggle" ' + (isOpen ? 'checked' : '') + ' data-id="' + groupId + '" />' +
                '</div>' +
              '</div>' +
              '<div class="ug-modal-footer">' +
                '<button type="button" class="btn btn-secondary js-close-invite-modal">Close</button>' +
                '<button type="button" class="btn btn-primary" id="btn-copy-group-invite-link">' +
                  '<i data-lucide="copy" class="icon-xs"></i><span>Copy Link</span>' +
                '</button>' +
              '</div>' +
            '</div>' +
          '</div>'
        );

        $('body').append(modalHtml);
        UI.refreshIcons($('#group-invite-modal')[0]);
      })
      .catch(function (err) {
        UI.toast(err.message || 'Failed to fetch invite link.', 'error');
      });
  }

  // Global event bindings
  $(document).on('click', '.js-close-invite-modal', function () {
    $('#group-invite-modal').remove();
  });

  $(document).on('click', '#btn-copy-group-invite-link', function () {
    var link = $('#group-invite-link-val').val();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(function () {
        UI.toast('Group invite link copied to clipboard!', 'success');
      });
    }
  });

  $(document).on('change', '#group-open-toggle', function () {
    var gid = $(this).attr('data-id');
    var isChecked = $(this).is(':checked');
    Services.Groups.updateAccess(gid, { is_open: isChecked })
      .then(function () {
        UI.toast(isChecked ? 'Group is now Open.' : 'Group is now Closed (Requires approval).', 'info');
      })
      .catch(function () {});
  });

  window.UgnayraChannelChat = {
    loadUserGroups: loadUserGroups,
    openInviteLinkModal: openInviteLinkModal
  };
})(window, window.jQuery);
