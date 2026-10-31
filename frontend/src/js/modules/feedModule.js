/**
 * UGNAYRA — Home & Campus News Feed Controller (Mounts src/pages/feed/feed.html)
 */
(function (window, $) {
  'use strict';

  var fmt = window.UgnayraFormat;
  var UI = window.UgnayraUI;
  var Services = window.UgnayraServices;
  var Store = window.UgnayraStore;
  var PostCard = window.UgnayraPostCard;
  var Templates = window.UgnayraTemplates;

  var feedState = {
    filter: 'all',
    nextCursor: null,
    hasMore: false,
    loading: false,
    composerFiles: [],
    joinedCommunities: []
  };

  function renderComposerPreviews() {
    var $grid = $('#composer-image-previews');
    if (!$grid.length) return;
    if (!feedState.composerFiles.length) {
      $grid.empty().addClass('hidden');
      return;
    }
    var html = feedState.composerFiles.map(function (item, idx) {
      return (
        '<div class="composer-preview-item">' +
          '<img src="' + fmt.escapeHtml(item.previewUrl) + '" alt="Selected upload ' + (idx + 1) + '" />' +
          '<button type="button" class="composer-preview-remove js-remove-composer-img" data-idx="' + idx + '" aria-label="Remove image">' +
            '<i data-lucide="x" class="icon-xs"></i>' +
          '</button>' +
        '</div>'
      );
    }).join('');
    $grid.html(html).removeClass('hidden');
    UI.refreshIcons($grid[0]);
  }

  function clearComposerFiles() {
    feedState.composerFiles.forEach(function (item) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    feedState.composerFiles = [];
    renderComposerPreviews();
  }

  function loadPinnedBulletin() {
    Services.Announcements.list({ limit: 3 })
      .then(function (res) {
        var items = (res.data && res.data.items) || [];
        Store.setState({ pinnedAnnouncements: items });
        renderRightRailBulletins(items);

        var topPinned = items.find(function (a) { return a.is_pinned || a.priority === 'urgent'; }) || items[0];
        var $slot = $('#pinned-bulletin-slot');
        if (!$slot.length || !topPinned) return;

        var isUrgent = topPinned.priority === 'urgent';
        $slot.html(
          '<div class="pinned-bulletin-banner ' + (isUrgent ? 'is-urgent' : '') + '">' +
            '<div class="flex items-start gap-3 flex-1">' +
              '<i data-lucide="' + (isUrgent ? 'alert-octagon' : 'megaphone') + '" class="icon-md" ' +
                'style="margin-top:2px;color:' + (isUrgent ? 'var(--color-red-600)' : 'var(--color-navy-900)') + ';"></i>' +
              '<div class="flex-1">' +
                '<div class="flex items-center gap-2 flex-wrap">' +
                  '<span class="badge ' + (isUrgent ? 'badge-urgent' : 'badge-important') + '">' +
                    (isUrgent ? 'Urgent Advisory' : 'Campus Bulletin') +
                  '</span>' +
                  '<strong class="text-sm" style="color:var(--color-ink-900);">' + fmt.escapeHtml(topPinned.title) + '</strong>' +
                '</div>' +
                '<p class="text-secondary line-clamp-2 mt-2" style="font-size:var(--text-xs);">' + fmt.escapeHtml(topPinned.body) + '</p>' +
              '</div>' +
            '</div>' +
            '<a href="/announcements" class="btn btn-secondary btn-sm">Read</a>' +
          '</div>'
        );
        UI.refreshIcons($slot[0]);
      })
      .catch(function () {});
  }

  function updateComposerDestinationCombo(items) {
    var comboItems = [
      { value: '', label: 'Campus Feed (Everyone)', badge: 'PUBLIC' }
    ];

    (items || []).forEach(function (c) {
      comboItems.push({
        value: c.id,
        label: c.name,
        badge: 'COMMUNITY'
      });
    });

    var $combo = $('#composer-dest-combo');
    if ($combo.length && UI && UI.configureCombobox) {
      UI.configureCombobox($combo, {
        items: comboItems,
        placeholder: 'Campus Feed (Everyone)',
        searchable: false,
        value: $('#composer-community-select').val() || ''
      });
    }
  }

  function loadComposerCommunities() {
    updateComposerDestinationCombo([]);
    Services.Communities.list({ filter: 'joined', limit: 30 })
      .then(function (res) {
        var items = (res.data && res.data.items) || [];
        feedState.joinedCommunities = items;
        updateComposerDestinationCombo(items);
      })
      .catch(function () {});
  }

  function loadPosts(reset) {
    if (feedState.loading) return;
    feedState.loading = true;

    var $list = $('#feed-posts-list');
    var $pag = $('#feed-pagination-slot');
    if (reset) {
      feedState.nextCursor = null;
      $list.html(UI.renderPostSkeletons(3));
      $pag.empty();
    }

    Services.Posts.list({
      filter: feedState.filter,
      cursor: reset ? '' : (feedState.nextCursor || ''),
      limit: 12
    })
      .then(function (res) {
        var items = (res.data && res.data.items) || [];
        var pag = (res.meta && res.meta.pagination) || {};
        feedState.nextCursor = pag.next_cursor || null;
        feedState.hasMore = Boolean(pag.has_more);

        if (reset) {
          Store.setState({ feedCache: items });
          if (!items.length) {
            $list.html(UI.renderEmptyState(
              'newspaper',
              'No posts match this view yet',
              'Be the first to share a campus update, study resource, or discussion question.'
            ));
          } else {
            $list.html(items.map(PostCard.render).join(''));
          }
        } else {
          Store.setState({ feedCache: Store.getState().feedCache.concat(items) });
          $list.append(items.map(PostCard.render).join(''));
        }

        if (feedState.hasMore) {
          $pag.html(
            '<button type="button" class="btn btn-secondary" id="load-more-posts-btn">' +
              '<i data-lucide="chevrons-down" class="icon-sm"></i><span>Load Older Updates</span>' +
            '</button>'
          );
        } else {
          $pag.empty();
        }
        UI.refreshIcons($('#feed-view-root')[0]);
      })
      .catch(function (err) {
        if (reset) {
          $list.html(UI.renderEmptyState(
            'wifi-off',
            'Unable to load the campus feed',
            err.message || 'Check your connection and try refreshing.',
            '<button type="button" class="btn btn-primary btn-sm" id="retry-feed-btn">Retry</button>'
          ));
          UI.refreshIcons($list[0]);
        } else {
          UI.toast(err.message || 'Failed to load more posts.', 'error');
        }
      })
      .finally(function () {
        feedState.loading = false;
      });
  }

  function renderRightRailOnlineContacts(contacts) {
    var $box = $('#right-rail-online-list');
    if (!$box.length) return;
    if (!contacts || !contacts.length) {
      $box.html('<p class="text-xs-muted">No classmates currently active.</p>');
      return;
    }
    var html = contacts.slice(0, 7).map(function (u) {
      return (
        '<div class="flex items-center justify-between gap-2" style="padding:6px 0;">' +
          '<a href="/profile/' + fmt.escapeHtml(u.username || u.id) + '" class="flex items-center gap-2 min-w-0 flex-1" style="text-decoration:none;">' +
            fmt.renderAvatar(u, 'avatar-sm', true) +
            '<div class="flex-1 min-w-0">' +
              '<div class="text-sm truncate" style="font-weight:600;color:var(--color-ink-900);">' + fmt.escapeHtml(u.full_name) + '</div>' +
              '<div class="text-xs-muted truncate">' + fmt.escapeHtml(u.section || u.department || fmt.roleLabel(u.role)) + '</div>' +
            '</div>' +
          '</a>' +
          '<button type="button" class="btn-icon js-quick-message-user" data-user-id="' + fmt.escapeHtml(u.id) + '" ' +
            'title="Message ' + fmt.escapeHtml(u.full_name) + '" aria-label="Message ' + fmt.escapeHtml(u.full_name) + '">' +
            '<i data-lucide="message-circle" class="icon-sm"></i>' +
          '</button>' +
        '</div>'
      );
    }).join('');
    $box.html(html);
    UI.refreshIcons($box[0]);
  }

  function renderRightRailBulletins(items) {
    var $box = $('#right-rail-bulletins-list');
    if (!$box.length) return;
    if (!items || !items.length) {
      $box.html('<p class="text-xs-muted">No recent school announcements.</p>');
      return;
    }
    var html = items.slice(0, 3).map(function (a) {
      var badgeCls = a.priority === 'urgent' ? 'badge-urgent' : (a.priority === 'important' ? 'badge-important' : 'badge-category');
      return (
        '<a href="/announcements" class="flex flex-col gap-1" style="padding:8px 0;border-bottom:1px solid var(--color-border-subtle);text-decoration:none;">' +
          '<div class="flex items-center justify-between gap-2">' +
            '<span class="badge ' + badgeCls + '">' + fmt.escapeHtml(a.priority || 'notice') + '</span>' +
            '<span class="text-xs-muted">' + fmt.escapeHtml(fmt.timeAgo(a.published_at || a.created_at)) + '</span>' +
          '</div>' +
          '<span class="text-sm line-clamp-2" style="font-weight:600;color:var(--color-ink-900);margin-top:2px;">' + fmt.escapeHtml(a.title) + '</span>' +
        '</a>'
      );
    }).join('');
    $box.html(html);
  }

  function hydrateRightRailSuggestions() {
    Services.Communities.list({ filter: 'discover', limit: 4 })
      .then(function (res) {
        var items = (res.data && res.data.items) || [];
        var $box = $('#right-rail-communities-list');
        if (!$box.length) return;
        if (!items.length) {
          $box.html('<p class="text-xs-muted">You have joined all active campus communities.</p>');
          return;
        }
        var html = items.slice(0, 4).map(function (c) {
          return (
            '<div class="flex items-center justify-between gap-2" style="padding:7px 0;border-bottom:1px solid var(--color-border-subtle);">' +
              '<a href="/communities/' + fmt.escapeHtml(c.slug || c.id) + '" class="flex-1 min-w-0" style="text-decoration:none;">' +
                '<div class="text-sm truncate" style="font-weight:600;color:var(--color-ink-900);">' + fmt.escapeHtml(c.name) + '</div>' +
                '<div class="text-xs-muted">' + Number(c.members_count || 0) + ' members</div>' +
              '</a>' +
              (c.is_member
                ? '<a href="/communities/' + fmt.escapeHtml(c.slug || c.id) + '" class="btn btn-soft btn-sm">Open</a>'
                : '<button type="button" class="btn btn-secondary btn-sm js-quick-join-community" data-community-id="' + fmt.escapeHtml(c.id) + '">Join</button>') +
            '</div>'
          );
        }).join('');
        $box.html(html);
      })
      .catch(function () {});
  }

  function mount(mode) {
    feedState.filter = 'all';
    clearComposerFiles();

    return Templates.renderInto('#main-stage', Templates.VIEWS.FEED).then(function () {
      var me = Store.getState().user || {};
      var isHome = mode === 'home';
      $('#feed-page-heading').text(isHome ? 'Campus Home' : 'News Feed');
      $('#feed-page-subheading').text(
        isHome
          ? 'Important school advisories, classmate updates, and active discussions.'
          : 'Chronological updates across departments, faculty, and student communities.'
      );
      $('#composer-author-avatar').html(fmt.renderAvatar(me, 'avatar-md', false));
      var firstName = (me.full_name || 'classmate').split(' ')[0];
      $('#composer-content').attr('placeholder', 'Share an academic update, question, or campus activity, ' + firstName + '...');

      loadPinnedBulletin();
      loadComposerCommunities();
      loadPosts(true);
      hydrateRightRailSuggestions();
      renderRightRailOnlineContacts(Store.getState().onlineContacts);
    });
  }

  function prependPostIfVisible(post) {
    var $list = $('#feed-posts-list');
    if (!$list.length || !post) return;
    $list.find('.empty-state').remove();
    var $card = $(PostCard.render(post)).hide();
    $list.prepend($card);
    $card.fadeIn(180);
    UI.refreshIcons($card[0]);
  }

  // Composer Image Selection
  $(document).on('change', '#composer-image-input', function () {
    var files = Array.from(this.files || []);
    var cfg = window.UGNAYRA_CONFIG;

    for (var i = 0; i < files.length; i++) {
      if (feedState.composerFiles.length >= cfg.MAX_POST_IMAGES) {
        UI.toast('You can attach up to ' + cfg.MAX_POST_IMAGES + ' images per post.', 'warning');
        break;
      }
      var f = files[i];
      if (cfg.ALLOWED_IMAGE_TYPES.indexOf(f.type) === -1) {
        UI.toast('Unsupported image format: ' + f.name, 'error');
        continue;
      }
      if (f.size > cfg.MAX_UPLOAD_BYTES) {
        UI.toast(f.name + ' exceeds the 5 MB limit.', 'error');
        continue;
      }
      feedState.composerFiles.push({
        file: f,
        previewUrl: URL.createObjectURL(f)
      });
    }
    this.value = '';
    renderComposerPreviews();
  });

  $(document).on('click', '.js-remove-composer-img', function () {
    var idx = parseInt($(this).attr('data-idx'), 10);
    if (!isNaN(idx) && feedState.composerFiles[idx]) {
      URL.revokeObjectURL(feedState.composerFiles[idx].previewUrl);
      feedState.composerFiles.splice(idx, 1);
      renderComposerPreviews();
    }
  });

  // Publish Campus Post via AJAX
  $(document).on('submit', '#campus-composer-form', function (e) {
    e.preventDefault();
    var content = ($('#composer-content').val() || '').trim();
    var communityId = $('#composer-community-select').val() || '';

    if (!content && !feedState.composerFiles.length) {
      UI.toast('Write a message or attach an image before publishing.', 'warning');
      $('#composer-content').trigger('focus');
      return;
    }

    var $btn = $('#composer-submit-btn');
    UI.setButtonLoading($btn, true, 'Publishing...');

    var reqPayload;
    if (feedState.composerFiles.length) {
      var fd = new FormData();
      fd.append('content', content);
      if (communityId) fd.append('community_id', communityId);
      feedState.composerFiles.forEach(function (item) {
        fd.append('images[]', item.file);
      });
      reqPayload = fd;
    } else {
      reqPayload = { content: content, community_id: communityId || null };
    }

    Services.Posts.create(reqPayload)
      .then(function (res) {
        $('#composer-content').val('');
        $('#composer-char-counter').text('0 / 5000');
        clearComposerFiles();
        if (UI && UI.setComboboxValue) {
          UI.setComboboxValue($('#composer-dest-combo'), '', true);
        }
        if (res.data && res.data.post) {
          prependPostIfVisible(res.data.post);
          Store.setState({ feedCache: [res.data.post].concat(Store.getState().feedCache) });
        }
        UI.toast('Post published!', 'success');
      })
      .catch(function (err) {
        UI.toast(err.message || 'Could not publish post.', 'error');
      })
      .finally(function () {
        UI.setButtonLoading($btn, false);
      });
  });

  $(document).on('click', '.js-feed-filter', function () {
    var nextFilter = $(this).attr('data-filter') || 'all';
    if (nextFilter === feedState.filter && !feedState.loading) return;
    $('.js-feed-filter').removeClass('is-active');
    $(this).addClass('is-active');
    feedState.filter = nextFilter;
    loadPosts(true);
  });

  $(document).on('click', '#load-more-posts-btn', function () {
    UI.setButtonLoading($(this), true, 'Loading...');
    loadPosts(false);
  });

  $(document).on('click', '#retry-feed-btn', function () {
    loadPosts(true);
  });

  $(document).on('click', '.js-quick-join-community', function () {
    var $btn = $(this);
    var cid = $btn.attr('data-community-id');
    UI.setButtonLoading($btn, true);
    Services.Communities.join(cid)
      .then(function () {
        $btn.replaceWith('<span class="badge badge-teacher">Joined</span>');
        UI.toast('Joined community!', 'success');
        loadComposerCommunities();
      })
      .catch(function (err) {
        UI.setButtonLoading($btn, false);
        UI.toast(err.message || 'Could not join community.', 'error');
      });
  });

  $(document).on('click', '.js-quick-message-user', function () {
    var targetUserId = $(this).attr('data-user-id');
    if (!targetUserId) return;
    Services.Messages.openDirect(targetUserId)
      .then(function (res) {
        var conv = res.data && res.data.conversation;
        if (conv && conv.id) {
          window.UgnayraApp.navigate('/messages/' + conv.id);
        } else {
          window.UgnayraApp.navigate('/messages');
        }
      })
      .catch(function (err) {
        UI.toast(err.message || 'Unable to start conversation.', 'error');
      });
  });

  window.UgnayraFeedModule = {
    mount: mount,
    prependPostIfVisible: prependPostIfVisible,
    renderRightRailOnlineContacts: renderRightRailOnlineContacts,
    renderRightRailBulletins: renderRightRailBulletins
  };
})(window, window.jQuery);
