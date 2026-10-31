/**
 * UGNAYRA — Authentication Controller (Mounts src/pages/auth/auth.html)
 * Handles Sign In, Sign Up, Google OAuth + Mandatory Institutional Onboarding
 * (MCPA-style profile completion), Campus Hero Carousel & Animated API Icons.
 */
(function (window, $) {
  'use strict';

  var UI = window.UgnayraUI;
  var fmt = window.UgnayraFormat;
  var Validator = window.UgnayraValidator;
  var Services = window.UgnayraServices;
  var Store = window.UgnayraStore;
  var Templates = window.UgnayraTemplates;

  var HERO_CYCLE_MS = 5400;
  var heroTimer = null;
  var activeHeroIndex = 0;
  var providerStatusCache = null;
  var academicCatalogCache = null;

  // Capture Supabase OAuth callback token from URL hash before router runs
  var pendingOAuthAccessToken = extractOAuthTokenFromHash();

  var AUTH_COPY = {
    login: {
      heading: 'Sign in',
      subheading: 'Enter your institutional credentials to access your campus workspace.'
    },
    register: {
      heading: 'Create account',
      subheading: 'Set up your campus profile to join classmates and faculty on UGNAYRA.'
    },
    onboarding: {
      heading: 'Complete your profile',
      subheading: 'Your Google account is verified. Enter your campus details to continue.'
    }
  };

  function extractOAuthTokenFromHash() {
    var rawHash = window.location.hash || '';
    if (rawHash.indexOf('access_token=') === -1) {
      return '';
    }
    try {
      var hashBody = rawHash.replace(/^#\/?/, '');
      var params = new URLSearchParams(hashBody);
      var token = params.get('access_token') || '';
      if (token && window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
      }
      return token;
    } catch (_e) {
      return '';
    }
  }

  function prefersReducedMotion() {
    return Boolean(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function clearHeroTimer() {
    if (heroTimer) {
      clearInterval(heroTimer);
      heroTimer = null;
    }
  }

  function activateHeroSlide(index) {
    var $root = $('#auth-view-root');
    if (!$root.length) {
      clearHeroTimer();
      return;
    }

    var total = $root.find('[data-hero-bg]').length || 4;
    var next = ((index % total) + total) % total;
    activeHeroIndex = next;

    $root.find('[data-hero-bg]').removeClass('is-active');
    $root.find('[data-hero-bg="' + next + '"]').addClass('is-active');

    $root.find('.js-hero-dot').each(function () {
      var isMatch = Number($(this).attr('data-slide')) === next;
      $(this)
        .toggleClass('is-active', isMatch)
        .attr('aria-selected', isMatch ? 'true' : 'false');
    });
  }

  function startHeroCycle() {
    clearHeroTimer();
    if (prefersReducedMotion()) return;

    heroTimer = setInterval(function () {
      if (document.visibilityState === 'hidden') return;
      if (!$('#auth-view-root').length) {
        clearHeroTimer();
        return;
      }
      activateHeroSlide(activeHeroIndex + 1);
    }, HERO_CYCLE_MS);
  }

  function setAuthMode(mode) {
    var targetMode = AUTH_COPY[mode] ? mode : 'login';
    var $card = $('#auth-card');
    if (!$card.length) return;

    $card.attr('data-auth-mode', targetMode);

    var copy = AUTH_COPY[targetMode];
    $('#auth-mode-heading').text(copy.heading);
    $('#auth-mode-subheading').text(copy.subheading);

    var $loginForm = $('#login-form');
    var $regForm = $('#register-form');
    var $onboardForm = $('#google-onboarding-form');

    $loginForm.addClass('hidden').removeClass('is-entering');
    $regForm.addClass('hidden').removeClass('is-entering');
    $onboardForm.addClass('hidden').removeClass('is-entering');

    Validator.clearFormErrors($loginForm);
    Validator.clearFormErrors($regForm);
    Validator.clearFormErrors($onboardForm);
    updatePasswordChecklistUI($('#reg-password').val() || '');

    var $activeForm = $loginForm;
    if (targetMode === 'register') $activeForm = $regForm;
    else if (targetMode === 'onboarding') $activeForm = $onboardForm;

    $activeForm.removeClass('hidden');
    if ($activeForm[0]) {
      void $activeForm[0].offsetWidth;
    }
    $activeForm.addClass('is-entering');

    var $checkedIcon = $activeForm.find('input[name="role"]:checked + .role-card [data-api-icon]');
    if ($checkedIcon.length) {
      UI.replayApiIcon($checkedIcon[0]);
    }
  }

  function openGoogleOnboardingStep(data) {
    var profile = (data && data.google_profile) || {};
    $('#onboard-token').val((data && data.onboarding_token) || '');
    $('#google-verified-email').text(profile.email || '');
    $('#onboard-fullname').val(profile.full_name || '');
    $('#onboard-username').val(profile.suggested_username || '');

    setAuthMode('onboarding');

    var $focusEl = profile.full_name
      ? $('#onboard-department-combo .ug-combobox-trigger')
      : $('#onboard-fullname');
    setTimeout(function () {
      $focusEl.trigger('focus');
    }, 60);
  }

  function verifyGoogleWithBackend(payload, $triggerBtn) {
    if ($triggerBtn && $triggerBtn.length) {
      UI.setButtonLoading($triggerBtn, true, 'Connecting to Google...');
    }

    return Services.Auth.googleAuth(payload)
      .then(function (res) {
        var d = res.data || {};
        if (d.needs_onboarding) {
          openGoogleOnboardingStep(d);
          UI.toast('Google verified! Complete your campus info to finish signing in.', 'info');
          return;
        }
        applyAuthSession(d);
        UI.toast('Welcome back, ' + ((d.user && d.user.full_name) || 'Member') + '!', 'success');
        window.UgnayraApp.mountAuthenticatedShell();
      })
      .catch(function (err) {
        UI.toast(err.message || 'Unable to sign in with Google.', 'error');
      })
      .finally(function () {
        if ($triggerBtn && $triggerBtn.length) {
          UI.setButtonLoading($triggerBtn, false);
        }
      });
  }

  function getProviderStatus() {
    if (providerStatusCache) {
      return Promise.resolve(providerStatusCache);
    }
    return Services.Auth.providers().then(function (res) {
      providerStatusCache = (res && res.data) || {};
      return providerStatusCache;
    });
  }

  function openDevGoogleBridgeModal($originBtn) {
    var $modal = UI.openModal({
      title: 'Continue with Google',
      size: 'sm',
      bodyHtml:
        '<form id="dev-google-bridge-form" novalidate>' +
          '<p class="text-body mb-3" style="font-size:0.9rem;color:var(--color-ink-600);">' +
            'Enter your Google account details to continue. New campus accounts will be prompted to complete their institutional profile next.' +
          '</p>' +
          '<div class="form-group mb-3">' +
            '<label class="form-label" for="dev-google-email">Google Email Address</label>' +
            '<input type="email" id="dev-google-email" name="dev_email" class="form-input" placeholder="Enter your Google email" required />' +
            '<div class="form-error"></div>' +
          '</div>' +
          '<div class="form-group mb-2">' +
            '<label class="form-label" for="dev-google-name">Google Display Name</label>' +
            '<input type="text" id="dev-google-name" name="dev_full_name" class="form-input" placeholder="Enter your full name" required />' +
            '<div class="form-error"></div>' +
          '</div>' +
          '<p style="font-size:0.77rem;color:var(--color-ink-400);line-height:1.45;margin-top:10px;">' +
            'Local Dev Mode: Enable <strong>Google</strong> under Supabase Authentication &rarr; Providers for live OAuth redirects.' +
          '</p>' +
        '</form>',
      footerHtml:
        '<button type="button" class="btn btn-secondary js-close-modal">Cancel</button>' +
        '<button type="submit" form="dev-google-bridge-form" class="btn btn-primary" id="dev-google-continue-btn">Continue</button>'
    });

    $modal.on('submit', '#dev-google-bridge-form', function (e) {
      e.preventDefault();
      var $f = $(this);
      var check = Validator.validateForm($f, {
        dev_email: { required: true, email: true, requiredMessage: 'Enter your Google email.' },
        dev_full_name: { required: true, minLength: 2, maxLength: 120, requiredMessage: 'Enter your name.' }
      });
      if (!check.valid) return;

      UI.closeModal();
      verifyGoogleWithBackend(check.values, $originBtn);
    });
  }

  function launchGoogleIdentityPopup(clientId, $btn) {
    function startPrompt() {
      if (!window.google || !window.google.accounts || !window.google.accounts.id) {
        UI.toast('Unable to load Google Sign-In script. Check your connection.', 'error');
        return;
      }
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: function (response) {
          if (response && response.credential) {
            verifyGoogleWithBackend({ google_id_token: response.credential }, $btn);
          }
        }
      });
      window.google.accounts.id.prompt();
    }

    if (window.google && window.google.accounts && window.google.accounts.id) {
      startPrompt();
      return;
    }

    UI.setButtonLoading($btn, true, 'Loading Google...');
    $.ajax({
      url: 'https://accounts.google.com/gsi/client',
      dataType: 'script',
      cache: true,
      timeout: 8000
    })
      .done(function () {
        UI.setButtonLoading($btn, false);
        startPrompt();
      })
      .fail(function () {
        UI.setButtonLoading($btn, false);
        UI.toast('Could not load Google Sign-In client.', 'error');
      });
  }

  function loadAcademicCatalog() {
    if (academicCatalogCache) {
      return Promise.resolve(academicCatalogCache);
    }
    return Services.Academics.catalog()
      .then(function (res) {
        academicCatalogCache = (res && res.data) || {};
        return academicCatalogCache;
      })
      .catch(function () {
        return {};
      });
  }

  function syncRoleLabels(role, prefix, preserveSelection) {
    var idLabelSel = '#' + prefix + '-school-id-label';
    var idInputSel = '#' + prefix + '-school-id';
    var deptLabelSel = '#' + prefix + '-dept-label';
    var deptComboSel = '#' + prefix + '-department-combo';
    var yearGroupSel = '#' + prefix + '-year-group';
    var yearLabelSel = '#' + prefix + '-year-label';
    var yearComboSel = '#' + prefix + '-year-combo';
    var extraRowSel = '#' + prefix + '-student-extra-row';
    var secLabelSel = '#' + prefix + '-section-label';
    var secInputSel = '#' + prefix + '-section';

    var deptPlaceholder = 'Select your course or program';
    var deptSearchPlaceholder = 'Search course, acronym, or college...';
    var yearPlaceholder = 'Select year level';

    if (role === 'teacher') {
      $(idLabelSel).html('Faculty ID <span class="form-label-optional">Numbers only &middot; Optional</span>');
      $(idInputSel).attr('placeholder', 'Enter faculty ID');
      $(deptLabelSel).text('College / Department');
      deptPlaceholder = 'Select your college or program';
      deptSearchPlaceholder = 'Search college, campus, or program...';
      $(yearGroupSel).removeClass('hidden');
      $(extraRowSel).removeClass('is-single-col');
      $(yearLabelSel).text('Academic Rank');
      yearPlaceholder = 'Select academic rank';
      $(secLabelSel).text('Advisory / Unit');
      $(secInputSel).attr('placeholder', 'Enter advisory or unit');
    } else if (role === 'personnel') {
      $(idLabelSel).html('Employee ID <span class="form-label-optional">Numbers only &middot; Optional</span>');
      $(idInputSel).attr('placeholder', 'Enter employee ID');
      $(deptLabelSel).text('Administrative Office / Unit');
      deptPlaceholder = 'Select your office or unit';
      deptSearchPlaceholder = 'Search office, unit, or campus...';
      $(yearGroupSel).addClass('hidden');
      $(extraRowSel).addClass('is-single-col');
      $(secLabelSel).text('Building / Unit');
      $(secInputSel).attr('placeholder', 'Enter building or unit');
    } else {
      $(idLabelSel).html('Student ID <span class="form-label-optional">Numbers only &middot; Optional</span>');
      $(idInputSel).attr('placeholder', 'Enter student ID');
      $(deptLabelSel).text('Course / Program');
      deptPlaceholder = 'Select your course or program';
      deptSearchPlaceholder = 'Search course, acronym, or college...';
      $(yearGroupSel).removeClass('hidden');
      $(extraRowSel).removeClass('is-single-col');
      $(yearLabelSel).text('Year Level');
      yearPlaceholder = 'Select year level';
      $(secLabelSel).text('Section');
      $(secInputSel).attr('placeholder', 'Enter section');
    }

    var currentDept = preserveSelection
      ? ($(deptComboSel).find('input[type="hidden"]').val() || '')
      : '';
    var currentYear = preserveSelection
      ? ($(yearComboSel).find('input[type="hidden"]').val() || '')
      : '';

    var built = UI.buildAcademicOptions(academicCatalogCache, role);
    UI.configureCombobox(deptComboSel, {
      items: built.departmentItems,
      placeholder: deptPlaceholder,
      searchPlaceholder: deptSearchPlaceholder,
      searchable: true,
      value: currentDept
    });
    UI.configureCombobox(yearComboSel, {
      items: built.yearItems,
      placeholder: yearPlaceholder,
      searchable: false,
      value: currentYear
    });
  }

  function mountAuthScreen() {
    clearHeroTimer();
    activeHeroIndex = 0;

    return Templates.renderInto('#app', Templates.VIEWS.AUTH).then(function ($target) {
      if (window.UgnayraTheme && typeof window.UgnayraTheme.syncAuthToggleUI === 'function') {
        window.UgnayraTheme.syncAuthToggleUI();
      }
      activateHeroSlide(0);
      startHeroCycle();
      updatePasswordChecklistUI('');

      // Hydrate comboboxes immediately at 0ms, then sync DB catalog seamlessly
      var initRegRole = $('#register-form input[name="role"]:checked').val() || 'student';
      var initOnbRole = $('#google-onboarding-form input[name="role"]:checked').val() || 'student';
      syncRoleLabels(initRegRole, 'reg', false);
      syncRoleLabels(initOnbRole, 'onboard', false);

      loadAcademicCatalog().then(function () {
        var regRole = $('#register-form input[name="role"]:checked').val() || 'student';
        var onbRole = $('#google-onboarding-form input[name="role"]:checked').val() || 'student';
        syncRoleLabels(regRole, 'reg', true);
        syncRoleLabels(onbRole, 'onboard', true);
      });

      // Handle OAuth return callback if present
      var callbackToken = pendingOAuthAccessToken || extractOAuthTokenFromHash();
      if (callbackToken) {
        pendingOAuthAccessToken = '';
        verifyGoogleWithBackend({ supabase_access_token: callbackToken }, $('.js-google-auth-btn').first());
        return $target;
      }

      try {
        var params = new URLSearchParams(window.location.search || '');
        if (params.get('mode') === 'register') {
          setAuthMode('register');
        }
      } catch (_e) {}

      return $target;
    });
  }

  function applyAuthSession(data) {
    clearHeroTimer();
    Store.setState({
      authenticated: true,
      user: data.user,
      csrfToken: data.csrf_token || Store.getState().csrfToken,
      sessionToken: data.session_token || Store.getState().sessionToken,
      unreadMessages: Number(data.unread_messages_count || 0),
      unreadNotifications: Number(data.unread_notifications_count || 0)
    });
  }

  // Interactive Hero Background Dot Selection
  $(document).on('click', '.js-hero-dot', function () {
    var idx = Number($(this).attr('data-slide') || 0);
    activateHeroSlide(idx);
    startHeroCycle();
  });

  // Switch between Sign In <-> Sign Up via bottom link only
  $(document).on('click', '.js-switch-auth', function () {
    var mode = $(this).attr('data-mode') === 'register' ? 'register' : 'login';
    setAuthMode(mode);
  });

  // Cancel Google Onboarding -> Return cleanly to Sign In
  $(document).on('click', '.js-cancel-google-onboarding', function () {
    $('#onboard-token').val('');
    setAuthMode('login');
  });

  // Continue with Google Handler
  $(document).on('click', '.js-google-auth-btn', function () {
    var $btn = $(this);
    UI.setButtonLoading($btn, true, 'Checking Google...');

    getProviderStatus()
      .then(function (status) {
        UI.setButtonLoading($btn, false);

        if (status.supabase_google_enabled && status.supabase_oauth_url) {
          var redirectUrl = window.location.origin + window.location.pathname;
          window.location.href =
            status.supabase_oauth_url + '&redirect_to=' + encodeURIComponent(redirectUrl);
          return;
        }

        if (status.google_client_id) {
          launchGoogleIdentityPopup(status.google_client_id, $btn);
          return;
        }

        if (status.dev_google_bridge) {
          openDevGoogleBridgeModal($btn);
          return;
        }

        UI.toast('Google Sign-In is not yet configured for this environment.', 'warning');
      })
      .catch(function () {
        UI.setButtonLoading($btn, false);
        UI.toast('Unable to reach authentication service.', 'error');
      });
  });

  // Dynamic Role Field Labels on Registration & Google Onboarding
  $(document).on('change', '#register-form input[name="role"]', function () {
    var role = $(this).val();
    var $icon = $(this).siblings('.role-card').find('[data-api-icon]');
    if ($icon.length) UI.replayApiIcon($icon[0]);
    syncRoleLabels(role, 'reg');
  });

  $(document).on('change', '#google-onboarding-form input[name="role"]', function () {
    var role = $(this).val();
    var $icon = $(this).siblings('.role-card').find('[data-api-icon]');
    if ($icon.length) UI.replayApiIcon($icon[0]);
    syncRoleLabels(role, 'onboard');
  });

  // Subtle field icon stroke replay on input focus
  $(document).on('focus', '.auth-card .form-input', function () {
    var $leadIcon = $(this).siblings('.auth-api-field-icon');
    if (!$leadIcon.length) return;
    var now = Date.now();
    var last = Number($leadIcon.data('last-replay') || 0);
    if (now - last > 1400) {
      $leadIcon.data('last-replay', now);
      UI.replayApiIcon($leadIcon[0]);
    }
  });

  // Password visibility toggle with animated API eye icon
  $(document).on('click', '.js-toggle-password', function () {
    var $btn = $(this);
    var $input = $btn.siblings('input');
    var isPw = $input.attr('type') === 'password';
    var nextApiIcon = isPw ? 'line-md:watch-off-twotone' : 'line-md:watch-twotone';
    var nextFallback = isPw ? 'eye-off' : 'eye';

    $input.attr('type', isPw ? 'text' : 'password');
    $btn.attr('aria-label', isPw ? 'Hide password' : 'Show password');
    $btn.html(
      '<span class="auth-eye-icon" data-api-icon="' + nextApiIcon + '" data-api-hydrated="false">' +
        '<i data-lucide="' + nextFallback + '" class="icon-sm"></i>' +
      '</span>'
    );
    UI.refreshIcons($btn[0]);
  });

  function getRegisterValidationRules(selectedRole) {
    var r = selectedRole || 'student';
    return {
      role: { required: true },
      full_name: {
        required: true,
        minLength: 2,
        maxLength: 120,
        personName: true,
        requireTwoWords: true,
        showValidState: true,
        requiredMessage: 'Enter your full name.'
      },
      username: {
        required: true,
        username: true,
        showValidState: true,
        requiredMessage: 'Enter a username.'
      },
      school_id_number: {
        digitsOnly: true,
        minDigits: 6,
        maxDigits: 12,
        showValidState: true
      },
      email: {
        required: true,
        email: true,
        maxLength: 150,
        showValidState: true,
        requiredMessage: 'Enter your email address.'
      },
      department: {
        required: true,
        minLength: 2,
        maxLength: 120,
        showValidState: true,
        requiredMessage: r === 'student'
          ? 'Select your course or program.'
          : 'Select your department or office.'
      },
      year_or_grade: {
        required: r === 'student',
        maxLength: 40,
        showValidState: true,
        requiredMessage: 'Select your year level.'
      },
      section: {
        required: r === 'student',
        maxLength: 20,
        sectionCode: true,
        showValidState: true,
        requiredMessage: 'Enter your class section.'
      },
      password: {
        required: true,
        minLength: 8,
        maxLength: 128,
        strongPassword: true,
        showValidState: true,
        requiredMessage: 'Enter a password.'
      },
      password_confirmation: {
        required: true,
        matchField: 'password',
        showValidState: true,
        requiredMessage: 'Confirm your password.',
        matchMessage: 'Passwords do not match.'
      }
    };
  }

  function getOnboardingValidationRules(selectedRole) {
    var r = selectedRole || 'student';
    return {
      onboarding_token: { required: true },
      role: { required: true },
      full_name: {
        required: true,
        minLength: 2,
        maxLength: 120,
        personName: true,
        requireTwoWords: true,
        showValidState: true,
        requiredMessage: 'Enter your full name.'
      },
      username: {
        required: true,
        username: true,
        showValidState: true,
        requiredMessage: 'Enter a username.'
      },
      school_id_number: {
        digitsOnly: true,
        minDigits: 6,
        maxDigits: 12,
        showValidState: true
      },
      department: {
        required: true,
        minLength: 2,
        maxLength: 120,
        showValidState: true,
        requiredMessage: r === 'student'
          ? 'Select your course or program.'
          : 'Select your department or office.'
      },
      year_or_grade: {
        required: r === 'student',
        maxLength: 40,
        showValidState: true,
        requiredMessage: 'Select your year level.'
      },
      section: {
        required: r === 'student',
        maxLength: 20,
        sectionCode: true,
        showValidState: true,
        requiredMessage: 'Enter your class section.'
      }
    };
  }

  function updatePasswordChecklistUI(pwValue) {
    var $box = $('#reg-password-rules');
    if (!$box.length) return;
    var state = Validator.evaluatePasswordStrength(pwValue || '');
    $box.attr('data-level', state.level);
    $box.attr('data-score', String(state.score));

    var labelText = state.level === 'empty'
      ? 'Password requirements'
      : ('Strength: ' + state.label);
    $('#reg-pw-strength-label').text(labelText);

    $box.find('[data-pw-rule="minLen"]').toggleClass('is-met', state.minLen);
    $box.find('[data-pw-rule="hasCases"]').toggleClass('is-met', state.hasCases);
    $box.find('[data-pw-rule="hasNumber"]').toggleClass('is-met', state.hasNumber);
    $box.find('[data-pw-rule="hasSymbol"]').toggleClass('is-met', state.hasSymbol);
  }

  // Real-time Password Strength & Confirmation Match Feedback
  $(document).on('input', '#reg-password', function () {
    var val = $(this).val() || '';
    var $form = $('#register-form');
    var role = $form.find('input[name="role"]:checked').val() || 'student';
    var rules = getRegisterValidationRules(role);

    updatePasswordChecklistUI(val);
    if (val.length > 0) {
      var st = Validator.evaluatePasswordStrength(val);
      if (st.valid) {
        Validator.setFieldValid($form, 'password');
      } else {
        $(this).removeClass('is-valid');
      }
    } else {
      $(this).removeClass('is-valid is-invalid');
    }

    var confirmVal = $('#reg-password-confirm').val() || '';
    if (confirmVal.length > 0) {
      Validator.validateSingleField($form, 'password_confirmation', rules);
    }
  });

  $(document).on('input', '#reg-password-confirm', function () {
    var $form = $('#register-form');
    var role = $form.find('input[name="role"]:checked').val() || 'student';
    Validator.validateSingleField($form, 'password_confirmation', getRegisterValidationRules(role));
  });

  // Real-time Field Validation on Blur & Combobox Change (Sign Up + Google Onboarding)
  $(document).on('blur change', '#register-form input[name], #google-onboarding-form input[name]', function () {
    var $el = $(this);
    var name = $el.attr('name');
    if (!name || name === 'role' || name === 'onboarding_token') return;

    $el.attr('data-touched', 'true');

    // Preserve active character-restriction flash message if currently shown
    var $err = $el.closest('.form-group').find('.form-error');
    if ($err.hasClass('is-restrict-hint')) return;

    var $form = $el.closest('form');
    var role = $form.find('input[name="role"]:checked').val() || 'student';
    var rules = $form.attr('id') === 'register-form'
      ? getRegisterValidationRules(role)
      : getOnboardingValidationRules(role);

    // On optional empty field (e.g. blank Student ID), do not mark error
    if (($el.val() || '').trim() === '' && rules[name] && !rules[name].required) {
      Validator.clearFieldError($el);
      $el.removeClass('is-valid');
      return;
    }

    Validator.validateSingleField($form, name, rules);
  });

  // Live Typing Validation Feedback on Non-Password Fields
  $(document).on('input', '#register-form input[name], #google-onboarding-form input[name]', function () {
    var $el = $(this);
    var name = $el.attr('name');
    if (!name || name === 'role' || name === 'onboarding_token' || name === 'password' || name === 'password_confirmation') {
      return;
    }

    var $err = $el.closest('.form-group').find('.form-error');
    if ($err.hasClass('is-restrict-hint')) return;

    var $form = $el.closest('form');
    var role = $form.find('input[name="role"]:checked').val() || 'student';
    var rules = $form.attr('id') === 'register-form'
      ? getRegisterValidationRules(role)
      : getOnboardingValidationRules(role);
    var rule = rules[name];
    if (!rule) return;

    var trimmed = ($el.val() || '').trim();
    if (!trimmed) {
      if ($el.attr('data-touched') === 'true' && rule.required) {
        Validator.validateSingleField($form, name, rules);
      } else {
        Validator.clearFieldError($el);
        $el.removeClass('is-valid');
      }
      return;
    }

    if ($el.attr('data-touched') === 'true') {
      Validator.validateSingleField($form, name, rules);
      return;
    }

    // Before first blur: silently show green .is-valid state as soon as input satisfies its rule
    var tmpFormCheck = Validator.validateSingleField;
    if (typeof tmpFormCheck === 'function') {
      // Check without flashing premature red errors while user is still mid-word
      var ok = false;
      if (name === 'full_name') {
        ok = !/[0-9]/.test(trimmed) &&
          /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u00D1\u00F1][A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u00D1\u00F1\s.'-]{1,119}$/.test(trimmed) &&
          trimmed.split(/\s+/).filter(Boolean).length >= 2;
      } else if (name === 'username') {
        ok = trimmed.length >= 3 && trimmed.length <= 30 && !/\.\./.test(trimmed) &&
          /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{1,28}[a-zA-Z0-9])?$/.test(trimmed);
      } else if (name === 'school_id_number') {
        ok = /^[0-9]{6,12}$/.test(trimmed);
      } else if (name === 'email') {
        ok = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(trimmed);
      } else if (name === 'section') {
        ok = /^[A-Za-z0-9][A-Za-z0-9\s/-]{0,19}$/.test(trimmed);
      }
      if (ok) {
        Validator.setFieldValid($form, name);
      } else {
        $el.removeClass('is-valid');
      }
    }
  });

  // 1. Email/Username Sign In Submission
  $(document).on('submit', '#login-form', function (e) {
    e.preventDefault();
    var $form = $(this);
    var check = Validator.validateForm($form, {
      identifier: { required: true, requiredMessage: 'Enter your email address or username.' },
      password: { required: true, requiredMessage: 'Enter your password.' }
    });
    if (!check.valid) return;

    var $btn = $('#login-submit-btn');
    UI.setButtonLoading($btn, true, 'Signing in...');

    Services.Auth.login(check.values)
      .then(function (res) {
        applyAuthSession(res.data || {});
        UI.toast('Welcome back, ' + ((res.data && res.data.user && res.data.user.full_name) || 'Member') + '!', 'success');
        window.UgnayraApp.mountAuthenticatedShell();
      })
      .catch(function (err) {
        if (err.details) {
          Validator.applyServerValidationErrors($form, err.details);
        }
        UI.toast(err.message || 'Invalid credentials.', 'error');
      })
      .finally(function () {
        UI.setButtonLoading($btn, false);
      });
  });

  // 2. Email Registration Submission
  $(document).on('submit', '#register-form', function (e) {
    e.preventDefault();
    var $form = $(this);
    var selectedRole = $form.find('input[name="role"]:checked').val() || 'student';
    updatePasswordChecklistUI($('#reg-password').val() || '');
    var check = Validator.validateForm($form, getRegisterValidationRules(selectedRole));
    if (!check.valid) return;

    var $btn = $('#register-submit-btn');
    UI.setButtonLoading($btn, true, 'Creating account...');

    Services.Auth.register(check.values)
      .then(function (res) {
        applyAuthSession(res.data || {});
        UI.toast('Campus account created! Welcome to UGNAYRA.', 'success');
        window.UgnayraApp.mountAuthenticatedShell();
      })
      .catch(function (err) {
        if (err.details) {
          Validator.applyServerValidationErrors($form, err.details);
        }
        UI.toast(err.message || 'Registration could not be completed.', 'error');
      })
      .finally(function () {
        UI.setButtonLoading($btn, false);
      });
  });

  // 3. Google Onboarding Profile Completion Submission (MCPA-Style Step)
  $(document).on('submit', '#google-onboarding-form', function (e) {
    e.preventDefault();
    var $form = $(this);
    var selectedRole = $form.find('input[name="role"]:checked').val() || 'student';
    var check = Validator.validateForm($form, getOnboardingValidationRules(selectedRole));
    if (!check.valid) return;

    check.values.onboarding_token = $('#onboard-token').val();

    var $btn = $('#onboard-submit-btn');
    UI.setButtonLoading($btn, true, 'Saving profile...');

    Services.Auth.googleComplete(check.values)
      .then(function (res) {
        applyAuthSession(res.data || {});
        UI.toast('Campus profile completed! Welcome to UGNAYRA.', 'success');
        window.UgnayraApp.mountAuthenticatedShell();
      })
      .catch(function (err) {
        if (err.details) {
          Validator.applyServerValidationErrors($form, err.details);
        }
        UI.toast(err.message || 'Could not complete campus profile.', 'error');
      })
      .finally(function () {
        UI.setButtonLoading($btn, false);
      });
  });

  // Logout Action
  $(document).on('click', '.js-logout-btn', function () {
    UI.confirm({
      title: 'Sign Out of UGNAYRA',
      message: 'Are you sure you want to end your current session?',
      confirmLabel: 'Sign Out',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      Services.Auth.logout()
        .catch(function () {})
        .finally(function () {
          window.UgnayraPolling.stopAll();
          Store.clearAuth();
          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', '/');
          } else {
            window.location.hash = '';
          }
          window.UgnayraApp.showAuthScreen();
          UI.toast('Signed out safely.', 'info');
        });
    });
  });

  window.UgnayraAuthModule = {
    mountAuthScreen: mountAuthScreen,
    applyAuthSession: applyAuthSession
  };
})(window, window.jQuery);
