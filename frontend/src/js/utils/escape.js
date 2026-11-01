/**
 * UGNAYRA — Output Escaping, Formatting & Academic Identity Helpers
 * Defends against DOM XSS on every user-generated string rendered from JSON.
 */
(function (window) {
  'use strict';

  var ENTITY_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, function (ch) {
      return ENTITY_MAP[ch];
    });
  }

  /**
   * Escapes raw text first, then safely converts URLs, www links, bare domains, emails, @mentions, and #tags.
   */
  function formatPostContent(rawText) {
    if (!rawText) return '';
    var safe = escapeHtml(rawText);

    // Single regex matching full URLs, www.*, email addresses, and bare domains with popular/academic TLDs
    var linkRegex = /(https?:\/\/[^\s<]+|www\.[a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)+(?:\/[^\s<]*)?|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|\b[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.(?:com|org|net|edu|gov|mil|ph|edu\.ph|gov\.ph|org\.ph|com\.ph|io|app|dev|ai|co|info|biz|xyz|me|tv|tech|site|online|space|store|live|cloud|link|news|blog|us|uk|ca|au|jp|sg)(?::[0-9]{1,5})?(?:\/[^\s<]*)?)/gi;

    safe = safe.replace(linkRegex, function (matched) {
      var trailing = '';
      var m = matched;

      // Pop trailing punctuation or HTML entities
      while (m.length > 0) {
        if (/&(?:quot|amp|lt|gt|#39);$/i.test(m)) {
          var entityMatch = m.match(/&(?:quot|amp|lt|gt|#39);$/i);
          if (entityMatch) {
            trailing = entityMatch[0] + trailing;
            m = m.slice(0, -entityMatch[0].length);
            continue;
          }
        }
        var lastChar = m.charAt(m.length - 1);
        if (/[.,;:!?')\]]/.test(lastChar)) {
          trailing = lastChar + trailing;
          m = m.slice(0, -1);
        } else {
          break;
        }
      }

      if (!m) return matched;

      // Email address match
      if (m.indexOf('@') !== -1 && !/^https?:\/\//i.test(m) && !/^www\./i.test(m)) {
        return '<a href="mailto:' + m + '" class="chat-link">' + m + '</a>' + trailing;
      }

      var href = m;
      if (!/^https?:\/\//i.test(href)) {
        href = 'https://' + href;
      }

      return '<a href="' + href + '" target="_blank" rel="noopener noreferrer" class="chat-link">' + m + '</a>' + trailing;
    });

    // Highlight @username mentions
    safe = safe.replace(
      /(^|\s)@([a-zA-Z0-9._-]{3,32})/g,
      '$1<a href="/profile/$2" class="mention-link">@$2</a>'
    );

    // Highlight academic hashtags
    safe = safe.replace(
      /(^|\s)#([a-zA-Z0-9_]{2,40})/g,
      '$1<span style="color:var(--color-blue-700);font-weight:500;">#$2</span>'
    );

    return safe;
  }

  function initialsFromName(fullName) {
    if (!fullName) return 'UG';
    var parts = String(fullName).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'UG';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function resolveMediaUrl(url) {
    if (!url) return '';
    var s = String(url).trim();
    if (!s) return '';
    if (s.indexOf('http://') === 0 || s.indexOf('https://') === 0 || s.indexOf('data:') === 0 || s.indexOf('blob:') === 0) {
      return s;
    }
    if (s.charAt(0) === '/') {
      return window.UGNAYRA_CONFIG.API_ORIGIN + s;
    }
    return window.UGNAYRA_CONFIG.API_ORIGIN + '/' + s;
  }

  function renderAvatar(user, sizeClass, showPresence) {
    var u = user || {};
    var size = sizeClass || 'avatar-md';
    var role = u.role || 'student';
    var avatarSrc = resolveMediaUrl(u.avatar_url);
    var altName = escapeHtml(u.full_name || u.username || 'Campus Member');
    var inner = avatarSrc
      ? '<img src="' + escapeHtml(avatarSrc) + '" alt="' + altName + '" loading="lazy" />'
      : '<span class="avatar-initials">' + escapeHtml(initialsFromName(u.full_name || u.username)) + '</span>';

    var presenceHtml = '';
    if (showPresence) {
      var online = Boolean(u.is_online);
      presenceHtml = '<span class="presence-dot ' + (online ? '' : 'is-offline') + '" title="' + (online ? 'Online now' : 'Offline') + '"></span>';
    }

    return (
      '<span class="avatar ' + escapeHtml(size) + ' role-' + escapeHtml(role) + '">' +
      inner +
      presenceHtml +
      '</span>'
    );
  }

  function roleLabel(role) {
    if (role === 'teacher') return 'Faculty';
    if (role === 'personnel') return 'School Personnel';
    return 'Student';
  }

  function roleBadgeHtml(role) {
    if (role === 'teacher') {
      return '<span class="badge badge-teacher"><i data-lucide="graduation-cap" class="icon-xs"></i>Faculty</span>';
    }
    if (role === 'personnel') {
      return '<span class="badge badge-personnel"><i data-lucide="shield-check" class="icon-xs"></i>Personnel</span>';
    }
    return '<span class="badge badge-student">Student</span>';
  }

  function timeAgo(isoDate) {
    if (!isoDate) return '';
    var then = new Date(isoDate).getTime();
    if (isNaN(then)) return escapeHtml(isoDate);
    var diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (diffSec < 45) return 'Just now';
    var diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return diffMin + 'm ago';
    var diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return diffHr + 'h ago';
    var diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return diffDay + 'd ago';
    return formatDateShort(isoDate);
  }

  function formatDateShort(isoDate) {
    if (!isoDate) return '';
    var d = new Date(isoDate);
    if (isNaN(d.getTime())) return escapeHtml(isoDate);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatDateTime(isoDate) {
    if (!isoDate) return '';
    var d = new Date(isoDate);
    if (isNaN(d.getTime())) return escapeHtml(isoDate);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  window.UgnayraFormat = {
    escapeHtml: escapeHtml,
    formatPostContent: formatPostContent,
    initialsFromName: initialsFromName,
    resolveMediaUrl: resolveMediaUrl,
    renderAvatar: renderAvatar,
    roleLabel: roleLabel,
    roleBadgeHtml: roleBadgeHtml,
    timeAgo: timeAgo,
    formatDateShort: formatDateShort,
    formatDateTime: formatDateTime
  };
})(window);
