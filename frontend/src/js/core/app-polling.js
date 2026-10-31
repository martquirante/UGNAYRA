/**
 * UGNAYRA — Visibility-Aware Global Heartbeat & Presence Sync
 * Minimizes battery & bandwidth usage on low-end mobile devices and campus Wi-Fi.
 */
(function (window) {
  'use strict';

  var heartbeatTimer = null;

  function runHeartbeat() {
    var st = window.UgnayraStore.getState();
    if (!st.authenticated) return;

    window.UgnayraServices.Presence.heartbeat()
      .then(function (res) {
        var d = res.data || {};
        var patch = {};
        if (typeof d.unread_messages_count === 'number') {
          patch.unreadMessages = d.unread_messages_count;
        }
        if (typeof d.unread_notifications_count === 'number') {
          patch.unreadNotifications = d.unread_notifications_count;
        }
        if (Array.isArray(d.online_contacts)) {
          patch.onlineContacts = d.online_contacts;
          if (window.UgnayraFeedModule) {
            window.UgnayraFeedModule.renderRightRailOnlineContacts(d.online_contacts);
          }
        }
        window.UgnayraStore.setState(patch);
      })
      .catch(function () {});
  }

  function scheduleHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    var cfg = window.UGNAYRA_CONFIG;
    var interval = document.visibilityState === 'visible'
      ? cfg.HEARTBEAT_VISIBLE_MS
      : cfg.HEARTBEAT_HIDDEN_MS;
    heartbeatTimer = setInterval(runHeartbeat, interval);
  }

  function start() {
    runHeartbeat();
    scheduleHeartbeat();
  }

  function stopAll() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (window.UgnayraMessagesModule) {
      window.UgnayraMessagesModule.unmount();
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (!window.UgnayraStore.getState().authenticated) return;
    if (document.visibilityState === 'visible') {
      runHeartbeat();
    }
    scheduleHeartbeat();
  });

  window.UgnayraPolling = {
    start: start,
    stopAll: stopAll,
    triggerNow: runHeartbeat
  };
})(window);
