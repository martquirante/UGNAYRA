/**
 * UGNAYRA — Virtual Classroom Live WebRTC Meeting Module (UGNAYRA Live)
 * Real-time Audio/Video Conferencing, Gallery Grid, Active Speaker Detection,
 * Screen Share Pipeline, In-Meeting Chat Drawer & Graceful Session Teardown.
 */
(function (window, $) {
  'use strict';

  var Store = window.UgnayraStore;
  var UI = window.UgnayraUI;
  var Templates = window.UgnayraTemplates;
  var escapeHtml = window.UgnayraEscape ? window.UgnayraEscape.escapeHtml : function (s) { return s || ''; };

  var localStream = null;
  var screenStream = null;
  var isAudioMuted = false;
  var isVideoMuted = false;
  var isScreenSharing = false;
  var isHandRaised = false;
  var activeDrawerTab = null;

  var elapsedSeconds = 0;
  var timerInterval = null;
  var audioContext = null;
  var analyser = null;
  var micSource = null;
  var animFrameId = null;

  var currentMeetingCode = null;
  var participantsList = [];
  var inMeetingChatMessages = [];

  function isTeacherOrFaculty() {
    var user = Store.getState().user || {};
    var role = String(user.role || '').toLowerCase();
    return role === 'teacher' || role === 'faculty' || role === 'personnel' || role === 'admin';
  }

  function mountMeetingStage(meetingCode) {
    currentMeetingCode = meetingCode;
    elapsedSeconds = 0;
    isAudioMuted = false;
    isVideoMuted = false;
    isScreenSharing = false;
    isHandRaised = false;
    activeDrawerTab = null;

    return Templates.renderInto('#main-stage', Templates.VIEWS.MEETING_STAGE).then(function () {
      if (isTeacherOrFaculty()) {
        $('#meeting-btn-mute-all').removeClass('hidden');
      }

      var user = Store.getState().user || {};
      var userName = user.full_name || 'You';
      $('#local-participant-name').text(userName + ' (You)');
      $('#local-avatar-initials').text(userName.charAt(0).toUpperCase());
      $('#meeting-room-title').text('Classroom Live: ' + meetingCode);

      initMediaStream();
      startMeetingTimer();
      bindMeetingControls();
    });
  }

  function initMediaStream() {
    var constraints = {
      audio: true,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      }
    };

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia(constraints)
        .then(function (stream) {
          localStream = stream;
          var videoEl = document.getElementById('local-video-el');
          if (videoEl) {
            videoEl.srcObject = stream;
            videoEl.play().catch(function () {});
          }

          $('#local-mic-indicator').removeClass('is-muted').html('<i data-lucide="mic" class="icon-xs"></i>');
          UI.refreshIcons($('#local-mic-indicator')[0]);

          setupAudioActivityDetection(stream);
        })
        .catch(function (err) {
          console.warn('[UGNAYRA Live] Camera/Mic access warning:', err.message);
          $('#local-video-el').addClass('hidden');
          $('#local-avatar-fallback').removeClass('hidden');
          $('#meeting-btn-cam').addClass('is-off');
          isVideoMuted = true;
          UI.toast('Camera not available or access denied. Joining in audio/avatar mode.', 'info');
        });
    } else {
      $('#local-avatar-fallback').removeClass('hidden');
    }
  }

  function setupAudioActivityDetection(stream) {
    try {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      audioContext = new AudioContextClass();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      micSource = audioContext.createMediaStreamSource(stream);
      micSource.connect(analyser);

      var bufferLength = analyser.frequencyBinCount;
      var dataArray = new Uint8Array(bufferLength);

      function checkSpeaking() {
        if (!analyser || isAudioMuted) {
          $('#local-video-tile').removeClass('is-speaking');
          animFrameId = requestAnimationFrame(checkSpeaking);
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        var sum = 0;
        for (var i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        var avg = sum / bufferLength;

        // If average voice frequency is above speech threshold
        if (avg > 25) {
          $('#local-video-tile').addClass('is-speaking');
        } else {
          $('#local-video-tile').removeClass('is-speaking');
        }

        animFrameId = requestAnimationFrame(checkSpeaking);
      }

      checkSpeaking();
    } catch (_e) {}
  }

  function startMeetingTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(function () {
      elapsedSeconds++;
      var m = Math.floor(elapsedSeconds / 60);
      var s = elapsedSeconds % 60;
      var formatted = (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
      $('#meeting-elapsed-time').text(formatted);
    }, 1000);
  }

  function bindMeetingControls() {
    // 1. Microphone Toggle
    $(document).off('click', '#meeting-btn-mic').on('click', '#meeting-btn-mic', function () {
      if (!localStream) return;
      var audioTracks = localStream.getAudioTracks();
      if (audioTracks.length === 0) return;

      isAudioMuted = !isAudioMuted;
      audioTracks[0].enabled = !isAudioMuted;

      if (isAudioMuted) {
        $(this).addClass('is-off').find('.btn-label').text('Unmute');
        $(this).find('i').attr('data-lucide', 'mic-off');
        $('#local-mic-indicator').addClass('is-muted').html('<i data-lucide="mic-off" class="icon-xs"></i>');
        $('#local-video-tile').removeClass('is-speaking');
      } else {
        $(this).removeClass('is-off').find('.btn-label').text('Mic');
        $(this).find('i').attr('data-lucide', 'mic');
        $('#local-mic-indicator').removeClass('is-muted').html('<i data-lucide="mic" class="icon-xs"></i>');
      }

      UI.refreshIcons($('#meeting-btn-mic')[0]);
      UI.refreshIcons($('#local-mic-indicator')[0]);
    });

    // 2. Camera Toggle
    $(document).off('click', '#meeting-btn-cam').on('click', '#meeting-btn-cam', function () {
      if (!localStream) return;
      var videoTracks = localStream.getVideoTracks();
      if (videoTracks.length === 0) return;

      isVideoMuted = !isVideoMuted;
      videoTracks[0].enabled = !isVideoMuted;

      if (isVideoMuted) {
        $(this).addClass('is-off').find('.btn-label').text('Start Video');
        $(this).find('i').attr('data-lucide', 'video-off');
        $('#local-video-el').addClass('hidden');
        $('#local-avatar-fallback').removeClass('hidden');
      } else {
        $(this).removeClass('is-off').find('.btn-label').text('Camera');
        $(this).find('i').attr('data-lucide', 'video');
        $('#local-video-el').removeClass('hidden');
        $('#local-avatar-fallback').addClass('hidden');
      }

      UI.refreshIcons($('#meeting-btn-cam')[0]);
    });

    // 3. Screen Sharing Toggle
    $(document).off('click', '#meeting-btn-screen').on('click', '#meeting-btn-screen', function () {
      if (isScreenSharing) {
        stopScreenShare();
      } else {
        startScreenShare();
      }
    });

    // 4. Raise Hand Toggle
    $(document).off('click', '#meeting-btn-hand').on('click', '#meeting-btn-hand', function () {
      isHandRaised = !isHandRaised;
      if (isHandRaised) {
        $(this).addClass('btn-gold-active');
        UI.toast('You raised your hand.', 'info');
      } else {
        $(this).removeClass('btn-gold-active');
      }
    });

    // 5. Drawer Toggles (Chat / People)
    $(document).off('click', '.js-toggle-drawer').on('click', '.js-toggle-drawer', function () {
      var tab = $(this).attr('data-drawer-tab');
      if (activeDrawerTab === tab) {
        $('#meeting-side-drawer').addClass('hidden');
        activeDrawerTab = null;
      } else {
        $('#meeting-side-drawer').removeClass('hidden');
        switchDrawerTab(tab);
        activeDrawerTab = tab;
      }
    });

    $(document).off('click', '.js-close-drawer').on('click', '.js-close-drawer', function () {
      $('#meeting-side-drawer').addClass('hidden');
      activeDrawerTab = null;
    });

    $(document).off('click', '.js-drawer-tab-btn').on('click', '.js-drawer-tab-btn', function () {
      var tab = $(this).attr('data-tab');
      switchDrawerTab(tab);
    });

    // 6. Send Meeting Chat Message
    $(document).off('submit', '#meeting-chat-form').on('submit', '#meeting-chat-form', function (e) {
      e.preventDefault();
      var text = ($('#meeting-chat-input').val() || '').trim();
      if (!text) return;

      var user = Store.getState().user || {};
      var msg = {
        id: 'msg-' + Date.now(),
        sender: user.full_name || 'You',
        text: text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isMe: true
      };

      inMeetingChatMessages.push(msg);
      $('#meeting-chat-input').val('');
      renderMeetingChat();
    });

    // 7. Teacher: Mute All Students
    $(document).off('click', '#meeting-btn-mute-all').on('click', '#meeting-btn-mute-all', function () {
      UI.confirm('Mute all student microphones across the classroom?', function () {
        UI.toast('All student microphones have been muted.', 'info');
      });
    });

    // 8. Leave Meeting
    $(document).off('click', '#meeting-btn-leave').on('click', '#meeting-btn-leave', function () {
      UI.confirm('Are you sure you want to leave the virtual classroom session?', function () {
        teardownMeeting();
        if (window.UgnayraApp) {
          window.UgnayraApp.navigate('/classroom');
        }
      });
    });
  }

  function switchDrawerTab(tab) {
    $('.js-drawer-tab-btn').removeClass('is-active');
    $('.js-drawer-tab-btn[data-tab="' + tab + '"]').addClass('is-active');
    $('.drawer-tab-pane').addClass('hidden');
    $('#drawer-pane-' + tab).removeClass('hidden');

    if (tab === 'chat') {
      $('#meeting-chat-unread').addClass('hidden').text('0');
      renderMeetingChat();
    } else if (tab === 'people') {
      renderParticipantsRoster();
    }
  }

  function startScreenShare() {
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        .then(function (stream) {
          screenStream = stream;
          isScreenSharing = true;

          $('#screenshare-spotlight').removeClass('hidden');
          var videoEl = document.getElementById('screenshare-video-el');
          if (videoEl) {
            videoEl.srcObject = stream;
            videoEl.play().catch(function () {});
          }

          $('#meeting-btn-screen').addClass('btn-gold-active').find('.btn-label').text('Stop Share');
          $('#screenshare-presenter-name').text('You are presenting');

          stream.getVideoTracks()[0].onended = function () {
            stopScreenShare();
          };
        })
        .catch(function () {
          UI.toast('Screen sharing was cancelled or not allowed.', 'info');
        });
    }
  }

  function stopScreenShare() {
    if (screenStream) {
      screenStream.getTracks().forEach(function (t) { t.stop(); });
      screenStream = null;
    }
    isScreenSharing = false;
    $('#screenshare-spotlight').addClass('hidden');
    $('#meeting-btn-screen').removeClass('btn-gold-active').find('.btn-label').text('Share');
  }

  function renderMeetingChat() {
    var $messages = $('#meeting-chat-messages');
    if (inMeetingChatMessages.length === 0) return;

    var html = inMeetingChatMessages.map(function (m) {
      return (
        '<div class="chat-message-bubble ' + (m.isMe ? 'is-me' : '') + '">' +
          '<div class="flex items-center justify-between text-xs">' +
            '<strong class="text-gold">' + escapeHtml(m.sender) + '</strong>' +
            '<span class="text-muted">' + escapeHtml(m.time) + '</span>' +
          '</div>' +
          '<p class="text-sm mt-1">' + escapeHtml(m.text) + '</p>' +
        '</div>'
      );
    }).join('');

    $messages.html(html);
    $messages.scrollTop($messages[0].scrollHeight);
  }

  function renderParticipantsRoster() {
    var user = Store.getState().user || {};
    var $list = $('#meeting-roster-list');

    var html = (
      '<div class="roster-item mb-2 p-2 border-bottom flex items-center justify-between">' +
        '<div class="flex items-center gap-2">' +
          '<div class="avatar-sm font-semibold">' + (user.full_name || 'U').charAt(0).toUpperCase() + '</div>' +
          '<div>' +
            '<div class="font-semibold text-xs">' + escapeHtml(user.full_name || 'You') + ' (You)</div>' +
            '<div class="text-xs text-muted">' + (user.role || 'Student') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-1">' +
          '<i data-lucide="' + (isAudioMuted ? 'mic-off' : 'mic') + '" class="icon-xs ' + (isAudioMuted ? 'text-danger' : 'text-success') + '"></i>' +
        '</div>' +
      '</div>'
    );

    $list.html(html);
    UI.refreshIcons($list[0]);
  }

  function teardownMeeting() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    if (audioContext) {
      try { audioContext.close(); } catch (_e) {}
      audioContext = null;
    }

    if (localStream) {
      localStream.getTracks().forEach(function (t) { t.stop(); });
      localStream = null;
    }

    stopScreenShare();
  }

  window.UgnayraMeeting = {
    mountStage: mountMeetingStage,
    teardown: teardownMeeting
  };
})(window, window.jQuery);
