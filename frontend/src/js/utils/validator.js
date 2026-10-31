/**
 * UGNAYRA — jQuery Form Validation, Input Restriction & Real-Time Feedback Utility
 * Enforces strict type restrictions (numbers-only IDs, letters-only names,
 * handle rules, strong passwords) with visible inline feedback.
 */
(function (window, $) {
  'use strict';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
  var USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{1,28}[a-zA-Z0-9])?$/;
  var PERSON_NAME_RE = /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u00D1\u00F1][A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u00D1\u00F1\s.'-]{1,119}$/;
  var DIGITS_RE = /^[0-9]+$/;
  var SECTION_RE = /^[A-Za-z0-9][A-Za-z0-9\s/-]{0,39}$/;

  var restrictHintTimers = {};

  function evaluatePasswordStrength(pw) {
    var val = String(pw || '');
    var minLen = val.length >= 8;
    var hasCases = /[A-Z]/.test(val) && /[a-z]/.test(val);
    var hasNumber = /[0-9]/.test(val);
    var hasSymbol = /[^A-Za-z0-9]/.test(val);

    var score = (minLen ? 1 : 0) + (hasCases ? 1 : 0) + (hasNumber ? 1 : 0) + (hasSymbol ? 1 : 0);
    var label = 'Enter password';
    var level = 'empty';

    if (val.length > 0) {
      if (score <= 1) {
        label = 'Weak';
        level = 'weak';
      } else if (score === 2) {
        label = 'Fair';
        level = 'fair';
      } else if (score === 3) {
        label = 'Good';
        level = 'good';
      } else {
        label = 'Strong';
        level = 'strong';
      }
    }

    return {
      minLen: minLen,
      hasCases: hasCases,
      hasNumber: hasNumber,
      hasSymbol: hasSymbol,
      score: score,
      valid: score === 4,
      label: label,
      level: level
    };
  }

  function setFieldError($form, fieldName, message) {
    var $field = $form.find('[name="' + fieldName + '"]');
    if (!$field.length) return;
    var $group = $field.closest('.form-group');
    $field.removeClass('is-valid').addClass('is-invalid').attr('aria-invalid', 'true');
    $group.find('.ug-combobox-trigger').removeClass('is-valid').addClass('is-invalid').attr('aria-invalid', 'true');
    var $err = $group.find('.form-error');
    if ($err.length) {
      $err.removeClass('is-restrict-hint').text(message);
    }
  }

  function setFieldValid($form, fieldName) {
    var $field = $form.find('[name="' + fieldName + '"]');
    if (!$field.length) return;
    var $group = $field.closest('.form-group');
    $field.removeClass('is-invalid').removeAttr('aria-invalid').addClass('is-valid');
    $group.find('.ug-combobox-trigger').removeClass('is-invalid').removeAttr('aria-invalid').addClass('is-valid');
    $group.find('.form-error').removeClass('is-restrict-hint').empty();
  }

  function clearFieldError($field) {
    var $group = $field.closest('.form-group');
    $field.removeClass('is-invalid').removeAttr('aria-invalid');
    $group.find('.ug-combobox-trigger, input[type="hidden"]').removeClass('is-invalid').removeAttr('aria-invalid');
    $group.find('.form-error').removeClass('is-restrict-hint').empty();
  }

  function clearFormErrors($form) {
    $form.find('.is-invalid, .is-valid').removeClass('is-invalid is-valid').removeAttr('aria-invalid');
    $form.find('[data-touched]').removeAttr('data-touched');
    $form.find('.form-error').removeClass('is-restrict-hint').empty();
  }

  function flashRestrictNotice($input, message) {
    var id = $input.attr('id') || $input.attr('name') || 'field';
    var $group = $input.closest('.form-group');
    var $err = $group.find('.form-error');
    if (!$err.length) return;

    $input.addClass('is-invalid');
    $err.addClass('is-restrict-hint').text(message);

    if (restrictHintTimers[id]) {
      clearTimeout(restrictHintTimers[id]);
    }
    restrictHintTimers[id] = setTimeout(function () {
      if ($err.hasClass('is-restrict-hint')) {
        $err.removeClass('is-restrict-hint').empty();
        $input.removeClass('is-invalid');
      }
    }, 2400);
  }

  function checkRuleValue(name, strVal, rawVal, rule, allValues) {
    if (rule.required && !strVal && rawVal !== true) {
      return rule.requiredMessage || 'This field is required.';
    }
    if (!strVal) return '';

    if (rule.personName) {
      if (/[0-9]/.test(strVal)) {
        return 'Numbers are not allowed in Full Name.';
      }
      if (!PERSON_NAME_RE.test(strVal)) {
        return 'Enter letters only (no special symbols).';
      }
      var nameParts = strVal.trim().split(/\s+/).filter(Boolean);
      if (rule.requireTwoWords && nameParts.length < 2) {
        return 'Enter both your first and last name.';
      }
    }

    if (rule.digitsOnly) {
      if (!DIGITS_RE.test(strVal)) {
        return 'Numbers only (0–9) — letters and symbols are not allowed.';
      }
      var minD = rule.minDigits || 6;
      var maxD = rule.maxDigits || 12;
      if (strVal.length < minD || strVal.length > maxD) {
        return 'ID number must be ' + minD + ' to ' + maxD + ' digits.';
      }
    }

    if (rule.email && !EMAIL_RE.test(strVal)) {
      return 'Enter a valid email address.';
    }

    if (rule.username) {
      if (strVal.length < 3 || strVal.length > 30) {
        return 'Username must be 3 to 30 characters.';
      }
      if (/\.\./.test(strVal) || !USERNAME_RE.test(strVal)) {
        return 'Start and end with a letter/number; use only . _ or - inside.';
      }
    }

    if (rule.sectionCode && !SECTION_RE.test(strVal)) {
      return 'Use letters, numbers, spaces, or hyphens only.';
    }

    if (rule.strongPassword) {
      var pwCheck = evaluatePasswordStrength(strVal);
      if (!pwCheck.valid) {
        return 'Complete all 4 password requirements below.';
      }
    }

    if (rule.minLength && strVal.length < rule.minLength) {
      return 'Must be at least ' + rule.minLength + ' characters.';
    }
    if (rule.maxLength && strVal.length > rule.maxLength) {
      return 'Must not exceed ' + rule.maxLength + ' characters.';
    }
    if (rule.matchField && strVal !== (allValues[rule.matchField] || '')) {
      return rule.matchMessage || 'Fields do not match.';
    }

    return '';
  }

  function extractFormValues($form, rules) {
    var values = {};
    Object.keys(rules).forEach(function (name) {
      var $el = $form.find('[name="' + name + '"]');
      if ($el.attr('type') === 'radio') {
        values[name] = $form.find('[name="' + name + '"]:checked').val() || '';
      } else if ($el.attr('type') === 'checkbox') {
        values[name] = $el.is(':checked');
      } else {
        var v = $el.val() || '';
        values[name] = $el.attr('type') === 'password' ? v : v.trim();
      }
    });
    return values;
  }

  function validateSingleField($form, fieldName, rules) {
    var rule = rules && rules[fieldName];
    if (!rule) return true;

    var values = extractFormValues($form, rules);
    var rawVal = values[fieldName];
    var strVal = typeof rawVal === 'string' ? rawVal : '';
    var errMsg = checkRuleValue(fieldName, strVal, rawVal, rule, values);

    if (errMsg) {
      setFieldError($form, fieldName, errMsg);
      return false;
    }

    if (strVal || rawVal === true) {
      setFieldValid($form, fieldName);
    } else {
      var $el = $form.find('[name="' + fieldName + '"]');
      clearFieldError($el);
      $el.removeClass('is-valid');
    }
    return true;
  }

  function applyServerValidationErrors($form, detailsObj) {
    if (!detailsObj || typeof detailsObj !== 'object') return;
    Object.keys(detailsObj).forEach(function (field) {
      var msgs = detailsObj[field];
      var firstMsg = Array.isArray(msgs) ? msgs[0] : String(msgs);
      setFieldError($form, field, firstMsg);
    });
    var $firstInvalid = $form
      .find('.ug-combobox-trigger.is-invalid, .form-input.is-invalid, .form-select.is-invalid, .form-textarea.is-invalid')
      .first();
    if ($firstInvalid.length) {
      $firstInvalid.trigger('focus');
    }
  }

  function validateForm($form, rules) {
    clearFormErrors($form);
    var isValid = true;
    var values = extractFormValues($form, rules);

    Object.keys(rules).forEach(function (name) {
      var rule = rules[name];
      var rawVal = values[name];
      var strVal = typeof rawVal === 'string' ? rawVal : '';
      var errMsg = checkRuleValue(name, strVal, rawVal, rule, values);

      if (errMsg) {
        setFieldError($form, name, errMsg);
        isValid = false;
      } else if (strVal && rule.showValidState) {
        setFieldValid($form, name);
      }
    });

    if (!isValid) {
      $form
        .find('.ug-combobox-trigger.is-invalid, .form-input.is-invalid, .form-select.is-invalid, .form-textarea.is-invalid')
        .first()
        .trigger('focus');
    }

    return { valid: isValid, values: values };
  }

  // Zero-Frame Keystroke Blocking for [data-restrict] Inputs
  $(document).on('keydown', 'input[data-restrict]', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var key = e.key || '';
    if (key.length !== 1) return; // Allow Backspace, Tab, Enter, Arrows, etc.

    var $el = $(this);
    var mode = $el.attr('data-restrict');

    if (mode === 'digits' && !/^[0-9]$/.test(key)) {
      e.preventDefault();
      flashRestrictNotice($el, 'Numbers only (0–9) — letters and symbols are not allowed.');
      return;
    }

    if (mode === 'name') {
      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        flashRestrictNotice($el, 'Letters only — numbers are not allowed in Full Name.');
        return;
      }
      if (!/^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u00D1\u00F1\s.'-]$/.test(key)) {
        e.preventDefault();
        flashRestrictNotice($el, 'Letters only — special symbols are not allowed.');
        return;
      }
    }

    if (mode === 'username' && !/^[a-zA-Z0-9._-]$/.test(key)) {
      e.preventDefault();
      flashRestrictNotice($el, 'Only letters, numbers, dots (.), underscores (_), and hyphens (-).');
      return;
    }

    if (mode === 'email' && /\s/.test(key)) {
      e.preventDefault();
      flashRestrictNotice($el, 'Spaces are not allowed in email addresses.');
      return;
    }

    if (mode === 'section' && !/^[A-Za-z0-9\s/-]$/.test(key)) {
      e.preventDefault();
      flashRestrictNotice($el, 'Letters, numbers, spaces, and hyphens only.');
    }
  });

  // Live Character Sanitization (Paste / Mobile IME / Autofill) for [data-restrict] Inputs
  $(document).on('input', 'input[data-restrict]', function () {
    var $el = $(this);
    var mode = $el.attr('data-restrict');
    var raw = $el.val() || '';
    var cleaned = raw;
    var blockedMsg = '';

    if (mode === 'digits') {
      cleaned = raw.replace(/[^0-9]/g, '');
      if (cleaned !== raw) {
        blockedMsg = 'Numbers only (0–9) — letters and symbols are not allowed.';
      }
    } else if (mode === 'name') {
      cleaned = raw
        .replace(/[0-9]/g, '')
        .replace(/[^A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u00D1\u00F1\s.'-]/g, '')
        .replace(/\s{2,}/g, ' ');
      if (cleaned !== raw) {
        blockedMsg = 'Letters only — numbers and symbols are not allowed.';
      }
    } else if (mode === 'username') {
      cleaned = raw.toLowerCase().replace(/[^a-z0-9._-]/g, '');
      if (cleaned !== raw.toLowerCase()) {
        blockedMsg = 'Only letters, numbers, dots (.), underscores (_), and hyphens (-).';
      }
    } else if (mode === 'email') {
      cleaned = raw.replace(/\s+/g, '');
    } else if (mode === 'section') {
      cleaned = raw.replace(/[^A-Za-z0-9\s/-]/g, '').replace(/\s{2,}/g, ' ');
      if (cleaned !== raw) {
        blockedMsg = 'Letters, numbers, spaces, and hyphens only.';
      }
    }

    if (cleaned !== raw) {
      $el.val(cleaned);
      if (blockedMsg) {
        flashRestrictNotice($el, blockedMsg);
      }
    }
  });

  // Global jQuery delegated listener to clear non-restriction errors as user types
  $(document).on('input change', '.form-input, .form-select, .form-textarea', function () {
    var $el = $(this);
    var $err = $el.closest('.form-group').find('.form-error');
    if ($el.hasClass('is-invalid') && !$err.hasClass('is-restrict-hint')) {
      clearFieldError($el);
    }
    var limit = parseInt($el.attr('data-char-limit'), 10);
    if (limit) {
      var targetSel = $el.attr('data-counter-target');
      if (targetSel) {
        var len = ($el.val() || '').length;
        $(targetSel).text(len + ' / ' + limit);
      }
    }
  });

  window.UgnayraValidator = {
    validateForm: validateForm,
    validateSingleField: validateSingleField,
    evaluatePasswordStrength: evaluatePasswordStrength,
    setFieldError: setFieldError,
    setFieldValid: setFieldValid,
    clearFieldError: clearFieldError,
    clearFormErrors: clearFormErrors,
    applyServerValidationErrors: applyServerValidationErrors
  };
})(window, window.jQuery);
