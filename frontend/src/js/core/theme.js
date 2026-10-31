/**
 * UGNAYRA — Centralized Theme Engine & System Dark Mode Orchestrator
 * Provides instantaneous theme switching, system OS auto-sync, and zero-flash persistence.
 */
(function (window, $) {
  'use strict';

  var THEME_LABELS = {
    light: 'Daylight',
    dark: 'Midnight Sapphire',
    system: 'System Match'
  };

  var THEME_ICONS = {
    light: 'sun',
    dark: 'moon',
    system: 'laptop'
  };

  function getSavedTheme() {
    try {
      return localStorage.getItem('ugnayra_theme') || 'system';
    } catch (_e) {
      return 'system';
    }
  }

  function resolveEffectiveTheme(theme) {
    if (theme === 'dark') return 'dark';
    if (theme === 'light') return 'light';
    var isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return isSystemDark ? 'dark' : 'light';
  }

  function applyTheme(themeChoice, persistServer) {
    var choice = themeChoice || getSavedTheme();
    var effective = resolveEffectiveTheme(choice);

    document.documentElement.setAttribute('data-theme', effective);
    if (document.body) {
      document.body.setAttribute('data-theme', effective);
    }

    var metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', effective === 'dark' ? '#0b1120' : '#173B70');
    }

    try {
      localStorage.setItem('ugnayra_theme', choice);
    } catch (_e) {}

    syncSettingsUI(choice);
    syncAuthToggleUI(effective);

    if (persistServer && window.UgnayraStore && window.UgnayraServices) {
      var st = window.UgnayraStore.getState();
      if (st && st.user && st.authenticated) {
        var prefs = Object.assign({}, st.user.preferences || {}, { theme: choice });
        window.UgnayraServices.Profiles.updateMe({ preferences: prefs })
          .then(function (res) {
            var updated = (res.data && res.data.profile) || Object.assign({}, st.user, { preferences: prefs });
            window.UgnayraStore.setState({ user: updated });
          })
          .catch(function () {});
      }
    }

    if (window.UgnayraUI && typeof window.UgnayraUI.refreshIcons === 'function') {
      window.UgnayraUI.refreshIcons($('#active-theme-pill')[0]);
    }
  }

  function syncSettingsUI(choice) {
    choice = choice || getSavedTheme();
    $('.theme-option-card').removeClass('is-selected').attr('aria-checked', 'false');
    $('.theme-option-card[data-theme-choice="' + choice + '"]').addClass('is-selected').attr('aria-checked', 'true');

    var label = THEME_LABELS[choice] || 'Daylight';
    var icon = THEME_ICONS[choice] || 'sun';
    $('#active-theme-name').text(label);
    var $pill = $('#active-theme-pill');
    if ($pill.length) {
      $pill.html('<i data-lucide="' + icon + '" class="icon-xs"></i><span>' + label + '</span>');
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: $pill[0] });
      }
    }
  }

  function syncAuthToggleUI(effective) {
    var eff = effective || resolveEffectiveTheme(getSavedTheme());
    var $btn = $('#auth-theme-toggle-btn');
    if (!$btn.length) return;
    var isDark = eff === 'dark';
    var nextTheme = isDark ? 'light' : 'dark';
    var nextLabel = isDark ? THEME_LABELS.light : THEME_LABELS.dark;
    var nextIcon = isDark ? 'sun' : 'moon';

    $btn.attr('aria-label', 'Switch to ' + nextLabel);
    $btn.attr('title', 'Switch to ' + nextLabel);
    $btn.attr('data-target-theme', nextTheme);
    $('#auth-theme-toggle-label').text(nextLabel);
    $('#auth-theme-toggle-icon').html('<i data-lucide="' + nextIcon + '" class="icon-xs"></i>');
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: $btn[0] });
    }
  }

  function init() {
    var current = getSavedTheme();
    applyTheme(current, false);

    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var handler = function () {
        if (getSavedTheme() === 'system') {
          applyTheme('system', false);
        }
      };
      if (mq.addEventListener) {
        mq.addEventListener('change', handler);
      } else if (mq.addListener) {
        mq.addListener(handler);
      }
    }
  }

  // Live click listener on theme cards
  $(document).on('click', '.js-theme-choice', function (e) {
    e.preventDefault();
    var choice = $(this).attr('data-theme-choice') || 'light';
    applyTheme(choice, true);

    if (window.UgnayraUI && typeof window.UgnayraUI.toast === 'function') {
      var label = THEME_LABELS[choice] || choice;
      window.UgnayraUI.toast('Theme switched to ' + label, 'info');
    }
  });

  // Live click listener on auth quick theme toggle pill
  $(document).on('click', '.js-auth-theme-toggle', function (e) {
    e.preventDefault();
    var currentEff = document.documentElement.getAttribute('data-theme') || 'light';
    var next = currentEff === 'dark' ? 'light' : 'dark';
    applyTheme(next, false);

    if (window.UgnayraUI && typeof window.UgnayraUI.toast === 'function') {
      var label = THEME_LABELS[next] || next;
      window.UgnayraUI.toast('Theme switched to ' + label, 'info');
    }
  });

  window.UgnayraTheme = {
    init: init,
    getTheme: getSavedTheme,
    setTheme: applyTheme,
    syncSettingsUI: syncSettingsUI,
    syncAuthToggleUI: syncAuthToggleUI
  };

  // Run initial theme application immediately
  init();
})(window, window.jQuery);

