/**
 * UGNAYRA — School Communities Controller
 * Mounts src/pages/communities/communities.html & src/pages/communities/detail.html
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

  var commState = {
    filter: 'all',
    activeCommunity: null,
    detailTab: 'feed'
  };

  function categoryLabel(cat) {
    var map = {
      academic: 'Academic Course',
      department: 'Department',
      organization: 'Student Org',
      study_group: 'Study Group',
      campus_life: 'Campus Life'
    };
    return map[cat] || 'Academic';
  }

  function renderCommunityCard(c) {
    var bannerStyle = c.banner_url
      ? 'style="background-image:url(\'' + fmt.escapeHtml(fmt.resolveMediaUrl(c.banner_url)) + '\');"'
      : '';
    var slugOrId = c.slug || c.id;

    return (
      '<article class="community-card" data-community-id="' + fmt.escapeHtml(c.id) + '">' +
        '<div class="community-card-banner" ' + bannerStyle + '></div>' +
        '<div class="community-card-body">' +
          '<div class="flex items-center justify-between gap-2">' +
            '<span class="badge badge-category">' + fmt.escapeHtml(categoryLabel(c.category)) + '</span>' +
            '<span class="text-xs-muted tabular-nums">' + Number(c.members_count || 0) + ' members</span>' +
          '</div>' +
          '<a href="/communities/' + fmt.escapeHtml(slugOrId) + '" class="heading-md mt-2" style="text-decoration:none;">' +
            fmt.escapeHtml(c.name) +
          '</a>' +
          '<p class="text-secondary line-clamp-2 flex-1">' +
            fmt.escapeHtml(c.description || 'Campus academic community space.') +
          '</p>' +
          '<div class="flex items-center justify-between gap-2 mt-3" style="padding-top:10px;border-top:1px solid var(--color-border-subtle);">' +
            '<a href="/communities/' + fmt.escapeHtml(slugOrId) + '" class="btn btn-secondary btn-sm">View Space</a>' +
            (c.is_member
              ? '<button type="button" class="btn btn-soft btn-sm js-leave-community" data-community-id="' + fmt.escapeHtml(c.id) + '">Joined</button>'
              : '<button type="button" class="btn btn-primary btn-sm js-join-community" data-community-id="' + fmt.escapeHtml(c.id) + '">Join</button>') +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function mountDirectory() {
    commState.activeCommunity = null;
    commState.filter = 'all';
    return Templates.renderInto('#main-stage', Templates.VIEWS.COMMUNITIES).then(function () {
      $('#communities-grid').html(UI.renderPostSkeletons(2));
      loadDirectoryList();
    });
  }

  function loadDirectoryList() {
    var $grid = $('#communities-grid');
    if (!$grid.length) return;
    Services.Communities.list({ filter: commState.filter, limit: 40 })
      .then(function (res) {
        var items = (res.data && res.data.items) || [];
        if (!items.length) {
          $grid.html(UI.renderEmptyState({
            icon: 'users',
            title: 'No Communities in This Category Yet',
            description: 'Create a community space for your academic college, student council, program section, or university club.',
            ctaHtml: '<button type="button" class="btn btn-primary" id="empty-create-community-btn"><i data-lucide="plus"></i><span>Create Community</span></button>',
            tip: 'Academic communities let you collaborate with classmates and share study resources.',
            apiBadge: 'BulSU Student Hub'
          }));
        } else {
          $grid.addClass('cards-grid-2').html(items.map(renderCommunityCard).join(''));
        }
        UI.refreshIcons($grid[0]);
      })
      .catch(function (err) {
        $grid.removeClass('cards-grid-2').html(UI.renderEmptyState('alert-circle', 'Could not load communities', err.message));
        UI.refreshIcons($grid[0]);
      });
  }

  function mountCommunityDetail(slugOrId) {
    commState.detailTab = 'feed';
    return Templates.renderInto('#main-stage', Templates.VIEWS.COMMUNITY_DETAIL).then(function () {
      $('#comm-tab-content').html(UI.renderPostSkeletons(2));
      return Services.Communities.get(slugOrId);
    })
      .then(function (res) {
        var c = res.data && res.data.community;
        if (!c) throw new Error('Community not found.');
        commState.activeCommunity = c;
        populateCommunityDetail(c);
        loadCommunityTabContent();
      })
      .catch(function (err) {
        $('#main-stage').html(UI.renderEmptyState(
          'users',
          'Community unavailable',
          err.message || 'This community could not be loaded.',
          '<a href="/communities" class="btn btn-primary btn-sm">Back to Communities</a>'
        ));
        UI.refreshIcons($('#main-stage')[0]);
      });
  }

  function populateCommunityDetail(c) {
    var me = Store.getState().user || {};
    var canPostNotice = c.member_role === 'admin' || c.member_role === 'moderator' || me.role === 'teacher' || me.role === 'personnel';

    if (c.banner_url) {
      $('#comm-detail-cover').css('background-image', 'url("' + fmt.resolveMediaUrl(c.banner_url) + '")');
    }
    $('#comm-detail-category').text(categoryLabel(c.category));
    $('#comm-detail-counts').text(Number(c.members_count || 0) + ' members · ' + Number(c.posts_count || 0) + ' posts');
    $('#comm-detail-name').text(c.name);
    $('#comm-members-tab-btn').text('Members (' + Number(c.members_count || 0) + ')');
    if (UI.enhanceResponsiveFilterTabs) {
      UI.enhanceResponsiveFilterTabs('#main-stage');
    }

    if (c.description) {
      $('#comm-detail-description').text(c.description).removeClass('hidden');
    }
    if (c.rules) {
      $('#comm-detail-rules').text(c.rules);
      $('#comm-detail-rules-box').removeClass('hidden');
    }

    $('#comm-detail-membership-action').html(
      c.is_member
        ? '<button type="button" class="btn btn-secondary btn-sm js-leave-community" data-community-id="' + fmt.escapeHtml(c.id) + '" data-reload-detail="1">Leave Community</button>'
        : '<button type="button" class="btn btn-primary btn-sm js-join-community" data-community-id="' + fmt.escapeHtml(c.id) + '" data-reload-detail="1">Join Community</button>'
    );

    var composerHtml = c.is_member
      ? '<section class="composer-card">' +
          '<form id="community-composer-form" data-community-id="' + fmt.escapeHtml(c.id) + '" novalidate>' +
            '<div class="composer-top">' +
              fmt.renderAvatar(me, 'avatar-md', false) +
              '<div class="flex-1">' +
                '<textarea id="comm-composer-text" class="composer-textarea" rows="3" maxlength="5000" ' +
                  'placeholder="Post a discussion or resource in ' + fmt.escapeHtml(c.name) + '..."></textarea>' +
              '</div>' +
            '</div>' +
            '<div class="composer-toolbar">' +
              '<div>' +
                (canPostNotice
                  ? '<label class="inline-flex items-center gap-2 text-xs-muted" style="cursor:pointer;font-weight:600;color:var(--color-navy-900);">' +
                      '<input type="checkbox" id="comm-post-is-announcement" />' +
                      '<span>Publish as Community Notice</span>' +
                    '</label>'
                  : '<span class="text-xs-muted">Posting to ' + fmt.escapeHtml(c.name) + '</span>') +
              '</div>' +
              '<button type="submit" class="btn btn-primary btn-sm" id="comm-post-submit-btn">' +
                '<i data-lucide="send" class="icon-xs"></i><span>Post to Community</span>' +
              '</button>' +
            '</div>' +
          '</form>' +
        '</section>'
      : '<div class="panel mb-4" style="padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;">' +
          '<span class="text-secondary">Join <strong>' + fmt.escapeHtml(c.name) + '</strong> to participate in discussions.</span>' +
          '<button type="button" class="btn btn-primary btn-sm js-join-community" data-community-id="' + fmt.escapeHtml(c.id) + '" data-reload-detail="1">Join Space</button>' +
        '</div>';

    $('#comm-composer-slot').html(composerHtml);
    UI.refreshIcons($('#community-detail-root')[0]);
  }

  function loadCommunityTabContent() {
    var c = commState.activeCommunity;
    if (!c) return;
    var $slot = $('#comm-tab-content');
    $slot.html(UI.renderPostSkeletons(2));

    if (commState.detailTab === 'members') {
      $('#comm-composer-slot').addClass('hidden');
      Services.Communities.members(c.id, { limit: 60 })
        .then(function (res) {
          var items = (res.data && res.data.items) || [];
          if (!items.length) {
            $slot.html(UI.renderEmptyState('users', 'No members found', ''));
            UI.refreshIcons($slot[0]);
            return;
          }
          var html = '<div class="panel" style="padding:8px 16px;">' +
            items.map(function (m) {
              return (
                '<div class="flex items-center justify-between gap-3" style="padding:10px 0;border-bottom:1px solid var(--color-border-subtle);">' +
                  '<a href="/profile/' + fmt.escapeHtml(m.username || m.id) + '" class="flex items-center gap-3 min-w-0" style="text-decoration:none;">' +
                    fmt.renderAvatar(m, 'avatar-sm', true) +
                    '<div class="min-w-0">' +
                      '<div class="text-sm truncate" style="font-weight:600;color:var(--color-ink-900);">' + fmt.escapeHtml(m.full_name) + '</div>' +
                      '<div class="text-xs-muted truncate">@' + fmt.escapeHtml(m.username) + ' · ' + fmt.escapeHtml(m.department || fmt.roleLabel(m.role)) + '</div>' +
                    '</div>' +
                  '</a>' +
                  '<div class="flex items-center gap-2">' +
                    fmt.roleBadgeHtml(m.role) +
                    (m.member_role === 'admin' ? '<span class="badge badge-important">Admin</span>' : '') +
                  '</div>' +
                '</div>'
              );
            }).join('') +
          '</div>';
          $slot.html(html);
          UI.refreshIcons($slot[0]);
        })
        .catch(function (err) {
          $slot.html('<p class="form-error">' + fmt.escapeHtml(err.message) + '</p>');
        });
      return;
    }

    $('#comm-composer-slot').removeClass('hidden');
    var onlyNotices = commState.detailTab === 'announcements' ? '1' : '';
    Services.Communities.posts(c.id, { announcements_only: onlyNotices, limit: 20 })
      .then(function (res) {
        var items = (res.data && res.data.items) || [];
        if (!items.length) {
          $slot.html(UI.renderEmptyState(
            commState.detailTab === 'announcements' ? 'megaphone' : 'message-square',
            commState.detailTab === 'announcements' ? 'No community notices yet' : 'No discussions yet',
            'Start the first thread in ' + c.name + '.'
          ));
        } else {
          $slot.html('<div class="post-stream">' + items.map(PostCard.render).join('') + '</div>');
        }
        UI.refreshIcons($slot[0]);
      })
      .catch(function (err) {
        $slot.html('<p class="form-error">' + fmt.escapeHtml(err.message) + '</p>');
      });
  }

  function openCreateCommunityModal() {
    var $modal = UI.openModal({
      title: 'Create School Community',
      bodyHtml:
        '<form id="create-community-form" novalidate>' +
          '<div class="form-group">' +
            '<label class="form-label" for="comm-name">Community Name</label>' +
            '<input type="text" id="comm-name" name="name" class="form-input" placeholder="Enter community name" maxlength="120" required />' +
            '<div class="form-error"></div>' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label" for="comm-category">Category</label>' +
            '<select id="comm-category" name="category" class="form-select">' +
              '<option value="academic">Academic Course</option>' +
              '<option value="department">Department</option>' +
              '<option value="organization">Student Organization</option>' +
              '<option value="study_group">Study Group</option>' +
              '<option value="campus_life">Campus Life</option>' +
            '</select>' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label" for="comm-desc">Description</label>' +
            '<textarea id="comm-desc" name="description" class="form-textarea" rows="3" maxlength="1000" ' +
              'placeholder="Describe who this community is for and what members collaborate on..."></textarea>' +
            '<div class="form-error"></div>' +
          '</div>' +
          '<div class="form-group" style="margin-bottom:0;">' +
            '<label class="form-label" for="comm-rules">Community Guidelines <span class="form-label-optional">Optional</span></label>' +
            '<textarea id="comm-rules" name="rules" class="form-textarea" rows="2" maxlength="2000" ' +
              'placeholder="Enter community guidelines..."></textarea>' +
          '</div>' +
        '</form>',
      footerHtml:
        '<button type="button" class="btn btn-secondary js-close-modal">Cancel</button>' +
        '<button type="button" class="btn btn-primary" id="submit-create-community-btn">Create Space</button>'
    });

    $modal.on('click', '#submit-create-community-btn', function () {
      var $btn = $(this);
      var $form = $modal.find('#create-community-form');
      var check = Validator.validateForm($form, {
        name: { required: true, minLength: 3, maxLength: 120 },
        category: { required: true },
        description: { required: true, minLength: 10, maxLength: 1000 },
        rules: { maxLength: 2000 }
      });
      if (!check.valid) return;

      UI.setButtonLoading($btn, true, 'Creating...');
      Services.Communities.create(check.values)
        .then(function (res) {
          UI.closeModal();
          UI.toast('Community created!', 'success');
          var c = res.data && res.data.community;
          if (c && (c.slug || c.id)) {
            window.UgnayraApp.navigate('/communities/' + (c.slug || c.id));
          } else {
            loadDirectoryList();
          }
        })
        .catch(function (err) {
          if (err.details) Validator.applyServerValidationErrors($form, err.details);
          UI.toast(err.message || 'Could not create community.', 'error');
        })
        .finally(function () {
          UI.setButtonLoading($btn, false);
        });
    });
  }

  $(document).on('click', '#open-create-community-btn, #empty-create-community-btn', openCreateCommunityModal);

  $(document).on('click', '.js-comm-filter', function () {
    $('.js-comm-filter').removeClass('is-active');
    $(this).addClass('is-active');
    commState.filter = $(this).attr('data-filter') || 'all';
    loadDirectoryList();
  });

  $(document).on('click', '.js-comm-detail-tab', function () {
    $('.js-comm-detail-tab').removeClass('is-active');
    $(this).addClass('is-active');
    commState.detailTab = $(this).attr('data-tab') || 'feed';
    loadCommunityTabContent();
  });

  $(document).on('click', '.js-join-community', function () {
    var $btn = $(this);
    var cid = $btn.attr('data-community-id');
    var reloadDetail = $btn.attr('data-reload-detail') === '1';
    UI.setButtonLoading($btn, true);

    Services.Communities.join(cid)
      .then(function () {
        UI.toast('Joined community!', 'success');
        if (reloadDetail && commState.activeCommunity) {
          mountCommunityDetail(commState.activeCommunity.slug || cid);
        } else {
          loadDirectoryList();
        }
      })
      .catch(function (err) {
        UI.setButtonLoading($btn, false);
        UI.toast(err.message || 'Could not join community.', 'error');
      });
  });

  $(document).on('click', '.js-leave-community', function () {
    var cid = $(this).attr('data-community-id');
    var reloadDetail = $(this).attr('data-reload-detail') === '1';

    UI.confirm({
      title: 'Leave Community',
      message: 'Are you sure you want to leave this community?',
      confirmLabel: 'Leave',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      Services.Communities.leave(cid)
        .then(function () {
          UI.toast('Left community.', 'info');
          if (reloadDetail) mountCommunityDetail(cid);
          else loadDirectoryList();
        })
        .catch(function (err) {
          UI.toast(err.message || 'Unable to leave community.', 'error');
        });
    });
  });

  $(document).on('submit', '#community-composer-form', function (e) {
    e.preventDefault();
    var cid = $(this).attr('data-community-id');
    var content = ($('#comm-composer-text').val() || '').trim();
    var isAnnouncement = $('#comm-post-is-announcement').is(':checked');
    if (!content) {
      UI.toast('Enter your message before posting.', 'warning');
      return;
    }

    var $btn = $('#comm-post-submit-btn');
    UI.setButtonLoading($btn, true, 'Posting...');

    Services.Communities.createPost(cid, {
      content: content,
      is_announcement: isAnnouncement
    })
      .then(function () {
        $('#comm-composer-text').val('');
        $('#comm-post-is-announcement').prop('checked', false);
        UI.toast('Posted to community!', 'success');
        loadCommunityTabContent();
      })
      .catch(function (err) {
        UI.toast(err.message || 'Could not publish community post.', 'error');
      })
      .finally(function () {
        UI.setButtonLoading($btn, false);
      });
  });

  window.UgnayraCommunitiesModule = {
    mount: function (param) {
      if (param) return mountCommunityDetail(param);
      return mountDirectory();
    },
    renderCommunityCard: renderCommunityCard
  };
})(window, window.jQuery);
