/**
 * UGNAYRA — Main Application Shell, SPA Hash Router & Responsive Controller
 */
(function (window, $) {
  'use strict';

  var fmt = window.UgnayraFormat;
  var UI = window.UgnayraUI;
  var Store = window.UgnayraStore;
  var Services = window.UgnayraServices;
  var Templates = window.UgnayraTemplates;

  function parseRoute() {
    // 1. If someone arrives via legacy hash (e.g. /#profile or bookmarks), cleanly convert to HTML5 path
    // Skip if the hash contains OAuth parameters (access_token, id_token, error)
    if (window.location.hash) {
      var rawHash = window.location.hash.replace(/^#\/?/, '');
      var isOAuthHash = /^(?:access_token|id_token|error|token_type)=/.test(rawHash);
      if (rawHash && !isOAuthHash) {
        var cleanPath = '/' + rawHash;
        try {
          window.history.replaceState(null, '', cleanPath);
        } catch (_e) {}
      }
    }

    // 2. Read clean pathname
    var rawPath = window.location.pathname || '/';
    var trimmed = rawPath.replace(/^\/+|\/+$/g, '');
    if (!trimmed || trimmed === 'index.html') {
      return { page: 'feed', param: '' };
    }

    var slashIdx = trimmed.indexOf('/');
    if (slashIdx === -1) {
      return { page: trimmed.toLowerCase(), param: '' };
    }
    return {
      page: trimmed.substring(0, slashIdx).toLowerCase(),
      param: decodeURIComponent(trimmed.substring(slashIdx + 1))
    };
  }

  function navigate(targetPath, replace) {
    if (!targetPath) return;
    var clean = String(targetPath).trim();
    // Normalize '#profile' or 'profile' -> '/profile'
    clean = clean.replace(/^#\/?/, '/');
    if (clean.charAt(0) !== '/') {
      clean = '/' + clean;
    }

    if (replace) {
      window.history.replaceState(null, '', clean);
    } else {
      window.history.pushState(null, '', clean);
    }
    dispatchRoute();
  }

  function renderAccountMiniCard(me) {
    return (
      '<a href="/profile" class="rail-account-info flex-1" style="text-decoration:none;">' +
        fmt.renderAvatar(me, 'avatar-sm', true) +
        '<div class="rail-account-meta">' +
          '<div class="rail-account-name truncate">' + fmt.escapeHtml(me.full_name || 'Campus Member') + '</div>' +
          '<div class="rail-account-role truncate">' + fmt.escapeHtml(fmt.roleLabel(me.role)) + (me.section ? ' · ' + fmt.escapeHtml(me.section) : '') + '</div>' +
        '</div>' +
      '</a>' +
      '<button type="button" class="btn-icon js-logout-btn" title="Sign out" aria-label="Sign out">' +
        '<i data-lucide="log-out" class="icon-sm"></i>' +
      '</button>'
    );
  }

  function syncShellAccountCard() {
    var me = Store.getState().user;
    if (me && $('#rail-account-card').length) {
      $('#rail-account-card').html(renderAccountMiniCard(me));
      UI.refreshIcons($('#rail-account-card')[0]);
    }
  }

  function syncUnreadBadges() {
    var st = Store.getState();
    var mCount = Number(st.unreadMessages || 0);
    var nCount = Number(st.unreadNotifications || 0);

    if (mCount > 0) {
      $('.js-msg-badge').text(mCount > 99 ? '99+' : mCount).removeClass('hidden');
    } else {
      $('.js-msg-badge').addClass('hidden');
    }

    if (nCount > 0) {
      $('.js-notif-badge').text(nCount > 99 ? '99+' : nCount).removeClass('hidden');
    } else {
      $('.js-notif-badge').addClass('hidden');
    }
  }

  function dispatchRoute() {
    if (!Store.getState().authenticated) return;

    var prevRoute = Store.getState().route || {};
    var nextRoute = parseRoute();
    Store.setState({ route: nextRoute });

    if (prevRoute.page === 'messages' && nextRoute.page !== 'messages') {
      window.UgnayraMessagesModule.unmount();
    }

    // Highlight active nav links
    var activeNavKey = nextRoute.page;
    $('.nav-item, .mobile-tab').removeClass('is-active');
    $('[data-nav="' + activeNavKey + '"]').addClass('is-active');
    if (activeNavKey === 'home') {
      $('.mobile-tab[data-nav="feed"]').addClass('is-active');
    }

    // Layout mode: 3-column on Home & News Feed; 2-column wide stage on dedicated views
    var $grid = $('#shell-grid');
    if (nextRoute.page === 'feed' || nextRoute.page === 'home') {
      $grid.removeClass('layout-wide');
    } else {
      $grid.addClass('layout-wide');
    }

    window.scrollTo(0, 0);

    switch (nextRoute.page) {
      case 'home':
        window.UgnayraFeedModule.mount('home');
        break;
      case 'feed':
        window.UgnayraFeedModule.mount('feed');
        break;
      case 'explore':
        window.UgnayraSearchModule.mount(nextRoute.param);
        break;
      case 'messages':
        window.UgnayraMessagesModule.mount(nextRoute.param);
        break;
      case 'communities':
        window.UgnayraCommunitiesModule.mount(nextRoute.param);
        break;
      case 'announcements':
        window.UgnayraAnnouncementsModule.mount();
        break;
      case 'notifications':
        window.UgnayraNotificationsModule.mount();
        break;
      case 'profile':
        window.UgnayraProfileModule.mountProfile(nextRoute.param);
        break;
      case 'settings':
        window.UgnayraProfileModule.mountSettings();
        break;
      default:
        window.UgnayraFeedModule.mount('feed');
        break;
    }
  }

  function showAuthScreen() {
    window.UgnayraPolling.stopAll();
    window.UgnayraAuthModule.mountAuthScreen();
  }

  function mountAuthenticatedShell() {
    return Templates.renderInto('#app', Templates.VIEWS.SHELL).then(function () {
      syncShellAccountCard();
      syncUnreadBadges();
      dispatchRoute();
      window.UgnayraPolling.start();
    });
  }

  function bootstrap() {
    Store.subscribe(function (_state, patch) {
      if (patch.unreadMessages !== undefined || patch.unreadNotifications !== undefined) {
        syncUnreadBadges();
      }
    });

    Services.Auth.me()
      .then(function (res) {
        var d = res.data || {};
        if (d.csrf_token) {
          Store.setState({ csrfToken: d.csrf_token });
        }
        if (d.authenticated && d.user) {
          window.UgnayraAuthModule.applyAuthSession(d);
          mountAuthenticatedShell();
        } else {
          showAuthScreen();
        }
      })
      .catch(function () {
        showAuthScreen();
      })
      .finally(function () {
        Store.setState({ initialized: true });
      });
  }

  // Mobile Drawer Controls
  $(document).on('click', '#open-mobile-drawer-btn', function () {
    $('#mobile-drawer-wrap').removeClass('hidden');
  });

  $(document).on('click', '#close-mobile-drawer-btn, #close-mobile-drawer-backdrop, .js-drawer-link', function () {
    $('#mobile-drawer-wrap').addClass('hidden');
  });

  // Mobile Floating Overlay Chat Action Button
  $(document).on('click', '#mobile-floating-chat-btn', function (e) {
    var curPage = (Store.getState().route || {}).page;
    if (curPage === 'messages') {
      e.preventDefault();
      $('#open-new-chat-btn').trigger('click');
    }
  });

  // Global Interceptor for Clean SPA Links (Eliminates '#' completely from address bar)
  $(document).on('click', 'a[href]', function (e) {
    var href = $(this).attr('href');
    if (!href) return;

    // Ignore external URLs, mailto, tel, javascript, new-window links, or file downloads
    if (
      href === '#' ||
      href.indexOf('http://') === 0 ||
      href.indexOf('https://') === 0 ||
      href.indexOf('mailto:') === 0 ||
      href.indexOf('tel:') === 0 ||
      href.indexOf('javascript:') === 0 ||
      $(this).attr('target') === '_blank' ||
      $(this).attr('download') ||
      e.ctrlKey || e.metaKey || e.shiftKey
    ) {
      return;
    }

    // Matches internal links like '/profile', '/feed', '#profile', etc.
    if (href.charAt(0) === '/' || href.charAt(0) === '#') {
      e.preventDefault();
      navigate(href);
    }
  });

  // Browser Back / Forward Button Navigation
  window.addEventListener('popstate', function () {
    dispatchRoute();
  });

  // Fallback for any legacy hash changes
  window.addEventListener('hashchange', function () {
    dispatchRoute();
  });

  $(function () {
    bootstrap();
  });

  window.UgnayraApp = {
    showAuthScreen: showAuthScreen,
    mountAuthenticatedShell: mountAuthenticatedShell,
    syncShellAccountCard: syncShellAccountCard,
    dispatchRoute: dispatchRoute,
    navigate: navigate
  };
})(window, window.jQuery);
