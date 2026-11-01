/**
 * UGNAYRA — Asynchronous HTML View Loader (jQuery $.ajax + Memory Cache)
 * Enforces strict separation between HTML5 view markup (src/pages/*.html)
 * and JavaScript controller modules (src/js/modules/*.js).
 */
(function (window, $) {
  'use strict';

  var templateCache = {};

  var TEMPLATE_REV = 'v=39';

  var VIEWS = Object.freeze({
    AUTH: '/src/pages/auth/auth.html?' + TEMPLATE_REV,
    SHELL: '/src/pages/dashboard/shell.html?' + TEMPLATE_REV,
    EXPLORE: '/src/pages/dashboard/explore.html?' + TEMPLATE_REV,
    ANNOUNCEMENTS: '/src/pages/dashboard/announcements.html?' + TEMPLATE_REV,
    NOTIFICATIONS: '/src/pages/dashboard/notifications.html?' + TEMPLATE_REV,
    FEED: '/src/pages/feed/feed.html?' + TEMPLATE_REV,
    MESSAGES: '/src/pages/messages/messages.html?' + TEMPLATE_REV,
    COMMUNITIES: '/src/pages/communities/communities.html?' + TEMPLATE_REV,
    COMMUNITY_DETAIL: '/src/pages/communities/detail.html?' + TEMPLATE_REV,
    PROFILE: '/src/pages/profile/profile.html?' + TEMPLATE_REV,
    SETTINGS: '/src/pages/profile/settings.html?' + TEMPLATE_REV,
    CLASSROOM_LIST: '/src/pages/classroom/classroom-list.html?' + TEMPLATE_REV,
    CLASSROOM_DETAIL: '/src/pages/classroom/classroom-detail.html?' + TEMPLATE_REV,
    ASSIGNMENT_DETAIL: '/src/pages/classroom/assignment-detail.html?' + TEMPLATE_REV,
    MEETING_STAGE: '/src/pages/meeting/meeting-stage.html?' + TEMPLATE_REV,
    STUDENT_DIRECTORY: '/src/pages/directory/student-directory.html?' + TEMPLATE_REV,
    COCKPIT: '/src/pages/dashboard/cockpit.html?' + TEMPLATE_REV
  });

  function load(viewPath) {
    if (templateCache[viewPath]) {
      return Promise.resolve(templateCache[viewPath]);
    }
    return new Promise(function (resolve, reject) {
      $.ajax({
        url: viewPath,
        method: 'GET',
        dataType: 'html',
        cache: true
      })
        .done(function (htmlString) {
          templateCache[viewPath] = htmlString;
          resolve(htmlString);
        })
        .fail(function (_jqXHR, textStatus) {
          reject(new Error('Failed to load view template (' + viewPath + '): ' + textStatus));
        });
    });
  }

  function renderInto(selector, viewPath) {
    return load(viewPath).then(function (html) {
      var $target = $(selector);
      $target.html(html);
      if (window.UgnayraUI) {
        if (typeof window.UgnayraUI.enhanceResponsiveFilterTabs === 'function') {
          window.UgnayraUI.enhanceResponsiveFilterTabs($target[0]);
        }
        if (typeof window.UgnayraUI.refreshIcons === 'function') {
          window.UgnayraUI.refreshIcons($target[0]);
        }
      }
      return $target;
    });
  }

  window.UgnayraTemplates = {
    VIEWS: VIEWS,
    load: load,
    renderInto: renderInto
  };
})(window, window.jQuery);
