/**
 * UGNAYRA — Search & Campus Discovery Module (Quick Popover + Explore Page)
 * Performs debounced AJAX queries across People, Posts, Communities & Announcements.
 */
(function (window, $) {
  'use strict';

  var fmt = window.UgnayraFormat;
  var UI = window.UgnayraUI;
  var Services = window.UgnayraServices;
  var PostCard = window.UgnayraPostCard;
  var Templates = window.UgnayraTemplates;

  var exploreState = {
    query: '',
    type: 'all'
  };
  var quickTimer = null;
  var exploreTimer = null;

  function renderPersonCard(u) {
    return (
      '<div class="panel" style="padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;">' +
        '<a href="/profile/' + fmt.escapeHtml(u.username || u.id) + '" class="flex items-center gap-3 min-w-0 flex-1" style="text-decoration:none;">' +
          fmt.renderAvatar(u, 'avatar-md', true) +
          '<div class="min-w-0">' +
            '<div class="flex items-center gap-2 flex-wrap">' +
              '<span class="text-sm truncate" style="font-weight:700;color:var(--color-ink-900);">' + fmt.escapeHtml(u.full_name) + '</span>' +
              fmt.roleBadgeHtml(u.role) +
            '</div>' +
            '<div class="text-xs-muted truncate">@' + fmt.escapeHtml(u.username) + ' · ' + fmt.escapeHtml(u.department || fmt.roleLabel(u.role)) + '</div>' +
          '</div>' +
        '</a>' +
        '<button type="button" class="btn btn-secondary btn-sm js-quick-message-user" data-user-id="' + fmt.escapeHtml(u.id) + '">' +
          '<i data-lucide="message-circle" class="icon-xs"></i><span>Message</span>' +
        '</button>' +
      '</div>'
    );
  }

  function mountExplore(initialQuery) {
    exploreState.query = initialQuery || '';
    exploreState.type = 'all';

    Templates.renderInto('#main-stage', Templates.VIEWS.EXPLORE)
      .then(function () {
        $('#explore-search-input').val(exploreState.query);
        $('#explore-results-container').html(UI.renderPostSkeletons(2));
        runExploreQuery();
      })
      .catch(function (err) {
        $('#main-stage').html(UI.renderEmptyState('alert-circle', 'Unable to load explore view', err.message));
        UI.refreshIcons($('#main-stage')[0]);
      });
  }

  function runExploreQuery() {
    var $box = $('#explore-results-container');
    if (!$box.length) return;

    Services.Search.query({
      q: exploreState.query,
      type: exploreState.type,
      limit: 20
    })
      .then(function (res) {
        var d = res.data || {};
        var people = d.people || [];
        var communities = d.communities || [];
        var posts = d.posts || [];
        var announcements = d.announcements || [];

        if (!people.length && !communities.length && !posts.length && !announcements.length) {
          $box.html(UI.renderEmptyState(
            'search-x',
            'No matching campus results',
            exploreState.query
              ? 'Try broadening your search keyword or switching category filters.'
              : 'Explore active campus members and communities as they join.'
          ));
          UI.refreshIcons($box[0]);
          return;
        }

        var sections = '';
        if (people.length) {
          sections +=
            '<section class="mb-4">' +
              '<h2 class="heading-sm mb-2">Students, Faculty & Personnel (' + people.length + ')</h2>' +
              '<div class="cards-grid-2">' + people.map(renderPersonCard).join('') + '</div>' +
            '</section>';
        }
        if (communities.length) {
          sections +=
            '<section class="mb-4">' +
              '<h2 class="heading-sm mb-2">Communities (' + communities.length + ')</h2>' +
              '<div class="cards-grid-2">' + communities.map(window.UgnayraCommunitiesModule.renderCommunityCard).join('') + '</div>' +
            '</section>';
        }
        if (announcements.length) {
          sections +=
            '<section class="mb-4">' +
              '<h2 class="heading-sm mb-2">School Announcements (' + announcements.length + ')</h2>' +
              '<div class="post-stream">' + announcements.map(window.UgnayraAnnouncementsModule.renderAnnouncementCard).join('') + '</div>' +
            '</section>';
        }
        if (posts.length) {
          sections +=
            '<section class="mb-4">' +
              '<h2 class="heading-sm mb-2">Campus Posts (' + posts.length + ')</h2>' +
              '<div class="post-stream">' + posts.map(PostCard.render).join('') + '</div>' +
            '</section>';
        }

        $box.html(sections);
        UI.refreshIcons($box[0]);
      })
      .catch(function (err) {
        $box.html(UI.renderEmptyState('alert-circle', 'Search unavailable', err.message));
        UI.refreshIcons($box[0]);
      });
  }

  // Left-Rail Live AJAX Quick-Search Suggestions
  $(document).on('input', '#rail-quick-search', function () {
    var val = ($(this).val() || '').trim();
    var $pop = $('#quick-search-popover');
    clearTimeout(quickTimer);

    if (val.length < 2) {
      $pop.addClass('hidden').empty();
      return;
    }

    quickTimer = setTimeout(function () {
      Services.Search.query({ q: val, type: 'all', limit: 5 })
        .then(function (res) {
          var d = res.data || {};
          var people = d.people || [];
          var comms = d.communities || [];
          var anns = d.announcements || [];
          var html = '';

          if (people.length) {
            html += '<div class="text-xs-muted" style="padding:6px 8px;font-weight:700;">PEOPLE</div>';
            people.forEach(function (u) {
              html +=
                '<a href="/profile/' + fmt.escapeHtml(u.username || u.id) + '" class="dropdown-item js-close-quick-search">' +
                  fmt.renderAvatar(u, 'avatar-xs', false) +
                  '<div class="min-w-0 flex-1">' +
                    '<div class="text-sm truncate" style="font-weight:600;">' + fmt.escapeHtml(u.full_name) + '</div>' +
                    '<div class="text-xs-muted truncate">' + fmt.escapeHtml(u.department || fmt.roleLabel(u.role)) + '</div>' +
                  '</div>' +
                '</a>';
            });
          }

          if (comms.length) {
            html += '<div class="text-xs-muted" style="padding:6px 8px;font-weight:700;">COMMUNITIES</div>';
            comms.forEach(function (c) {
              html +=
                '<a href="/communities/' + fmt.escapeHtml(c.slug || c.id) + '" class="dropdown-item js-close-quick-search">' +
                  '<i data-lucide="users" class="icon-sm" style="color:var(--color-blue-700);"></i>' +
                  '<span class="truncate">' + fmt.escapeHtml(c.name) + '</span>' +
                '</a>';
            });
          }

          if (anns.length) {
            html += '<div class="text-xs-muted" style="padding:6px 8px;font-weight:700;">ANNOUNCEMENTS</div>';
            anns.forEach(function (a) {
              html +=
                '<a href="/announcements" class="dropdown-item js-close-quick-search">' +
                  '<i data-lucide="megaphone" class="icon-sm" style="color:var(--color-navy-900);"></i>' +
                  '<span class="truncate">' + fmt.escapeHtml(a.title) + '</span>' +
                '</a>';
            });
          }

          html +=
            '<a href="/explore/' + encodeURIComponent(val) + '" class="dropdown-item js-close-quick-search" ' +
              'style="border-top:1px solid var(--color-border-subtle);margin-top:4px;color:var(--color-blue-700);font-weight:600;">' +
              '<i data-lucide="search" class="icon-sm"></i><span>See all results for "' + fmt.escapeHtml(val) + '"</span>' +
            '</a>';

          $pop.html(html).removeClass('hidden');
          UI.refreshIcons($pop[0]);
        })
        .catch(function () {});
    }, window.UGNAYRA_CONFIG.SEARCH_DEBOUNCE_MS);
  });

  $(document).on('keydown', '#rail-quick-search', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      var val = ($(this).val() || '').trim();
      $('#quick-search-popover').addClass('hidden');
      if (window.UgnayraApp && typeof window.UgnayraApp.navigate === 'function') {
        window.UgnayraApp.navigate(val ? ('/explore/' + encodeURIComponent(val)) : '/explore');
      } else {
        window.location.hash = val ? ('#explore/' + encodeURIComponent(val)) : '#explore';
      }
    }
  });

  $(document).on('click', '.js-close-quick-search', function () {
    $('#quick-search-popover').addClass('hidden');
  });

  // Keyboard shortcut `/` or `Ctrl+K` to focus quick search
  $(document).on('keydown', function (e) {
    var tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    var inInput = tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      var $q = $('#rail-quick-search');
      if ($q.length && $q.is(':visible')) {
        e.preventDefault();
        $q.trigger('focus');
      }
    } else if (!inInput && e.key === '/') {
      var $qs = $('#rail-quick-search');
      if ($qs.length && $qs.is(':visible')) {
        e.preventDefault();
        $qs.trigger('focus');
      }
    }
  });

  // Explore Page Input & Filters
  $(document).on('input', '#explore-search-input', function () {
    exploreState.query = ($(this).val() || '').trim();
    clearTimeout(exploreTimer);
    exploreTimer = setTimeout(runExploreQuery, window.UGNAYRA_CONFIG.SEARCH_DEBOUNCE_MS);
  });

  $(document).on('click', '.js-explore-type', function () {
    $('.js-explore-type').removeClass('is-active');
    $(this).addClass('is-active');
    exploreState.type = $(this).attr('data-type') || 'all';
    runExploreQuery();
  });

  window.UgnayraSearchModule = {
    mount: mountExplore
  };
})(window, window.jQuery);
