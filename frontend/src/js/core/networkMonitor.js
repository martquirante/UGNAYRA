/**
 * UGNAYRA — Real-Time Campus Network & Internet Connectivity Monitor
 * Hand-crafted, human-designed top utility banner for campus network:
 * - Crimson Red on disconnect (persistent while offline, with status beacon and retry action)
 * - Royal Blue on reconnect (lasts exactly 3 seconds with micro-drain timer, then smoothly auto-dismisses)
 */
(function (window, $) {
  'use strict';

  var barEl = null;
  var timerEl = null;
  var textEl = null;
  var iconEl = null;
  var beaconEl = null;
  var retryBtnEl = null;

  var isOfflineState = false;
  var dismissTimer = null;
  var checkingConnection = false;

  var OFFLINE_MSG = 'No internet connection. Waiting for network signal...';
  var ONLINE_MSG = 'Internet connection restored. You are back online!';

  function createMarkup() {
    var existing = document.getElementById('ugnayra-network-bar');
    if (existing) {
      return existing;
    }

    var bar = document.createElement('div');
    bar.id = 'ugnayra-network-bar';
    bar.className = 'ug-network-bar';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    bar.setAttribute('aria-atomic', 'true');

    bar.innerHTML =
      '<div class="ug-network-bar-inner">' +
        '<span class="ug-net-beacon is-offline" id="ug-net-beacon" aria-hidden="true"></span>' +
        '<span class="ug-net-icon-wrap" id="ug-net-icon" aria-hidden="true">' +
          '<svg class="ug-net-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
            '<line x1="1" y1="1" x2="23" y2="23"></line>' +
            '<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>' +
            '<path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>' +
            '<path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>' +
            '<path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>' +
            '<path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>' +
            '<line x1="12" y1="20" x2="12.01" y2="20"></line>' +
          '</svg>' +
        '</span>' +
        '<span class="ug-net-text" id="ug-net-text">' + OFFLINE_MSG + '</span>' +
        '<button type="button" class="ug-net-retry-btn" id="ug-net-retry-btn" title="Check connection now">' +
          '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>' +
            '<path d="M21 3v5h-5"></path>' +
            '<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>' +
            '<path d="M3 21v-5h5"></path>' +
          '</svg>' +
          '<span>Reconnect</span>' +
        '</button>' +
      '</div>' +
      '<div class="ug-network-bar-timer" id="ug-net-timer" aria-hidden="true"></div>';

    if (document.body) {
      document.body.insertBefore(bar, document.body.firstChild);
    }
    return bar;
  }

  function resolveElements() {
    if (!barEl || !barEl.parentNode) {
      barEl = createMarkup();
      timerEl = document.getElementById('ug-net-timer');
      textEl = document.getElementById('ug-net-text');
      iconEl = document.getElementById('ug-net-icon');
      beaconEl = document.getElementById('ug-net-beacon');
      retryBtnEl = document.getElementById('ug-net-retry-btn');

      if (retryBtnEl) {
        retryBtnEl.addEventListener('click', function (e) {
          e.preventDefault();
          checkConnection(true);
        });
      }
    }
  }

  function renderOfflineIcon() {
    return (
      '<svg class="ug-net-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
        '<line x1="1" y1="1" x2="23" y2="23"></line>' +
        '<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>' +
        '<path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>' +
        '<path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>' +
        '<path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>' +
        '<path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>' +
        '<line x1="12" y1="20" x2="12.01" y2="20"></line>' +
      '</svg>'
    );
  }

  function renderOnlineIcon() {
    return (
      '<svg class="ug-net-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M5 12.55a11 11 0 0 1 14.08 0"></path>' +
        '<path d="M1.42 9a16 16 0 0 1 21.16 0"></path>' +
        '<path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>' +
        '<line x1="12" y1="20" x2="12.01" y2="20"></line>' +
      '</svg>'
    );
  }

  function showOffline(customMsg) {
    resolveElements();
    if (!barEl) return;

    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }

    isOfflineState = true;

    // Reset progress timer animation
    if (timerEl) {
      timerEl.style.animation = 'none';
      timerEl.style.display = 'none';
    }

    barEl.classList.remove('is-online');
    barEl.classList.add('is-offline', 'is-visible');
    if (document.body) {
      document.body.classList.add('ug-network-bar-active');
    }

    if (beaconEl) {
      beaconEl.className = 'ug-net-beacon is-offline';
    }
    if (iconEl) {
      iconEl.innerHTML = renderOfflineIcon();
    }
    if (textEl) {
      textEl.textContent = customMsg || OFFLINE_MSG;
    }
    if (retryBtnEl) {
      retryBtnEl.style.display = 'inline-flex';
      retryBtnEl.disabled = false;
      var span = retryBtnEl.querySelector('span');
      if (span) span.textContent = 'Reconnect';
    }
  }

  function showOnline(durationMs, customMsg) {
    resolveElements();
    if (!barEl) return;

    var duration = typeof durationMs === 'number' ? durationMs : 3000;

    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }

    isOfflineState = false;

    barEl.classList.remove('is-offline');
    barEl.classList.add('is-online', 'is-visible');
    if (document.body) {
      document.body.classList.add('ug-network-bar-active');
    }

    if (beaconEl) {
      beaconEl.className = 'ug-net-beacon is-online';
    }
    if (iconEl) {
      iconEl.innerHTML = renderOnlineIcon();
    }
    if (textEl) {
      textEl.textContent = customMsg || ONLINE_MSG;
    }
    if (retryBtnEl) {
      retryBtnEl.style.display = 'none';
    }

    // Trigger exactly 3-second micro-drain progress bar
    if (timerEl) {
      timerEl.style.display = 'block';
      timerEl.style.animation = 'none';
      void timerEl.offsetWidth; // Force CSS reflow
      timerEl.style.animation = 'ug-net-bar-drain ' + duration + 'ms linear forwards';
    }

    // Automatically dismiss after exactly durationMs (3000ms)
    dismissTimer = setTimeout(function () {
      hide();
    }, duration);
  }

  function hide() {
    if (barEl) {
      barEl.classList.remove('is-visible');
    }
    if (document.body) {
      document.body.classList.remove('ug-network-bar-active');
    }
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
  }

  function checkConnection(isUserInitiated) {
    resolveElements();
    if (checkingConnection) return;
    checkingConnection = true;

    if (retryBtnEl && isUserInitiated) {
      retryBtnEl.disabled = true;
      var span = retryBtnEl.querySelector('span');
      if (span) span.textContent = 'Checking...';
    }

    if (!navigator.onLine) {
      setTimeout(function () {
        checkingConnection = false;
        showOffline();
      }, 350);
      return;
    }

    var pingUrl = (window.UGNAYRA_CONFIG && window.UGNAYRA_CONFIG.API_BASE_URL)
      ? window.UGNAYRA_CONFIG.API_BASE_URL + '/health'
      : '/api/v1/health';

    fetch(pingUrl + '?_net_ping=' + Date.now(), { method: 'GET', cache: 'no-store' })
      .then(function (res) {
        checkingConnection = false;
        if (res.ok || res.status < 500) {
          showOnline(3000);
        } else {
          showOffline('Server connection interrupted. Retrying...');
        }
      })
      .catch(function () {
        checkingConnection = false;
        showOffline();
      });
  }

  function init() {
    resolveElements();

    // Native browser online / offline event listeners
    window.addEventListener('offline', function () {
      showOffline();
    });

    window.addEventListener('online', function () {
      checkConnection(false);
    });

    // Boot check
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showOffline();
    }
  }

  // Initialize as soon as DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.UgnayraNetworkMonitor = {
    init: init,
    showOffline: showOffline,
    showOnline: showOnline,
    hide: hide,
    checkConnection: checkConnection,
    isOffline: function () {
      return isOfflineState;
    }
  };
})(window, window.jQuery);

