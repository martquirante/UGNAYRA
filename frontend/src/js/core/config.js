/**
 * UGNAYRA — Runtime Configuration
 * Keeps frontend (Vercel) and backend PHP API (Render / Local) strictly decoupled.
 */
(function (window) {
  'use strict';

  function resolveApiBaseUrl() {
    if (window.__UGNAYRA_API_URL__) {
      return String(window.__UGNAYRA_API_URL__).replace(/\/+$/, '');
    }
    var meta = document.querySelector('meta[name="ugnayra-api-base"]');
    if (meta && meta.content && meta.content.trim() !== '') {
      return meta.content.trim().replace(/\/+$/, '');
    }
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://127.0.0.1:8080/api/v1';
    }
    return '/api/v1';
  }

  var apiBase = resolveApiBaseUrl();
  var apiOrigin = apiBase.indexOf('http') === 0
    ? apiBase.replace(/\/api\/v1\/?$/, '')
    : window.location.origin;

  window.UGNAYRA_CONFIG = Object.freeze({
    APP_NAME: 'UGNAYRA',
    APP_DESCRIPTION: 'School-Based Social Networking Platform',
    API_BASE_URL: apiBase,
    API_ORIGIN: apiOrigin,
    CHAT_POLL_MS: 3500,
    TYPING_THROTTLE_MS: 2500,
    HEARTBEAT_VISIBLE_MS: 25000,
    HEARTBEAT_HIDDEN_MS: 90000,
    SEARCH_DEBOUNCE_MS: 260,
    MAX_UPLOAD_BYTES: 5 * 1024 * 1024,
    MAX_POST_IMAGES: 4,
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    FEATURES: Object.freeze({
      // Live WebRTC Audio/Video Consultation & P2P Realtime Network
      WEBRTC_CALLING: true
    })
  });
})(window);
