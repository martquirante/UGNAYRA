/**
 * UGNAYRA — Centralized jQuery AJAX & JSON Transport Client
 * Communicates exclusively via structured JSON payloads with the PHP REST API.
 */
(function (window, $) {
  'use strict';

  function buildHeaders(extraHeaders) {
    var st = window.UgnayraStore.getState();
    var headers = {
      Accept: 'application/json'
    };
    if (st.csrfToken) {
      headers['X-CSRF-Token'] = st.csrfToken;
    }
    if (st.sessionToken) {
      headers['Authorization'] = 'Bearer ' + st.sessionToken;
    }
    return Object.assign(headers, extraHeaders || {});
  }

  function humanizeErrorMessage(rawMsg, status) {
    if (!rawMsg || typeof rawMsg !== 'string') {
      if (status === 401) return 'Your session has expired. Please sign in again to continue.';
      if (status === 403) return 'You do not have permission to access or modify this campus content.';
      if (status === 404) return 'The requested campus item or page was not found.';
      if (status === 429) return 'Please wait a moment before trying again.';
      if (status >= 500) return 'The campus server encountered a temporary hiccup. Please try again shortly.';
      return 'Unable to complete your request. Please check your connection and try again.';
    }

    var clean = rawMsg.trim();

    // Shield non-IT users from raw SQL, PHP stack traces, and database terms
    if (/sql|pdo|database|postgres|syntax error|fatal error|uncaught exception|call to a member function/i.test(clean)) {
      return 'The campus server encountered a temporary hiccup. Please try again in a few moments.';
    }
    if (/class.*not found|finfo|internal server error|500 internal/i.test(clean)) {
      return 'The campus server experienced a temporary hiccup. Please try again shortly.';
    }
    if (/php backend|api server|network_unavailable|failed to fetch/i.test(clean)) {
      return 'Unable to reach the campus server. Please check your internet connection or try again shortly.';
    }
    if (/csrf|session token/i.test(clean)) {
      return 'Your security session has expired. Please refresh the page and try again.';
    }
    if (/^request failed/i.test(clean)) {
      return 'Unable to complete your request. Please check your connection and try again.';
    }

    return clean;
  }

  function normalizeAjaxFailure(jqXHR, textStatus) {
    var status = jqXHR ? jqXHR.status : 0;
    var parsed = jqXHR && jqXHR.responseJSON ? jqXHR.responseJSON : null;

    if (!parsed && jqXHR && typeof jqXHR.responseText === 'string') {
      try {
        parsed = JSON.parse(jqXHR.responseText);
      } catch (_e) {
        parsed = null;
      }
    }

    if (status === 0) {
      if (window.UgnayraNetworkMonitor && typeof window.UgnayraNetworkMonitor.showOffline === 'function') {
        window.UgnayraNetworkMonitor.showOffline();
      }
      return {
        status: 0,
        code: 'NETWORK_UNAVAILABLE',
        message: 'Unable to connect to the campus server. Please check your internet connection or try again shortly.',
        details: null
      };
    }

    var errObj = parsed && parsed.error ? parsed.error : {};
    var rawMessage = errObj.message || (parsed && parsed.message) || '';
    var friendlyMessage = humanizeErrorMessage(rawMessage, status);

    return {
      status: status,
      code: errObj.code || (status === 401 ? 'UNAUTHENTICATED' : 'API_ERROR'),
      message: friendlyMessage,
      details: errObj.details || null,
      meta: (parsed && parsed.meta) || null
    };
  }

  function request(method, path, payload, options) {
    var opts = options || {};
    var url = path.indexOf('http') === 0
      ? path
      : window.UGNAYRA_CONFIG.API_BASE_URL + (path.charAt(0) === '/' ? path : '/' + path);

    var isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
    var upperMethod = String(method || 'GET').toUpperCase();

    var ajaxConfig = {
      url: url,
      method: upperMethod,
      dataType: 'json',
      headers: buildHeaders(opts.headers),
      xhrFields: {
        withCredentials: true
      },
      timeout: opts.timeout || 20000
    };

    if (upperMethod === 'GET') {
      if (payload && typeof payload === 'object') {
        ajaxConfig.data = payload;
      }
    } else if (isFormData) {
      ajaxConfig.data = payload;
      ajaxConfig.processData = false;
      ajaxConfig.contentType = false;
    } else {
      ajaxConfig.contentType = 'application/json; charset=utf-8';
      ajaxConfig.data = JSON.stringify(payload || {});
    }

    return new Promise(function (resolve, reject) {
      $.ajax(ajaxConfig)
        .done(function (json) {
          if (window.UgnayraNetworkMonitor && typeof window.UgnayraNetworkMonitor.isOffline === 'function') {
            if (window.UgnayraNetworkMonitor.isOffline()) {
              window.UgnayraNetworkMonitor.showOnline(3000);
            }
          }
          if (json && json.data && json.data.csrf_token) {
            window.UgnayraStore.setState({ csrfToken: json.data.csrf_token });
          }
          if (json && json.success === false) {
            reject({
              status: 400,
              code: (json.error && json.error.code) || 'REQUEST_REJECTED',
              message: (json.error && json.error.message) || 'Action could not be completed.',
              details: (json.error && json.error.details) || null
            });
            return;
          }
          resolve(json);
        })
        .fail(function (jqXHR, textStatus) {
          var err = normalizeAjaxFailure(jqXHR, textStatus);
          if (err.status === 401 && !opts.ignoreAuthRedirect) {
            var wasAuthed = window.UgnayraStore.getState().authenticated;
            window.UgnayraStore.clearAuth();
            if (wasAuthed && window.UgnayraApp && typeof window.UgnayraApp.showAuthScreen === 'function') {
              window.UgnayraUI.toast('Your session expired. Please sign in again.', 'warning');
              window.UgnayraApp.showAuthScreen();
            }
          }
          reject(err);
        });
    });
  }

  window.UgnayraApiClient = {
    request: request,
    get: function (path, query, opts) { return request('GET', path, query, opts); },
    post: function (path, body, opts) { return request('POST', path, body, opts); },
    patch: function (path, body, opts) { return request('PATCH', path, body, opts); },
    delete: function (path, body, opts) { return request('DELETE', path, body, opts); },
    upload: function (path, formData, opts) { return request('POST', path, formData, opts); }
  };
})(window, window.jQuery);
