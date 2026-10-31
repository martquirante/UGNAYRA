/**
 * UGNAYRA — Reusable Accessible UI Primitives (jQuery + Lucide)
 * Handles Toasts, Modals, Confirmation Dialogs, Lightboxes, Skeletons & Empty States.
 */
(function (window, $) {
  'use strict';

  var fmt = window.UgnayraFormat;
  var activeModalTrigger = null;
  var apiIconSvgCache = {};
  var pendingIconBatches = {};

  function prefersReducedMotion() {
    return Boolean(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function buildApiSvgMarkup(entry, defaultW, defaultH) {
    var w = entry.width || defaultW || 24;
    var h = entry.height || defaultH || 24;
    var body = entry.body || '';
    var hasNativeAnim = body.indexOf('<animate') !== -1;
    var isStrokeIcon = body.indexOf('stroke=') !== -1;
    var cls = 'api-icon-svg';
    if (!hasNativeAnim) {
      cls += isStrokeIcon ? ' api-icon-stroke-anim' : ' api-icon-brand-anim';
    }
    return (
      '<svg class="' + cls + '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
      w + ' ' + h + '" width="1em" height="1em" aria-hidden="true" focusable="false">' +
      body +
      '</svg>'
    );
  }

  function applyCachedApiIcon(el, key) {
    var svgMarkup = apiIconSvgCache[key];
    if (!svgMarkup || !el) return;
    el.innerHTML = svgMarkup;
    el.setAttribute('data-api-hydrated', 'true');
    if (prefersReducedMotion()) {
      var svg = el.querySelector ? el.querySelector('svg') : null;
      if (svg && typeof svg.setCurrentTime === 'function') {
        try { svg.setCurrentTime(10); } catch (_e) {}
      }
    }
  }

  /**
   * Fetches animated transparent vector icons via jQuery $.ajax from the
   * official Iconify JSON API (https://api.iconify.design/{prefix}.json?icons=...)
   * with automatic offline fallback to bundled Lucide icons.
   */
  function hydrateApiIcons(container) {
    var root = container || document;
    var nodes = root.querySelectorAll
      ? root.querySelectorAll('[data-api-icon]')
      : [];
    if (!nodes.length && root.getAttribute && root.getAttribute('data-api-icon')) {
      nodes = [root];
    }
    if (!nodes.length) return;

    var byPrefix = {};
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var spec = (node.getAttribute('data-api-icon') || '').trim();
      if (!spec || spec.indexOf(':') === -1) continue;

      if (apiIconSvgCache[spec]) {
        if (node.getAttribute('data-api-hydrated') !== 'true') {
          applyCachedApiIcon(node, spec);
        }
        continue;
      }

      var parts = spec.split(':');
      var prefix = parts[0];
      var name = parts[1];
      if (!byPrefix[prefix]) byPrefix[prefix] = {};
      if (!byPrefix[prefix][name]) byPrefix[prefix][name] = [];
      byPrefix[prefix][name].push(node);
    }

    Object.keys(byPrefix).forEach(function (prefix) {
      var names = Object.keys(byPrefix[prefix]);
      if (!names.length) return;

      var batchKey = prefix + ':' + names.slice().sort().join(',');
      if (!pendingIconBatches[batchKey]) {
        pendingIconBatches[batchKey] = $.ajax({
          url: 'https://api.iconify.design/' + encodeURIComponent(prefix) + '.json',
          method: 'GET',
          data: { icons: names.join(',') },
          dataType: 'json',
          cache: true,
          timeout: 6000
        }).always(function () {
          delete pendingIconBatches[batchKey];
        });
      }

      pendingIconBatches[batchKey].done(function (payload) {
        if (!payload || !payload.icons) return;
        var defW = payload.width || 24;
        var defH = payload.height || 24;
        var iconsMap = payload.icons || {};
        var aliasesMap = payload.aliases || {};

        names.forEach(function (iconName) {
          var fullKey = prefix + ':' + iconName;
          var entry = iconsMap[iconName];
          if (!entry && aliasesMap[iconName] && aliasesMap[iconName].parent) {
            entry = iconsMap[aliasesMap[iconName].parent];
          }
          if (entry && entry.body) {
            apiIconSvgCache[fullKey] = buildApiSvgMarkup(entry, defW, defH);
          }
        });

        var currentNodes = (container || document).querySelectorAll
          ? (container || document).querySelectorAll('[data-api-icon]')
          : [];
        for (var j = 0; j < currentNodes.length; j++) {
          var target = currentNodes[j];
          var k = (target.getAttribute('data-api-icon') || '').trim();
          if (apiIconSvgCache[k]) {
            applyCachedApiIcon(target, k);
          }
        }
      });
    });
  }

  function replayApiIcon(el) {
    if (!el || prefersReducedMotion()) return;
    var node = el.jquery ? el[0] : el;
    if (!node) return;
    var target = node.hasAttribute && node.hasAttribute('data-api-icon')
      ? node
      : (node.querySelector ? node.querySelector('[data-api-icon]') : null);
    if (!target) return;

    var key = (target.getAttribute('data-api-icon') || '').trim();
    if (apiIconSvgCache[key]) {
      target.innerHTML = apiIconSvgCache[key];
      return;
    }
    var svg = target.querySelector ? target.querySelector('svg') : null;
    if (svg && typeof svg.setCurrentTime === 'function') {
      try { svg.setCurrentTime(0); } catch (_e) {}
    }
  }

  function refreshIcons(container) {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try {
        window.lucide.createIcons({ attrs: { 'stroke-width': 1.9 } });
      } catch (_e) {
        // Ignore non-fatal icon refresh errors
      }
    }
    hydrateApiIcons(container);
  }

  function toast(message, type) {
    var variant = type || 'info';
    var iconName = 'info';
    if (variant === 'success') iconName = 'check-circle-2';
    else if (variant === 'warning') iconName = 'alert-triangle';
    else if (variant === 'error') iconName = 'alert-circle';

    var $container = $('#toast-container');
    if (!$container.length) {
      $container = $('<div id="toast-container" class="toast-container" aria-live="polite"></div>').appendTo('body');
    }

    var $item = $(
      '<div class="toast toast-' + fmt.escapeHtml(variant) + '" role="status">' +
        '<i data-lucide="' + iconName + '" class="icon-md" style="margin-top:1px;"></i>' +
        '<div class="flex-1">' + fmt.escapeHtml(message) + '</div>' +
        '<button type="button" class="btn-icon" style="width:24px;height:24px;" aria-label="Dismiss notification">' +
          '<i data-lucide="x" class="icon-xs"></i>' +
        '</button>' +
      '</div>'
    );

    $item.hide().appendTo($container).fadeIn(150);
    refreshIcons($item[0]);

    var timer = setTimeout(function () {
      $item.fadeOut(160, function () { $item.remove(); });
    }, 4200);

    $item.find('button').on('click', function () {
      clearTimeout(timer);
      $item.fadeOut(120, function () { $item.remove(); });
    });
  }

  function setButtonLoading($btn, isLoading, loadingText) {
    if (!$btn || !$btn.length) return;
    if (isLoading) {
      if ($btn.data('orig-html') === undefined) {
        $btn.data('orig-html', $btn.html());
      }
      $btn.addClass('is-loading').prop('disabled', true);
      var label = loadingText ? '<span>' + fmt.escapeHtml(loadingText) + '</span>' : '';
      $btn.html('<span class="spinner" aria-hidden="true"></span>' + label);
    } else {
      $btn.removeClass('is-loading').prop('disabled', false);
      if ($btn.data('orig-html') !== undefined) {
        $btn.html($btn.data('orig-html'));
        $btn.removeData('orig-html');
        refreshIcons($btn[0]);
      }
    }
  }

  function openModal(options) {
    closeModal();
    activeModalTrigger = document.activeElement;
    var sizeClass = options.size === 'lg' ? 'modal-lg' : (options.size === 'sm' ? 'modal-sm' : '');

    var footerSection = options.footerHtml
      ? '<div class="modal-footer">' + options.footerHtml + '</div>'
      : '';

    var $backdrop = $(
      '<div class="modal-backdrop" id="active-modal-backdrop" role="presentation">' +
        '<div class="modal-dialog ' + sizeClass + '" role="dialog" aria-modal="true" aria-labelledby="active-modal-title">' +
          '<div class="modal-header">' +
            '<h2 class="modal-title" id="active-modal-title">' + fmt.escapeHtml(options.title || '') + '</h2>' +
            '<button type="button" class="btn-icon js-close-modal" aria-label="Close dialog">' +
              '<i data-lucide="x" class="icon-md"></i>' +
            '</button>' +
          '</div>' +
          '<div class="modal-body">' + (options.bodyHtml || '') + '</div>' +
          footerSection +
        '</div>' +
      '</div>'
    );

    $('body').append($backdrop).css('overflow', 'hidden');
    refreshIcons($backdrop[0]);

    if (typeof options.onMount === 'function') {
      options.onMount($backdrop);
    }

    var $focusTarget = $backdrop.find('input, textarea, select, button:not(.js-close-modal)').first();
    if ($focusTarget.length) {
      $focusTarget.trigger('focus');
    } else {
      $backdrop.find('.js-close-modal').trigger('focus');
    }

    return $backdrop;
  }

  function closeModal() {
    var $existing = $('#active-modal-backdrop');
    if ($existing.length) {
      $existing.remove();
      $('body').css('overflow', '');
      if (activeModalTrigger && typeof activeModalTrigger.focus === 'function') {
        try { activeModalTrigger.focus(); } catch (_e) {}
      }
      activeModalTrigger = null;
    }
  }

  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var settled = false;
      var btnClass = opts.danger ? 'btn-danger' : 'btn-primary';
      var $modal = openModal({
        title: opts.title || 'Confirm Action',
        size: 'sm',
        bodyHtml: '<p class="text-body">' + fmt.escapeHtml(opts.message || 'Are you sure you want to proceed?') + '</p>',
        footerHtml:
          '<button type="button" class="btn btn-secondary js-confirm-cancel">Cancel</button>' +
          '<button type="button" class="btn ' + btnClass + ' js-confirm-accept">' +
            fmt.escapeHtml(opts.confirmLabel || 'Confirm') +
          '</button>'
      });

      $modal.on('click', '.js-confirm-accept', function () {
        settled = true;
        closeModal();
        resolve(true);
      });

      $modal.on('click', '.js-confirm-cancel, .js-close-modal', function () {
        if (!settled) {
          settled = true;
          closeModal();
          resolve(false);
        }
      });
    });
  }

  function openLightbox(src, altText) {
    $('#active-lightbox').remove();
    var $lb = $(
      '<div class="lightbox-backdrop" id="active-lightbox" role="dialog" aria-modal="true" aria-label="Image preview">' +
        '<button type="button" class="btn-icon" id="close-lightbox-btn" aria-label="Close image preview" ' +
          'style="position:fixed;top:16px;right:16px;background:rgba(255,255,255,0.14);color:#fff;">' +
          '<i data-lucide="x" class="icon-lg"></i>' +
        '</button>' +
        '<img src="' + fmt.escapeHtml(src) + '" alt="' + fmt.escapeHtml(altText || 'Post attachment') + '" />' +
      '</div>'
    );
    $('body').append($lb);
    refreshIcons($lb[0]);
  }

  function renderPostSkeletons(count) {
    var total = count || 3;
    var html = '';
    for (var i = 0; i < total; i++) {
      html +=
        '<div class="panel" style="padding:16px;margin-bottom:16px;" aria-hidden="true">' +
          '<div class="flex items-center gap-3 mb-4">' +
            '<div class="skeleton skeleton-circle" style="width:42px;height:42px;"></div>' +
            '<div class="flex-1">' +
              '<div class="skeleton" style="width:160px;height:13px;margin-bottom:6px;"></div>' +
              '<div class="skeleton" style="width:110px;height:11px;"></div>' +
            '</div>' +
          '</div>' +
          '<div class="skeleton" style="width:100%;height:13px;margin-bottom:8px;"></div>' +
          '<div class="skeleton" style="width:88%;height:13px;margin-bottom:8px;"></div>' +
          '<div class="skeleton" style="width:62%;height:13px;"></div>' +
        '</div>';
    }
    return html;
  }

  function resolveEmptyStateApiIcon(iconName) {
    var raw = (iconName || 'inbox').trim();
    if (raw.indexOf(':') !== -1) return raw;

    var iconMap = {
      'alert-circle': 'lucide:circle-alert',
      'circle-alert': 'lucide:circle-alert',
      'newspaper': 'lucide:newspaper',
      'sparkles': 'lucide:sparkles',
      'users': 'lucide:users',
      'user-x': 'lucide:user-x',
      'message-square': 'lucide:message-square',
      'messages-square': 'lucide:messages-square',
      'megaphone': 'lucide:megaphone',
      'bell': 'lucide:bell',
      'bell-off': 'lucide:bell-off',
      'file-text': 'lucide:file-text',
      'search-x': 'lucide:search-x',
      'search': 'lucide:search',
      'inbox': 'lucide:inbox',
      'wifi-off': 'lucide:wifi-off'
    };

    return iconMap[raw] || ('lucide:' + raw);
  }

  function renderEmptyState(iconName, title, description, ctaHtml) {
    var apiSpec = resolveEmptyStateApiIcon(iconName);
    var fallbackName = (iconName || 'inbox').trim().replace(/^[a-z0-9_-]+:/i, '');

    setTimeout(function () {
      if (typeof refreshIcons === 'function') {
        refreshIcons();
      }
    }, 15);

    return (
      '<div class="panel empty-state">' +
        '<div class="empty-state-icon" data-api-icon="' + fmt.escapeHtml(apiSpec) + '" aria-hidden="true">' +
          '<i data-lucide="' + fmt.escapeHtml(fallbackName) + '"></i>' +
        '</div>' +
        '<h3 class="empty-state-title">' + fmt.escapeHtml(title) + '</h3>' +
        '<p class="empty-state-desc">' + fmt.escapeHtml(description) + '</p>' +
        (ctaHtml ? '<div class="mt-2">' + ctaHtml + '</div>' : '') +
      '</div>'
    );
  }

  // -------------------------------------------------------------------------
  // ACCESSIBLE INSTITUTIONAL COMBOBOX / DROPDOWN PRIMITIVE
  // -------------------------------------------------------------------------
  function closeAllComboboxes(exceptEl) {
    $('.ug-combobox.is-open').each(function () {
      if (exceptEl && this === exceptEl) return;
      var $cb = $(this);
      $cb.removeClass('is-open is-dropup');
      $cb.find('.ug-combobox-trigger').attr('aria-expanded', 'false');
      $cb.find('.ug-combobox-popover').addClass('hidden');
    });
  }

  function renderComboboxOptions($combo, query) {
    var cfg = $combo.data('ugComboCfg') || { items: [] };
    var items = cfg.items || [];
    var currentVal = ($combo.find('input[type="hidden"]').val() || '').trim();
    var q = (query || '').trim().toLowerCase();
    var tokens = q ? q.split(/\s+/).filter(Boolean) : [];

    var filtered = items.filter(function (item) {
      if (!tokens.length) return true;
      var hay = (
        (item.label || '') + ' ' +
        (item.value || '') + ' ' +
        (item.badge || '') + ' ' +
        (item.group || '') + ' ' +
        (item.keywords || '')
      ).toLowerCase();
      for (var i = 0; i < tokens.length; i++) {
        if (hay.indexOf(tokens[i]) === -1) return false;
      }
      return true;
    });

    var $list = $combo.find('.ug-combobox-list');
    if (!filtered.length) {
      $list.html(
        '<div class="ug-combobox-empty">No matching program or level found.</div>'
      );
      return;
    }

    var html = '';
    var lastGroup = null;
    var activeFound = false;

    for (var idx = 0; idx < filtered.length; idx++) {
      var opt = filtered[idx];
      if (opt.group && opt.group !== lastGroup) {
        lastGroup = opt.group;
        html += '<div class="ug-combobox-group-label" role="presentation">' + fmt.escapeHtml(opt.group) + '</div>';
      }
      var isSelected = currentVal && opt.value === currentVal;
      var isHigh = isSelected && !activeFound;
      if (isHigh) activeFound = true;

      html +=
        '<button type="button" role="option" class="ug-combobox-option' +
        (isSelected ? ' is-selected' : '') +
        (isHigh ? ' is-highlighted' : '') +
        '" aria-selected="' + (isSelected ? 'true' : 'false') +
        '" data-value="' + fmt.escapeHtml(opt.value) +
        '" data-label="' + fmt.escapeHtml(opt.label) +
        '" data-badge="' + fmt.escapeHtml(opt.badge || '') + '">' +
          '<span class="ug-combobox-option-main">' +
            '<span class="ug-combobox-option-text">' + fmt.escapeHtml(opt.label) + '</span>' +
            (opt.subtext ? '<span class="ug-combobox-option-sub">' + fmt.escapeHtml(opt.subtext) + '</span>' : '') +
          '</span>' +
          '<span class="ug-combobox-option-right">' +
            (opt.badge ? '<span class="ug-combobox-option-tag">' + fmt.escapeHtml(opt.badge) + '</span>' : '') +
            '<span class="ug-combobox-check" aria-hidden="true">&#10003;</span>' +
          '</span>' +
        '</button>';
    }

    $list.html(html);
    if (!activeFound) {
      $list.find('.ug-combobox-option').first().addClass('is-highlighted');
    }
  }

  function setComboboxValue($combo, value, silent) {
    if (!$combo || !$combo.length) return;
    var cfg = $combo.data('ugComboCfg') || { items: [], placeholder: 'Select an option' };
    var cleanVal = (value || '').trim();
    var matched = null;

    for (var i = 0; i < (cfg.items || []).length; i++) {
      if (cfg.items[i].value === cleanVal) {
        matched = cfg.items[i];
        break;
      }
    }

    var $hidden = $combo.find('input[type="hidden"]');
    var $valSpan = $combo.find('.ug-combobox-value');
    var $badge = $combo.find('.ug-combobox-badge');
    var placeholder = cfg.placeholder || $valSpan.attr('data-placeholder') || 'Select an option';

    if (matched) {
      $hidden.val(matched.value);
      $valSpan.text(matched.label).removeClass('is-placeholder');
      if (matched.badge && $badge.length) {
        $badge.text(matched.badge).removeClass('hidden');
      } else if ($badge.length) {
        $badge.empty().addClass('hidden');
      }
    } else if (cleanVal && cfg.allowExistingValue) {
      // Preserve an existing DB value on Edit Profile even if legacy text
      $hidden.val(cleanVal);
      $valSpan.text(cleanVal).removeClass('is-placeholder');
      if ($badge.length) $badge.empty().addClass('hidden');
    } else {
      $hidden.val('');
      $valSpan.text(placeholder).addClass('is-placeholder');
      if ($badge.length) $badge.empty().addClass('hidden');
    }

    if (!silent) {
      var $group = $combo.closest('.form-group');
      $group.find('.ug-combobox-trigger, input[type="hidden"]').removeClass('is-invalid').removeAttr('aria-invalid');
      $group.find('.form-error').empty();
      $hidden.trigger('change');
      replayApiIcon($combo.find('.ug-combobox-trigger'));
    }
  }

  /**
   * Configures a .ug-combobox container with items, placeholder, and search mode.
   */
  function configureCombobox(selectorOrEl, config) {
    var $combo = $(selectorOrEl);
    if (!$combo.length) return;

    var cfg = Object.assign({
      items: [],
      placeholder: 'Select an option',
      searchPlaceholder: 'Search...',
      searchable: $combo.attr('data-searchable') === 'true',
      allowExistingValue: false
    }, config || {});

    $combo.data('ugComboCfg', cfg);
    $combo.attr('data-searchable', cfg.searchable ? 'true' : 'false');

    var $valSpan = $combo.find('.ug-combobox-value');
    $valSpan.attr('data-placeholder', cfg.placeholder);

    var $searchWrap = $combo.find('.ug-combobox-search-wrap');
    if (cfg.searchable) {
      $searchWrap.removeClass('hidden');
      $searchWrap.find('.ug-combobox-search-input').attr('placeholder', cfg.searchPlaceholder);
    } else {
      $searchWrap.addClass('hidden');
    }

    var existingVal = typeof cfg.value === 'string'
      ? cfg.value
      : ($combo.find('input[type="hidden"]').val() || '');
    setComboboxValue($combo, existingVal, true);
    if ($combo.hasClass('is-open')) {
      renderComboboxOptions($combo, $combo.find('.ug-combobox-search-input').val() || '');
    }
    refreshIcons($combo[0]);
    hydrateApiIcons($combo[0]);
  }

  // Canonical zero-latency BulSU catalog fallback while /api/v1/academics/catalog syncs from DB
  var DEFAULT_BULSU_CATALOG = {
    units: [
      { code: 'CICT', name: 'CICT — College of Information and Communications Technology', unit_type: 'college', campus: 'Main Campus (Malolos)' },
      { code: 'COE', name: 'COE — College of Engineering', unit_type: 'college', campus: 'Main Campus (Malolos)' },
      { code: 'CBEA', name: 'CBEA — College of Business Education and Accountancy', unit_type: 'college', campus: 'Main Campus (Malolos)' },
      { code: 'CAFA', name: 'CAFA — College of Architecture and Fine Arts', unit_type: 'college', campus: 'Main Campus (Malolos)' },
      { code: 'CIT', name: 'CIT — College of Industrial Technology', unit_type: 'college', campus: 'Main Campus (Malolos)' },
      { code: 'CPTE', name: 'CPTE — College of Professional Teacher Education', unit_type: 'college', campus: 'Main Campus (Malolos)' },
      { code: 'CS', name: 'CS — College of Science', unit_type: 'college', campus: 'Main Campus (Malolos)' },
      { code: 'CHTM', name: 'CHTM — College of Hospitality and Tourism Management', unit_type: 'college', campus: 'Main Campus (Malolos)' },
      { code: 'CSSP', name: 'CSSP — College of Social Sciences and Philosophy', unit_type: 'college', campus: 'Main Campus (Malolos)' },
      { code: 'CAL', name: 'CAL — College of Arts and Letters', unit_type: 'college', campus: 'Main Campus (Malolos)' },
      { code: 'CCJE', name: 'CCJE — College of Criminal Justice Education', unit_type: 'college', campus: 'Main Campus (Malolos)' },
      { code: 'CON', name: 'CON — College of Nursing', unit_type: 'college', campus: 'Main Campus (Malolos)' },
      { code: 'CSER', name: 'CSER — College of Sports, Exercise and Recreation', unit_type: 'college', campus: 'Main Campus (Malolos)' },
      { code: 'COL', name: 'COL — College of Law', unit_type: 'college', campus: 'Main Campus (Malolos)' },
      { code: 'COM', name: 'COM — College of Medicine', unit_type: 'college', campus: 'Main Campus (Malolos)' },
      { code: 'GS', name: 'GS — Graduate School', unit_type: 'graduate', campus: 'Main Campus (Malolos)' },
      { code: 'LHS', name: 'LHS — Laboratory High School', unit_type: 'basic_ed', campus: 'Main Campus (Malolos)' },
      { code: 'SARMIENTO', name: 'BulSU Sarmiento Campus (San Jose del Monte)', unit_type: 'external_campus', campus: 'Sarmiento Campus' },
      { code: 'BUSTOS', name: 'BulSU Bustos Campus', unit_type: 'external_campus', campus: 'Bustos Campus' },
      { code: 'MENESES', name: 'BulSU Meneses Campus (Bulakan)', unit_type: 'external_campus', campus: 'Meneses Campus' },
      { code: 'HAGONOY', name: 'BulSU Hagonoy Campus', unit_type: 'external_campus', campus: 'Hagonoy Campus' },
      { code: 'SAN_RAFAEL', name: 'BulSU San Rafael Campus', unit_type: 'external_campus', campus: 'San Rafael Campus' },
      { code: 'ADMIN', name: 'University Administrative & Student Support Offices', unit_type: 'office', campus: 'University-Wide' }
    ],
    programs: [
      { unit_code: 'CICT', code: 'BSIT', name: 'BS Information Technology (BSIT)', applicable_roles: 'student,teacher', campuses: 'Main, Sarmiento, Bustos, Meneses, Hagonoy' },
      { unit_code: 'CICT', code: 'BSIS', name: 'BS Information Systems (BSIS)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CICT', code: 'BLIS', name: 'Bachelor of Library and Information Science (BLIS)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CICT', code: 'ACT', name: 'Associate in Computer Technology (ACT)', applicable_roles: 'student,teacher', campuses: 'Main, Sarmiento, External Campuses' },
      { unit_code: 'COE', code: 'BSCE', name: 'BS Civil Engineering (BSCE)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'COE', code: 'BSCpE', name: 'BS Computer Engineering (BSCpE)', applicable_roles: 'student,teacher', campuses: 'Main, Bustos, Meneses' },
      { unit_code: 'COE', code: 'BSEE', name: 'BS Electrical Engineering (BSEE)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'COE', code: 'BSECE', name: 'BS Electronics Engineering (BSECE)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'COE', code: 'BSIE', name: 'BS Industrial Engineering (BSIE)', applicable_roles: 'student,teacher', campuses: 'Main, Bustos' },
      { unit_code: 'COE', code: 'BSMfE', name: 'BS Manufacturing Engineering (BSMfE)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'COE', code: 'BSME', name: 'BS Mechanical Engineering (BSME)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'COE', code: 'BSMEE', name: 'BS Mechatronics Engineering (BSMEE)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'COE', code: 'BSGE', name: 'BS General Engineering (BSGE)', applicable_roles: 'student,teacher', campuses: 'Hagonoy Campus' },
      { unit_code: 'CBEA', code: 'BSA', name: 'BS Accountancy (BSA)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CBEA', code: 'BSMA', name: 'BS Management Accounting (BSMA)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CBEA', code: 'BSBA-FM', name: 'BS Business Administration - Financial Management (BSBA-FM)', applicable_roles: 'student,teacher', campuses: 'Main, Sarmiento, Bustos, Meneses' },
      { unit_code: 'CBEA', code: 'BSBA-MM', name: 'BS Business Administration - Marketing Management (BSBA-MM)', applicable_roles: 'student,teacher', campuses: 'Main, Sarmiento, Bustos, Meneses' },
      { unit_code: 'CBEA', code: 'BSBA-BE', name: 'BS Business Administration - Business Economics (BSBA-BE)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CBEA', code: 'BSENTREP', name: 'BS Entrepreneurship (BS Entrep)', applicable_roles: 'student,teacher', campuses: 'Main, Sarmiento, Bustos' },
      { unit_code: 'CAFA', code: 'BSARCH', name: 'BS Architecture (BS Arch)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CAFA', code: 'BLA', name: 'Bachelor of Landscape Architecture (BLA)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CAFA', code: 'BFA-VC', name: 'Bachelor of Fine Arts - Visual Communication (BFA)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CIT', code: 'BIT-COMP', name: 'Bachelor of Industrial Technology - Computer Technology', applicable_roles: 'student,teacher', campuses: 'Main, Sarmiento, Bustos, Meneses' },
      { unit_code: 'CIT', code: 'BIT-AUTO', name: 'Bachelor of Industrial Technology - Automotive Technology', applicable_roles: 'student,teacher', campuses: 'Main, Bustos' },
      { unit_code: 'CIT', code: 'BIT-DDGT', name: 'Bachelor of Industrial Technology - Drafting & Digital Graphics', applicable_roles: 'student,teacher', campuses: 'Main, Bustos' },
      { unit_code: 'CIT', code: 'BIT-ELEC', name: 'Bachelor of Industrial Technology - Electrical Technology', applicable_roles: 'student,teacher', campuses: 'Main, Bustos' },
      { unit_code: 'CIT', code: 'BIT-ELEX', name: 'Bachelor of Industrial Technology - Electronics Technology', applicable_roles: 'student,teacher', campuses: 'Main, Bustos, Meneses' },
      { unit_code: 'CIT', code: 'BIT-FSM', name: 'Bachelor of Industrial Technology - Food Processing & Service', applicable_roles: 'student,teacher', campuses: 'Main, Bustos, Meneses' },
      { unit_code: 'CIT', code: 'BIT-MECH', name: 'Bachelor of Industrial Technology - Mechanical Technology', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CIT', code: 'BIT-MCT', name: 'Bachelor of Industrial Technology - Mechatronics Technology', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CIT', code: 'BIT-HVACR', name: 'Bachelor of Industrial Technology - HVAC/R Technology', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CIT', code: 'BIT-WELD', name: 'Bachelor of Industrial Technology - Welding Technology', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CPTE', code: 'BEED', name: 'Bachelor of Elementary Education (BEEd)', applicable_roles: 'student,teacher', campuses: 'Main, Sarmiento, Bustos, Meneses, Hagonoy' },
      { unit_code: 'CPTE', code: 'BECED', name: 'Bachelor of Early Childhood Education (BECEd)', applicable_roles: 'student,teacher', campuses: 'Main, Bustos' },
      { unit_code: 'CPTE', code: 'BSED-ENG', name: 'Bachelor of Secondary Education - English (BSEd-Eng)', applicable_roles: 'student,teacher', campuses: 'Main, Sarmiento, Bustos, Meneses' },
      { unit_code: 'CPTE', code: 'BSED-FIL', name: 'Bachelor of Secondary Education - Filipino (BSEd-Fil)', applicable_roles: 'student,teacher', campuses: 'Main, Sarmiento, Meneses' },
      { unit_code: 'CPTE', code: 'BSED-MATH', name: 'Bachelor of Secondary Education - Mathematics (BSEd-Math)', applicable_roles: 'student,teacher', campuses: 'Main, Sarmiento, Bustos, Meneses' },
      { unit_code: 'CPTE', code: 'BSED-SCI', name: 'Bachelor of Secondary Education - Science (BSEd-Sci)', applicable_roles: 'student,teacher', campuses: 'Main, Sarmiento, Bustos, Meneses' },
      { unit_code: 'CPTE', code: 'BSED-SS', name: 'Bachelor of Secondary Education - Social Studies (BSEd-SS)', applicable_roles: 'student,teacher', campuses: 'Main, Bustos' },
      { unit_code: 'CPTE', code: 'BTLED', name: 'Bachelor of Technology and Livelihood Education (BTLEd)', applicable_roles: 'student,teacher', campuses: 'Main, Bustos' },
      { unit_code: 'CPTE', code: 'BPED', name: 'Bachelor of Physical Education (BPEd)', applicable_roles: 'student,teacher', campuses: 'Main, Bustos, Meneses' },
      { unit_code: 'CS', code: 'BSBIO', name: 'BS Biology', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CS', code: 'BSENVSCI', name: 'BS Environmental Science', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CS', code: 'BSFT', name: 'BS Food Technology', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CS', code: 'BSMATH-CS', name: 'BS Mathematics - Computer Science', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CS', code: 'BSMATH-AS', name: 'BS Mathematics - Applied Statistics', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CS', code: 'BSMATH-BA', name: 'BS Mathematics - Business Applications', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CS', code: 'BSMEDTECH', name: 'BS Medical Technology / Medical Laboratory Science', applicable_roles: 'student,teacher', campuses: 'Main, San Rafael' },
      { unit_code: 'CHTM', code: 'BSHM', name: 'BS Hospitality Management (BSHM)', applicable_roles: 'student,teacher', campuses: 'Main, Sarmiento, Meneses, Hagonoy' },
      { unit_code: 'CHTM', code: 'BSTM', name: 'BS Tourism Management (BSTM)', applicable_roles: 'student,teacher', campuses: 'Main, Sarmiento, Hagonoy' },
      { unit_code: 'CSSP', code: 'BSPSYCH', name: 'BS Psychology', applicable_roles: 'student,teacher', campuses: 'Main, San Rafael' },
      { unit_code: 'CSSP', code: 'BPUBAD', name: 'Bachelor of Public Administration (BPA)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CSSP', code: 'BSSW', name: 'BS Social Work (BSSW)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CAL', code: 'BABROAD', name: 'BA Broadcasting', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CAL', code: 'BAJOURN', name: 'BA Journalism', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CAL', code: 'BPA-THEA', name: 'Bachelor of Performing Arts - Theater Track', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CAL', code: 'BAMP', name: 'BA Malikhaing Pagsulat', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CCJE', code: 'BSCRIM', name: 'BS Criminology (BS Crim)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CCJE', code: 'BALM', name: 'BA Legal Management (BALM)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'CON', code: 'BSN', name: 'BS Nursing (BSN)', applicable_roles: 'student,teacher', campuses: 'Main, San Rafael' },
      { unit_code: 'CSER', code: 'BSESS', name: 'BS Exercise and Sports Sciences (BSESS)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'COL', code: 'JD', name: 'Juris Doctor (JD)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'COM', code: 'MD', name: 'Doctor of Medicine (MD)', applicable_roles: 'student,teacher', campuses: 'Main Campus' },
      { unit_code: 'GS', code: 'MIT', name: 'Master in Information Technology (MIT)', applicable_roles: 'student,teacher', campuses: 'Graduate School' },
      { unit_code: 'GS', code: 'MBA', name: 'Master in Business Administration (MBA)', applicable_roles: 'student,teacher', campuses: 'Graduate School' },
      { unit_code: 'GS', code: 'MPA', name: 'Master in Public Administration (MPA)', applicable_roles: 'student,teacher', campuses: 'Graduate School' },
      { unit_code: 'GS', code: 'MAED', name: 'Master of Arts in Education (MAEd)', applicable_roles: 'student,teacher', campuses: 'Graduate School' },
      { unit_code: 'GS', code: 'MENG', name: 'Master of Engineering (MEng)', applicable_roles: 'student,teacher', campuses: 'Graduate School' },
      { unit_code: 'GS', code: 'EDD', name: 'Doctor of Education (EdD)', applicable_roles: 'student,teacher', campuses: 'Graduate School' },
      { unit_code: 'GS', code: 'PHD', name: 'Doctor of Philosophy (PhD)', applicable_roles: 'student,teacher', campuses: 'Graduate School' },
      { unit_code: 'GS', code: 'DPA', name: 'Doctor of Public Administration (DPA)', applicable_roles: 'student,teacher', campuses: 'Graduate School' },
      { unit_code: 'LHS', code: 'SHS-STEM', name: 'Senior High School - STEM Strand', applicable_roles: 'student,teacher', campuses: 'Laboratory High School' },
      { unit_code: 'LHS', code: 'SHS-ABM', name: 'Senior High School - ABM Strand', applicable_roles: 'student,teacher', campuses: 'Laboratory High School' },
      { unit_code: 'LHS', code: 'SHS-HUMSS', name: 'Senior High School - HUMSS Strand', applicable_roles: 'student,teacher', campuses: 'Laboratory High School' },
      { unit_code: 'LHS', code: 'JHS', name: 'Laboratory Junior High School (Grades 7-10)', applicable_roles: 'student,teacher', campuses: 'Laboratory High School' },
      { unit_code: 'SARMIENTO', code: 'CAMP-SARM', name: 'BulSU Sarmiento Campus Department', applicable_roles: 'teacher,personnel', campuses: 'Sarmiento Campus' },
      { unit_code: 'BUSTOS', code: 'CAMP-BUST', name: 'BulSU Bustos Campus Department', applicable_roles: 'teacher,personnel', campuses: 'Bustos Campus' },
      { unit_code: 'MENESES', code: 'CAMP-MENE', name: 'BulSU Meneses Campus Department', applicable_roles: 'teacher,personnel', campuses: 'Meneses Campus' },
      { unit_code: 'HAGONOY', code: 'CAMP-HAGO', name: 'BulSU Hagonoy Campus Department', applicable_roles: 'teacher,personnel', campuses: 'Hagonoy Campus' },
      { unit_code: 'SAN_RAFAEL', code: 'CAMP-SANR', name: 'BulSU San Rafael Campus Department', applicable_roles: 'teacher,personnel', campuses: 'San Rafael Campus' },
      { unit_code: 'ADMIN', code: 'OFF-REG', name: 'Office of the University Registrar', applicable_roles: 'personnel', campuses: 'University-Wide' },
      { unit_code: 'ADMIN', code: 'OFF-OSAS', name: 'Office of Student Affairs and Services (OSAS)', applicable_roles: 'personnel', campuses: 'University-Wide' },
      { unit_code: 'ADMIN', code: 'OFF-ADM', name: 'Admissions and Orientation Office', applicable_roles: 'personnel', campuses: 'University-Wide' },
      { unit_code: 'ADMIN', code: 'OFF-ELIB', name: 'University E-Library & Learning Commons', applicable_roles: 'personnel', campuses: 'University-Wide' },
      { unit_code: 'ADMIN', code: 'OFF-MIS', name: 'Information Systems & ICT Office (MIS)', applicable_roles: 'personnel', campuses: 'University-Wide' },
      { unit_code: 'ADMIN', code: 'OFF-GUID', name: 'Guidance and Counseling Services Center', applicable_roles: 'personnel', campuses: 'University-Wide' },
      { unit_code: 'ADMIN', code: 'OFF-FIN', name: "Accounting, Budget & Cashier's Office", applicable_roles: 'personnel', campuses: 'University-Wide' },
      { unit_code: 'ADMIN', code: 'OFF-HRMO', name: 'Human Resource Management Office (HRMO)', applicable_roles: 'personnel', campuses: 'University-Wide' },
      { unit_code: 'ADMIN', code: 'OFF-CLIN', name: 'University Health & Medical Services (Clinic)', applicable_roles: 'personnel', campuses: 'University-Wide' },
      { unit_code: 'ADMIN', code: 'OFF-SCHOL', name: 'Scholarships and Financial Assistance Office', applicable_roles: 'personnel', campuses: 'University-Wide' }
    ],
    year_levels: [
      { code: '1ST_YEAR', label: '1st Year', applicable_role: 'student' },
      { code: '2ND_YEAR', label: '2nd Year', applicable_role: 'student' },
      { code: '3RD_YEAR', label: '3rd Year', applicable_role: 'student' },
      { code: '4TH_YEAR', label: '4th Year', applicable_role: 'student' },
      { code: '5TH_YEAR', label: '5th Year', applicable_role: 'student' },
      { code: 'IRREGULAR', label: 'Irregular', applicable_role: 'student' },
      { code: 'GRADUATE', label: "Graduate / Master's", applicable_role: 'student' },
      { code: 'DOCTORAL', label: 'Doctoral', applicable_role: 'student' },
      { code: 'GRADE_12', label: 'Grade 12 (SHS)', applicable_role: 'student' },
      { code: 'GRADE_11', label: 'Grade 11 (SHS)', applicable_role: 'student' },
      { code: 'JHS_7_10', label: 'Grades 7–10 (Lab High)', applicable_role: 'student' },
      { code: 'INST', label: 'Instructor I–III', applicable_role: 'teacher' },
      { code: 'ASST_PROF', label: 'Assistant Professor I–IV', applicable_role: 'teacher' },
      { code: 'ASSOC_PROF', label: 'Associate Professor I–V', applicable_role: 'teacher' },
      { code: 'PROF', label: 'Professor I–VI', applicable_role: 'teacher' },
      { code: 'LECTURER', label: 'Part-Time Lecturer', applicable_role: 'teacher' },
      { code: 'CHAIR_DEAN', label: 'Program Chair / Dean', applicable_role: 'teacher' }
    ]
  };

  /**
   * Builds role-tailored Course/Department and Year/Rank option arrays
   * from the database-backed BulSU academic catalog response.
   */
  function buildAcademicOptions(catalogData, role) {
    var r = role || 'student';
    var hasRemote = catalogData && Array.isArray(catalogData.programs) && catalogData.programs.length > 0;
    var data = hasRemote ? catalogData : DEFAULT_BULSU_CATALOG;
    var units = Array.isArray(data.units) ? data.units : DEFAULT_BULSU_CATALOG.units;
    var programs = Array.isArray(data.programs) ? data.programs : DEFAULT_BULSU_CATALOG.programs;
    var yearLevels = Array.isArray(data.year_levels) && data.year_levels.length
      ? data.year_levels
      : DEFAULT_BULSU_CATALOG.year_levels;

    var unitNameMap = {};
    units.forEach(function (u) {
      unitNameMap[u.code] = u.name;
    });

    var deptItems = [];

    if (r === 'personnel') {
      // Administrative & Support Offices first, then Campuses & Colleges
      programs.forEach(function (p) {
        var roles = String(p.applicable_roles || '');
        if (roles.indexOf('personnel') === -1) return;
        deptItems.push({
          value: p.name,
          label: p.name,
          badge: p.unit_code === 'ADMIN' ? 'OFFICE' : p.unit_code,
          group: unitNameMap[p.unit_code] || p.unit_code,
          keywords: (p.code || '') + ' ' + (p.campuses || '') + ' ' + (p.unit_code || '')
        });
      });
      units.forEach(function (u) {
        if (u.unit_type === 'college' || u.unit_type === 'graduate' || u.unit_type === 'basic_ed') {
          var cleanCollege = u.name.replace(/^[A-Z_]+\s+—\s+/, '');
          deptItems.push({
            value: cleanCollege + ' (' + u.code + ')',
            label: cleanCollege,
            badge: u.code,
            group: 'Academic Colleges & Units',
            keywords: u.code + ' ' + u.campus
          });
        }
      });
    } else if (r === 'teacher') {
      // Colleges & External Campuses first, followed by specific Degree Programs
      units.forEach(function (u) {
        if (u.unit_type === 'office') return;
        var cleanUnit = u.name.replace(/^[A-Z_]+\s+—\s+/, '');
        var val = u.unit_type === 'external_campus'
          ? u.name
          : (cleanUnit + ' (' + u.code + ')');
        deptItems.push({
          value: val,
          label: cleanUnit,
          badge: u.code,
          group: u.unit_type === 'external_campus' ? 'BulSU External Campuses' : 'BulSU Colleges & Academic Units',
          subtext: u.campus || '',
          keywords: u.code + ' ' + (u.campus || '')
        });
      });
      programs.forEach(function (p) {
        var roles = String(p.applicable_roles || '');
        if (roles.indexOf('student') === -1) return;
        deptItems.push({
          value: p.name,
          label: p.name,
          badge: p.unit_code,
          group: unitNameMap[p.unit_code] || p.unit_code,
          subtext: p.campuses && p.campuses !== 'Main Campus' ? ('Campuses: ' + p.campuses) : '',
          keywords: (p.code || '') + ' ' + (p.campuses || '') + ' ' + (p.unit_code || '')
        });
      });
    } else {
      // Student: Official BulSU Degree Courses / Programs grouped by College
      programs.forEach(function (p) {
        var roles = String(p.applicable_roles || '');
        if (roles.indexOf('student') === -1) return;
        deptItems.push({
          value: p.name,
          label: p.name,
          badge: p.unit_code,
          group: unitNameMap[p.unit_code] || p.unit_code,
          subtext: p.campuses && p.campuses !== 'Main Campus' ? ('Campuses: ' + p.campuses) : '',
          keywords: (p.code || '') + ' ' + (p.campuses || '') + ' ' + (p.unit_code || '')
        });
      });
    }

    var yearItems = [];
    yearLevels.forEach(function (y) {
      if (y.applicable_role === r || y.applicable_role === 'all') {
        yearItems.push({
          value: y.label,
          label: y.label,
          keywords: y.code || ''
        });
      }
    });

    return {
      departmentItems: deptItems,
      yearItems: yearItems
    };
  }

  function syncMobileComboLabels($combo) {
    var $tabs = $combo && $combo.data('ugLinkedTabs');
    if (!$tabs || !$tabs.length) return;
    var cfg = $combo.data('ugComboCfg');
    if (!cfg || !Array.isArray(cfg.items)) return;

    var currentVal = $combo.find('input[type="hidden"]').val() || '';
    $tabs.find('.filter-chip').each(function (idx) {
      var liveLabel = $.trim($(this).text());
      if (cfg.items[idx] && liveLabel) {
        cfg.items[idx].label = liveLabel;
        if (cfg.items[idx].value === currentVal) {
          $combo.find('.ug-combobox-value').text(liveLabel).removeClass('is-placeholder');
        }
      }
    });
  }

  function resolveMobileFilterPrefix($tabs) {
    var explicit = $.trim($tabs.attr('data-mobile-label') || '');
    if (explicit) return explicit;
    if ($tabs.find('.js-comm-filter, .js-ann-filter').length) return 'Category:';
    if ($tabs.find('.js-comm-detail-tab').length) return 'View:';
    if ($tabs.find('.js-json-scope').length) return 'Scope:';
    return 'Filter:';
  }

  /**
   * Progressively enhances horizontal .filter-tabs rows with a responsive
   * mobile Combo Box (.ug-combobox.mobile-filter-combobox) for <= 767px viewports,
   * eliminating horizontal chip clipping while keeping two-way state sync.
   */
  function enhanceResponsiveFilterTabs(container) {
    var $root = container ? $(container) : $(document);
    var $tabGroups = $root.is('.filter-tabs')
      ? $root
      : $root.find('.filter-tabs');

    $tabGroups.each(function () {
      var $tabs = $(this);
      if ($tabs.attr('data-mobile-combo-ready') === 'true') {
        syncMobileComboLabels($tabs.data('ugLinkedCombo'));
        return;
      }

      var $chips = $tabs.find('.filter-chip');
      if ($chips.length < 2) return;

      var items = [];
      var activeVal = '0';

      $chips.each(function (idx) {
        var $chip = $(this);
        var val = String(idx);
        $chip.attr('data-mobile-opt-idx', val);
        items.push({
          value: val,
          label: $.trim($chip.text())
        });
        if ($chip.hasClass('is-active')) {
          activeVal = val;
        }
      });

      var spacingClasses = (($tabs.attr('class') || '').match(/\bm[tb]-\d+\b/g) || []).join(' ');
      var ariaLabel = $.trim($tabs.attr('aria-label') || '') || 'Select filter';
      var prefixText = resolveMobileFilterPrefix($tabs);

      var $combo = $(
        '<div class="ug-combobox mobile-filter-combobox' + (spacingClasses ? ' ' + spacingClasses : '') + '" data-searchable="false">' +
          '<input type="hidden" value="' + fmt.escapeHtml(activeVal) + '" />' +
          '<button type="button" class="ug-combobox-trigger has-left-icon" aria-haspopup="listbox" aria-expanded="false" aria-label="' + fmt.escapeHtml(ariaLabel) + '">' +
            '<i data-lucide="sliders-horizontal" class="icon-sm input-icon-left"></i>' +
            '<span class="mobile-filter-prefix">' + fmt.escapeHtml(prefixText) + '</span>' +
            '<span class="ug-combobox-value" data-placeholder="Select filter"></span>' +
            '<span class="ug-combobox-chevron" aria-hidden="true">' +
              '<i data-lucide="chevron-down" class="icon-sm"></i>' +
            '</span>' +
          '</button>' +
          '<div class="ug-combobox-popover hidden" role="listbox">' +
            '<div class="ug-combobox-search-wrap hidden">' +
              '<i data-lucide="search" class="icon-xs ug-combobox-search-icon"></i>' +
              '<input type="text" class="ug-combobox-search-input" autocomplete="off" placeholder="Search..." />' +
            '</div>' +
            '<div class="ug-combobox-list"></div>' +
          '</div>' +
        '</div>'
      );

      $tabs.addClass('has-mobile-combo').attr('data-mobile-combo-ready', 'true');
      $combo.insertAfter($tabs);

      $combo.data('ugLinkedTabs', $tabs);
      $tabs.data('ugLinkedCombo', $combo);

      configureCombobox($combo, {
        items: items,
        placeholder: 'Select filter',
        searchable: false,
        value: activeVal
      });
    });
  }

  function openCombobox($combo) {
    if (!$combo.length) return;
    closeAllComboboxes($combo[0]);
    syncMobileComboLabels($combo);

    var triggerEl = $combo.find('.ug-combobox-trigger')[0];
    if (triggerEl && triggerEl.getBoundingClientRect) {
      var rect = triggerEl.getBoundingClientRect();
      var spaceBelow = (window.innerHeight || 800) - rect.bottom;
      if (spaceBelow < 255 && rect.top > 270) {
        $combo.addClass('is-dropup');
      } else {
        $combo.removeClass('is-dropup');
      }
    }

    var $search = $combo.find('.ug-combobox-search-input');
    if ($search.length) {
      $search.val('');
    }
    renderComboboxOptions($combo, '');

    $combo.addClass('is-open');
    $combo.find('.ug-combobox-trigger').attr('aria-expanded', 'true');
    $combo.find('.ug-combobox-popover').removeClass('hidden');

    var $selected = $combo.find('.ug-combobox-option.is-selected').first();
    if ($selected.length && $selected[0].scrollIntoView) {
      setTimeout(function () {
        try { $selected[0].scrollIntoView({ block: 'nearest' }); } catch (_e) {}
      }, 10);
    }

    if ($combo.attr('data-searchable') === 'true' && $search.length) {
      setTimeout(function () {
        $search.trigger('focus');
      }, 15);
    }
  }

  $(document).on('click', '.ug-combobox-trigger', function (e) {
    e.preventDefault();
    var $combo = $(this).closest('.ug-combobox');
    if ($combo.hasClass('is-open')) {
      closeAllComboboxes();
    } else {
      openCombobox($combo);
    }
  });

  $(document).on('input', '.ug-combobox-search-input', function () {
    var $combo = $(this).closest('.ug-combobox');
    renderComboboxOptions($combo, $(this).val());
  });

  $(document).on('mouseenter', '.ug-combobox-option', function () {
    var $opt = $(this);
    $opt.closest('.ug-combobox-list').find('.ug-combobox-option').removeClass('is-highlighted');
    $opt.addClass('is-highlighted');
  });

  $(document).on('click', '.ug-combobox-option', function (e) {
    e.preventDefault();
    var $opt = $(this);
    var $combo = $opt.closest('.ug-combobox');
    var val = $opt.attr('data-value') || '';
    setComboboxValue($combo, val, false);
    closeAllComboboxes();
    $combo.find('.ug-combobox-trigger').trigger('focus');
  });

  $(document).on('keydown', '.ug-combobox', function (e) {
    var $combo = $(this);
    var isOpen = $combo.hasClass('is-open');

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openCombobox($combo);
      }
      return;
    }

    var $opts = $combo.find('.ug-combobox-option');
    if (!$opts.length) return;

    var curIdx = -1;
    $opts.each(function (i) {
      if ($(this).hasClass('is-highlighted')) curIdx = i;
    });

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      var nextIdx = curIdx < $opts.length - 1 ? curIdx + 1 : 0;
      $opts.removeClass('is-highlighted');
      var $next = $opts.eq(nextIdx).addClass('is-highlighted');
      if ($next[0] && $next[0].scrollIntoView) {
        $next[0].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      var prevIdx = curIdx > 0 ? curIdx - 1 : $opts.length - 1;
      $opts.removeClass('is-highlighted');
      var $prev = $opts.eq(prevIdx).addClass('is-highlighted');
      if ($prev[0] && $prev[0].scrollIntoView) {
        $prev[0].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      var $active = curIdx >= 0 ? $opts.eq(curIdx) : $opts.first();
      if ($active.length) {
        $active.trigger('click');
      }
    }
  });

  // Two-Way Sync Between Mobile Filter Combobox & Desktop Filter Chips
  $(document).on('change', '.mobile-filter-combobox input[type="hidden"]', function () {
    var $combo = $(this).closest('.mobile-filter-combobox');
    if ($combo.data('ugSyncing')) return;
    var $tabs = $combo.data('ugLinkedTabs');
    if (!$tabs || !$tabs.length) return;

    var selectedIdx = $(this).val();
    var $targetChip = $tabs.find('.filter-chip[data-mobile-opt-idx="' + selectedIdx + '"]');
    if ($targetChip.length && !$targetChip.hasClass('is-active')) {
      $combo.data('ugSyncing', true);
      try {
        $targetChip.trigger('click');
      } finally {
        $combo.data('ugSyncing', false);
      }
    }
  });

  $(document).on('click', '.filter-tabs.has-mobile-combo .filter-chip', function () {
    var $chip = $(this);
    var $tabs = $chip.closest('.filter-tabs');
    var $combo = $tabs.data('ugLinkedCombo');
    if (!$combo || !$combo.length || $combo.data('ugSyncing')) return;

    var optIdx = $chip.attr('data-mobile-opt-idx');
    if (typeof optIdx === 'string' && optIdx !== '') {
      syncMobileComboLabels($combo);
      setComboboxValue($combo, optIdx, true);
    }
  });

  // Global Modal & Dropdown Keyboard/Click Dismissal
  $(document).on('click', '.js-close-modal', function () {
    closeModal();
  });

  $(document).on('mousedown', '#active-modal-backdrop', function (e) {
    if (e.target === this) {
      closeModal();
    }
  });

  $(document).on('click', '#active-lightbox, #close-lightbox-btn', function (e) {
    if (e.target.id === 'active-lightbox' || $(e.target).closest('#close-lightbox-btn').length) {
      $('#active-lightbox').remove();
    }
  });

  $(document).on('keydown', function (e) {
    if (e.key === 'Escape') {
      if ($('.ug-combobox.is-open').length) {
        var $openTrigger = $('.ug-combobox.is-open').first().find('.ug-combobox-trigger');
        closeAllComboboxes();
        $openTrigger.trigger('focus');
        return;
      }
      if ($('#active-lightbox').length) {
        $('#active-lightbox').remove();
        return;
      }
      if ($('#active-modal-backdrop').length) {
        closeModal();
      }
      $('.dropdown-menu').addClass('hidden');
      $('#quick-search-popover').addClass('hidden');
    }
  });

  $(document).on('click', function (e) {
    if (!$(e.target).closest('.ug-combobox').length) {
      closeAllComboboxes();
    }
    if (!$(e.target).closest('.dropdown').length) {
      $('.dropdown-menu').addClass('hidden');
    }
    if (!$(e.target).closest('.rail-search-box').length) {
      $('#quick-search-popover').addClass('hidden');
    }
  });

  window.UgnayraUI = {
    refreshIcons: refreshIcons,
    hydrateApiIcons: hydrateApiIcons,
    replayApiIcon: replayApiIcon,
    configureCombobox: configureCombobox,
    setComboboxValue: setComboboxValue,
    closeAllComboboxes: closeAllComboboxes,
    enhanceResponsiveFilterTabs: enhanceResponsiveFilterTabs,
    buildAcademicOptions: buildAcademicOptions,
    toast: toast,
    setButtonLoading: setButtonLoading,
    openModal: openModal,
    closeModal: closeModal,
    confirm: confirmDialog,
    openLightbox: openLightbox,
    renderPostSkeletons: renderPostSkeletons,
    renderEmptyState: renderEmptyState
  };
})(window, window.jQuery);
