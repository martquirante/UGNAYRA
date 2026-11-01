/**
 * UGNAYRA — WebRTC Audio/Video Realtime P2P Consultation Module
 * Powers direct browser-to-browser peer connections with STUN/ICE NAT traversal.
 * Supports cross-network communication (WiFi & Mobile Data), real audio ringtones,
 * incoming call prompts, busy signals ("tot... tot... tot..."), and Firestore/Bus signaling.
 */
(function (window, $) {
  'use strict';

  var Store = window.UgnayraStore;
  var UI = window.UgnayraUI;
  var fmt = window.UgnayraFormat;

  // Google Public STUN Servers for robust NAT traversal across mobile data (LTE/5G) and WiFi
  var DEFAULT_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ];

  // Inter-tab / local browser communication bus (instant real-time testing)
  var rtcBus = null;
  try {
    if (typeof window.BroadcastChannel !== 'undefined') {
      rtcBus = new window.BroadcastChannel('ugnayra_rtc_bus');
    }
  } catch (_e) {}

  var activeCall = {
    callId: null,
    peer: null,
    callType: 'audio', // 'audio' or 'video'
    isCaller: false,
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    timerInterval: null,
    secondsElapsed: 0,
    isMuted: false,
    isVideoDisabled: false,
    callDocUnsub: null,
    candidatesUnsub: null,
    $modal: null
  };

  var incomingCallState = {
    callData: null,
    $modal: null,
    timeoutTimer: null
  };

  var incomingListenerUnsub = null;

  function isSupported() {
    return Boolean(
      window.RTCPeerConnection &&
      (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    );
  }

  function formatDuration(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  }

  // =========================================================================
  // Pure Web Audio API Tone Synthesizer (No external audio file dependencies)
  // =========================================================================
  var SoundFX = (function () {
    var ctx = null;
    var activeOscillators = [];
    var loopTimer = null;

    function getContext() {
      if (!ctx) {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          ctx = new AudioCtx();
        }
      }
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(function () {});
      }
      return ctx;
    }

    function stopAll() {
      if (loopTimer) {
        clearTimeout(loopTimer);
        clearInterval(loopTimer);
        loopTimer = null;
      }
      activeOscillators.forEach(function (node) {
        try {
          node.stop();
          node.disconnect();
        } catch (_e) {}
      });
      activeOscillators = [];
    }

    /**
     * Outgoing Call Ringback Tone:
     * Standard 440 Hz + 480 Hz ringback cadence (1.8s ring, 2.2s pause).
     */
    function playDialTone() {
      stopAll();
      var ac = getContext();
      if (!ac) return;

      function burst() {
        if (!ac) return;
        var now = ac.currentTime;

        var osc1 = ac.createOscillator();
        var osc2 = ac.createOscillator();
        var gain = ac.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(480, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.09, now + 0.05);
        gain.gain.setValueAtTime(0.09, now + 1.8);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.85);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ac.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.86);
        osc2.stop(now + 1.86);

        activeOscillators.push(osc1, osc2);

        loopTimer = setTimeout(function () {
          burst();
        }, 4000);
      }

      burst();
    }

    /**
     * Incoming Call Ringtone:
     * Gentle 4-note campus chime: E5 -> G#5 -> B5 -> E6, repeating every 2.4s.
     */
    function playIncomingRingtone() {
      stopAll();
      var ac = getContext();
      if (!ac) return;

      var notes = [659.25, 830.61, 987.77, 1318.51];

      function chimePattern() {
        if (!ac) return;
        var start = ac.currentTime;

        notes.forEach(function (freq, idx) {
          var t = start + (idx * 0.16);
          var osc = ac.createOscillator();
          var gain = ac.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);

          gain.gain.setValueAtTime(0.001, t);
          gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

          osc.connect(gain);
          gain.connect(ac.destination);

          osc.start(t);
          osc.stop(t + 0.36);
          activeOscillators.push(osc);
        });

        loopTimer = setTimeout(function () {
          chimePattern();
        }, 2400);
      }

      chimePattern();
    }

    /**
     * Busy / Call Ended Tone ("tot... tot... tot..."):
     * 3 short, sharp beeps at 480 Hz (160ms on, 140ms off x 3).
     */
    function playBusyTone() {
      stopAll();
      var ac = getContext();
      if (!ac) return;

      var start = ac.currentTime;

      [0, 0.30, 0.60].forEach(function (offset) {
        var t = start + offset;
        var osc = ac.createOscillator();
        var gain = ac.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(480, t);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
        gain.gain.setValueAtTime(0.14, t + 0.16);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

        osc.connect(gain);
        gain.connect(ac.destination);

        osc.start(t);
        osc.stop(t + 0.19);
        activeOscillators.push(osc);
      });
    }

    return {
      playDialTone: playDialTone,
      playIncomingRingtone: playIncomingRingtone,
      playBusyTone: playBusyTone,
      stopAll: stopAll
    };
  })();

  function getFirestoreDb() {
    if (window.UgnayraFirebaseChat && typeof window.UgnayraFirebaseChat.getDb === 'function') {
      return window.UgnayraFirebaseChat.getDb();
    }
    return null;
  }

  // =========================================================================
  // Global Incoming Call Listener
  // =========================================================================
  function initIncomingListener() {
    var user = (Store && Store.getState().user) || {};
    if (!user || !user.id) return;

    if (incomingListenerUnsub) {
      incomingListenerUnsub();
      incomingListenerUnsub = null;
    }

    // 1. Listen on Firestore Realtime Collection 'calls'
    var db = getFirestoreDb();
    if (db) {
      try {
        incomingListenerUnsub = db.collection('calls')
          .where('receiver.id', '==', user.id)
          .where('status', '==', 'ringing')
          .limit(5)
          .onSnapshot(function (snapshot) {
            snapshot.forEach(function (doc) {
              var data = doc.data() || {};
              data.id = doc.id;
              // Accept calls created within the last 45 seconds
              if (Date.now() - (data.created_at || 0) < 45000) {
                handleIncomingCall(data);
              }
            });
          }, function (err) {
            console.warn('WebRTC Firestore incoming listener error:', err);
          });
      } catch (e) {
        console.warn('Failed to attach Firestore incoming call listener:', e);
      }
    }

    // 2. Listen on BroadcastChannel for multi-tab / local dev events
    if (rtcBus) {
      rtcBus.onmessage = function (ev) {
        var msg = ev.data || {};
        var me = (Store && Store.getState().user) || {};
        if (msg.type === 'call_invite' && msg.receiver && msg.receiver.id === me.id) {
          handleIncomingCall(msg);
        } else if (msg.type === 'call_declined' && activeCall.callId === msg.callId) {
          handleCallDeclined();
        } else if (msg.type === 'call_busy' && activeCall.callId === msg.callId) {
          handleCallBusy();
        } else if (msg.type === 'call_ended' && activeCall.callId === msg.callId) {
          handleRemoteEnded();
        } else if (msg.type === 'call_answered' && activeCall.callId === msg.callId) {
          handleRemoteAnswered(msg.answer);
        } else if (msg.type === 'ice_candidate' && activeCall.callId === msg.callId) {
          if (activeCall.peerConnection && msg.candidate) {
            activeCall.peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(function () {});
          }
        }
      };
    }
  }

  /**
   * Handle an incoming call from a peer
   */
  function handleIncomingCall(callData) {
    // If already in a call, automatically reply with 'busy'
    if (activeCall.peerConnection) {
      var db = getFirestoreDb();
      if (db && callData.id) {
        db.collection('calls').doc(callData.id).update({ status: 'busy' }).catch(function () {});
      }
      if (rtcBus) {
        rtcBus.postMessage({ type: 'call_busy', callId: callData.id });
      }
      return;
    }

    // If this call is already showing, ignore duplicate snapshot
    if (incomingCallState.callData && incomingCallState.callData.id === callData.id) {
      return;
    }

    incomingCallState.callData = callData;

    var caller = callData.caller || { full_name: 'Campus Member', role: 'student' };
    var isVideo = callData.call_type === 'video';
    var callerName = caller.full_name || caller.username || 'Campus Classmate';

    // Play incoming ring melody
    SoundFX.playIncomingRingtone();

    // Render Incoming Call Modal
    var modalHtml =
      '<div class="rtc-call-modal-overlay" id="ug-rtc-incoming-overlay">' +
        '<div class="rtc-call-window" style="max-width: 440px; text-align: center;">' +
          '<div class="rtc-call-header" style="justify-content: center;">' +
            '<span class="font-semibold text-white text-sm" style="display:flex;align-items:center;gap:8px;">' +
              '<span style="width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 10px #10b981;"></span>' +
              'Incoming Campus ' + (isVideo ? 'Video Call' : 'Voice Call') +
            '</span>' +
          '</div>' +
          '<div class="rtc-call-stage is-audio" style="min-height: 280px; padding: 28px 20px;">' +
            '<div class="rtc-peer-poster">' +
              '<div class="rtc-peer-avatar-wrap" style="width: 104px; height: 104px;">' +
                (fmt ? fmt.renderAvatar(caller, 'avatar-xl', false) : '') +
                '<div class="rtc-soundwave-ring" style="border-color:#10b981;animation:rtcRotate 8s linear infinite;"></div>' +
              '</div>' +
              '<h3 class="rtc-peer-name" style="font-size: 1.4rem;">' + (fmt ? fmt.escapeHtml(callerName) : callerName) + '</h3>' +
              '<p class="rtc-peer-sub" style="color: #34d399; font-weight: 600;">Incoming ' + (isVideo ? 'Video' : 'Voice') + ' Call...</p>' +
            '</div>' +
          '</div>' +
          '<div class="rtc-call-toolbar" style="gap: 40px; padding: 20px 24px; background: #091322;">' +
            '<button type="button" class="rtc-btn-action rtc-btn-decline" id="rtc-btn-incoming-decline" title="Decline Call">' +
              '<div class="rtc-action-circle">' +
                '<i data-lucide="phone-off" class="icon-md"></i>' +
              '</div>' +
              '<span>Decline</span>' +
            '</button>' +
            '<button type="button" class="rtc-btn-action rtc-btn-accept" id="rtc-btn-incoming-accept" title="Accept Call">' +
              '<div class="rtc-action-circle">' +
                '<i data-lucide="phone" class="icon-md"></i>' +
              '</div>' +
              '<span>Accept</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    if (incomingCallState.$modal) {
      incomingCallState.$modal.remove();
    }
    $('body').append(modalHtml);
    incomingCallState.$modal = $('#ug-rtc-incoming-overlay');

    if (UI) UI.refreshIcons(incomingCallState.$modal[0]);

    // Bind Decline and Accept
    incomingCallState.$modal.on('click', '#rtc-btn-incoming-decline', function () {
      declineIncomingCall(callData);
    });

    incomingCallState.$modal.on('click', '#rtc-btn-incoming-accept', function () {
      acceptIncomingCall(callData);
    });

    // Auto-timeout after 35s if unanswered
    if (incomingCallState.timeoutTimer) clearTimeout(incomingCallState.timeoutTimer);
    incomingCallState.timeoutTimer = setTimeout(function () {
      if (incomingCallState.$modal) {
        declineIncomingCall(callData);
      }
    }, 35000);
  }

  function declineIncomingCall(callData) {
    SoundFX.stopAll();
    SoundFX.playBusyTone(); // "tot... tot... tot..."

    if (incomingCallState.timeoutTimer) {
      clearTimeout(incomingCallState.timeoutTimer);
      incomingCallState.timeoutTimer = null;
    }
    if (incomingCallState.$modal) {
      incomingCallState.$modal.remove();
      incomingCallState.$modal = null;
    }

    var db = getFirestoreDb();
    if (db && callData.id) {
      db.collection('calls').doc(callData.id).update({ status: 'declined' }).catch(function () {});
    }
    if (rtcBus) {
      rtcBus.postMessage({ type: 'call_declined', callId: callData.id });
    }
    incomingCallState.callData = null;
  }

  // =========================================================================
  // Accept Incoming Call (Callee Side)
  // =========================================================================
  function acceptIncomingCall(callData) {
    SoundFX.stopAll();

    if (incomingCallState.timeoutTimer) {
      clearTimeout(incomingCallState.timeoutTimer);
      incomingCallState.timeoutTimer = null;
    }
    if (incomingCallState.$modal) {
      incomingCallState.$modal.remove();
      incomingCallState.$modal = null;
    }

    var caller = callData.caller || {};
    var isVideo = callData.call_type === 'video';

    activeCall.callId = callData.id;
    activeCall.peer = caller;
    activeCall.callType = callData.call_type || 'audio';
    activeCall.isCaller = false;
    activeCall.secondsElapsed = 0;
    activeCall.isMuted = false;
    activeCall.isVideoDisabled = false;

    mountCallWindow(caller, activeCall.callType, false);
    $('#rtc-connection-status').text('Connecting WebRTC...');

    // Acquire Local Media
    var constraints = {
      audio: true,
      video: isVideo ? { width: { ideal: 640 }, height: { ideal: 480 } } : false
    };

    var getMediaPromise = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
      ? navigator.mediaDevices.getUserMedia(constraints)
      : Promise.reject(new Error('Media devices not available'));

    getMediaPromise
      .catch(function (err) {
        console.warn('WebRTC getUserMedia fallback for incoming call:', err);
        // Fallback to audio-only if video failed
        if (isVideo && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }
        return new MediaStream();
      })
      .then(function (stream) {
        activeCall.localStream = stream;

        var localVid = document.getElementById('rtc-local-video');
        if (localVid && stream) {
          try { localVid.srcObject = stream; } catch (_e) {}
        }

        // Initialize RTCPeerConnection with STUN
        var pc = new window.RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
        activeCall.peerConnection = pc;

        // Add local tracks
        if (stream && stream.getTracks) {
          stream.getTracks().forEach(function (track) {
            try { pc.addTrack(track, stream); } catch (_e) {}
          });
        }

        // On remote track received
        pc.ontrack = function (event) {
          if (event.streams && event.streams[0]) {
            activeCall.remoteStream = event.streams[0];
            attachRemoteAudio(event.streams[0]);
            var remoteVid = document.getElementById('rtc-remote-video');
            if (remoteVid && isVideo) {
              remoteVid.srcObject = event.streams[0];
              $('#rtc-peer-poster').hide();
            }
          }
        };

        // Gatheer ICE candidates
        var db = getFirestoreDb();
        pc.onicecandidate = function (ev) {
          if (ev.candidate) {
            if (db && callData.id) {
              db.collection('calls').doc(callData.id).collection('calleeCandidates').add(ev.candidate.toJSON()).catch(function () {});
            }
            if (rtcBus) {
              rtcBus.postMessage({ type: 'ice_candidate', callId: callData.id, candidate: ev.candidate.toJSON() });
            }
          }
        };

        pc.oniceconnectionstatechange = function () {
          var state = pc.iceConnectionState;
          if (state === 'connected' || state === 'completed') {
            $('#rtc-connection-status').html('<span style="color:#34d399;font-weight:600;">● Connected</span>');
          } else if (state === 'failed' || state === 'disconnected') {
            $('#rtc-connection-status').html('<span style="color:#f87171;">Reconnecting...</span>');
          }
        };

        // Set remote offer & generate answer
        var offerDesc = new window.RTCSessionDescription(callData.offer);
        pc.setRemoteDescription(offerDesc)
          .then(function () {
            return pc.createAnswer();
          })
          .then(function (answer) {
            return pc.setLocalDescription(answer).then(function () {
              // Update call doc status to connected with answer
              if (db && callData.id) {
                db.collection('calls').doc(callData.id).update({
                  status: 'connected',
                  answer: { type: answer.type, sdp: answer.sdp }
                }).catch(function () {});

                // Listen to caller's ICE candidates
                activeCall.candidatesUnsub = db.collection('calls').doc(callData.id).collection('callerCandidates')
                  .onSnapshot(function (snapshot) {
                    snapshot.docChanges().forEach(function (change) {
                      if (change.type === 'added') {
                        var candidateData = change.doc.data();
                        pc.addIceCandidate(new window.RTCIceCandidate(candidateData)).catch(function () {});
                      }
                    });
                  });
              }

              if (rtcBus) {
                rtcBus.postMessage({
                  type: 'call_answered',
                  callId: callData.id,
                  answer: { type: answer.type, sdp: answer.sdp }
                });
              }

              $('#rtc-connection-status').html('<span style="color:#34d399;font-weight:600;">● Connected</span>');
              $('#rtc-call-timer').text('00:00');
              startCallTimer();
            });
          })
          .catch(function (err) {
            console.error('WebRTC answer error:', err);
            endCall();
          });

        // Listen for remote hangup on Firestore
        if (db && callData.id) {
          activeCall.callDocUnsub = db.collection('calls').doc(callData.id)
            .onSnapshot(function (snapshot) {
              var data = snapshot.data();
              if (data && data.status === 'ended') {
                handleRemoteEnded();
              }
            });
        }
      });
  }

  // =========================================================================
  // Start Outgoing Call (Caller Side)
  // =========================================================================
  function startCall(peer, callType, conversationId) {
    if (activeCall.peerConnection) {
      if (UI) UI.toast('A consultation session is already in progress.', 'info');
      return;
    }

    callType = callType || 'audio';
    peer = peer || { full_name: 'Campus Classmate', role: 'student' };

    var me = (Store && Store.getState().user) || {};
    var callId = 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);

    activeCall.callId = callId;
    activeCall.peer = peer;
    activeCall.callType = callType;
    activeCall.isCaller = true;
    activeCall.secondsElapsed = 0;
    activeCall.isMuted = false;
    activeCall.isVideoDisabled = false;

    // 1. Mount Active Call Window
    mountCallWindow(peer, callType, true);
    $('#rtc-connection-status').text('Calling...');

    // 2. Start Dial Ringback Tone
    SoundFX.playDialTone();

    // 3. Acquire Local Media
    var isVideo = callType === 'video';
    var constraints = {
      audio: true,
      video: isVideo ? { width: { ideal: 640 }, height: { ideal: 480 } } : false
    };

    var getMediaPromise = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
      ? navigator.mediaDevices.getUserMedia(constraints)
      : Promise.reject(new Error('Media devices not available'));

    getMediaPromise
      .catch(function (err) {
        console.warn('WebRTC getUserMedia fallback for caller:', err);
        if (isVideo && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }
        return new MediaStream();
      })
      .then(function (stream) {
        activeCall.localStream = stream;

        var localVid = document.getElementById('rtc-local-video');
        if (localVid && stream) {
          try { localVid.srcObject = stream; } catch (_e) {}
        }

        // Initialize RTCPeerConnection with STUN
        var pc = new window.RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
        activeCall.peerConnection = pc;

        // Add local tracks
        if (stream && stream.getTracks) {
          stream.getTracks().forEach(function (track) {
            try { pc.addTrack(track, stream); } catch (_e) {}
          });
        }

        // Handle remote stream
        pc.ontrack = function (event) {
          if (event.streams && event.streams[0]) {
            activeCall.remoteStream = event.streams[0];
            attachRemoteAudio(event.streams[0]);
            var remoteVid = document.getElementById('rtc-remote-video');
            if (remoteVid && isVideo) {
              remoteVid.srcObject = event.streams[0];
              $('#rtc-peer-poster').hide();
            }
          }
        };

        // Gather ICE Candidates
        var db = getFirestoreDb();
        pc.onicecandidate = function (ev) {
          if (ev.candidate) {
            if (db) {
              db.collection('calls').doc(callId).collection('callerCandidates').add(ev.candidate.toJSON()).catch(function () {});
            }
            if (rtcBus) {
              rtcBus.postMessage({ type: 'ice_candidate', callId: callId, candidate: ev.candidate.toJSON() });
            }
          }
        };

        pc.oniceconnectionstatechange = function () {
          var state = pc.iceConnectionState;
          if (state === 'connected' || state === 'completed') {
            $('#rtc-connection-status').html('<span style="color:#34d399;font-weight:600;">● Connected</span>');
          } else if (state === 'failed' || state === 'disconnected') {
            $('#rtc-connection-status').html('<span style="color:#f87171;">Reconnecting...</span>');
          }
        };

        // Create Offer & Send Signaling
        pc.createOffer()
          .then(function (offer) {
            return pc.setLocalDescription(offer).then(function () {
              var callPayload = {
                call_id: callId,
                conversation_id: conversationId || null,
                caller: {
                  id: me.id,
                  full_name: me.full_name || me.username || 'Campus Member',
                  role: me.role || 'student',
                  avatar_url: me.avatar_url || null
                },
                receiver: {
                  id: peer.id,
                  full_name: peer.full_name || peer.username || 'Classmate',
                  role: peer.role || 'student',
                  avatar_url: peer.avatar_url || null
                },
                call_type: callType,
                status: 'ringing',
                offer: { type: offer.type, sdp: offer.sdp },
                created_at: Date.now()
              };

              // Write to Firestore Realtime
              if (db) {
                db.collection('calls').doc(callId).set(callPayload).catch(function (err) {
                  console.warn('Firestore call write error:', err);
                });

                // Listen to call document state changes
                activeCall.callDocUnsub = db.collection('calls').doc(callId)
                  .onSnapshot(function (snapshot) {
                    var data = snapshot.data();
                    if (!data) return;

                    if (data.status === 'connected' && data.answer) {
                      handleRemoteAnswered(data.answer);
                    } else if (data.status === 'declined') {
                      handleCallDeclined();
                    } else if (data.status === 'busy') {
                      handleCallBusy();
                    } else if (data.status === 'ended') {
                      handleRemoteEnded();
                    }
                  });
              }

              // Broadcast to local tabs
              if (rtcBus) {
                rtcBus.postMessage(Object.assign({ type: 'call_invite' }, callPayload));
              }

              // Notify backend signaling seam if available
              if (window.UgnayraServices && window.UgnayraServices.Rtc) {
                window.UgnayraServices.Rtc.createSession(conversationId || peer.id, callType).catch(function () {});
              }

              $('#rtc-connection-status').text('Ringing...');
            });
          })
          .catch(function (err) {
            console.error('WebRTC offer error:', err);
            endCall();
          });
      });
  }

  function handleRemoteAnswered(answer) {
    if (!activeCall.peerConnection) return;
    SoundFX.stopAll();

    var pc = activeCall.peerConnection;
    if (pc.signalingState !== 'stable') {
      var answerDesc = new window.RTCSessionDescription(answer);
      pc.setRemoteDescription(answerDesc).catch(function (err) {
        console.warn('setRemoteDescription error:', err);
      });
    }

    // Listen to callee candidates on Firestore
    var db = getFirestoreDb();
    if (db && activeCall.callId && !activeCall.candidatesUnsub) {
      activeCall.candidatesUnsub = db.collection('calls').doc(activeCall.callId).collection('calleeCandidates')
        .onSnapshot(function (snapshot) {
          snapshot.docChanges().forEach(function (change) {
            if (change.type === 'added') {
              var candidateData = change.doc.data();
              pc.addIceCandidate(new window.RTCIceCandidate(candidateData)).catch(function () {});
            }
          });
        });
    }

    $('#rtc-connection-status').html('<span style="color:#34d399;font-weight:600;">● Connected</span>');
    $('#rtc-call-timer').text('00:00');
    startCallTimer();
  }

  function handleCallDeclined() {
    SoundFX.stopAll();
    SoundFX.playBusyTone(); // "tot... tot... tot..."
    $('#rtc-connection-status').html('<span style="color:#f87171;font-weight:600;">Call Declined</span>');
    setTimeout(function () {
      endCall(true);
    }, 2000);
  }

  function handleCallBusy() {
    SoundFX.stopAll();
    SoundFX.playBusyTone(); // "tot... tot... tot..."
    $('#rtc-connection-status').html('<span style="color:#fbbf24;font-weight:600;">User is Busy</span>');
    setTimeout(function () {
      endCall(true);
    }, 2000);
  }

  function handleRemoteEnded() {
    SoundFX.stopAll();
    SoundFX.playBusyTone(); // "tot... tot... tot..."
    $('#rtc-connection-status').html('<span style="color:#94a3b8;font-weight:600;">Call Ended</span>');
    setTimeout(function () {
      endCall(true);
    }, 1500);
  }

  function attachRemoteAudio(stream) {
    var remoteAudio = document.getElementById('rtc-remote-audio');
    if (!remoteAudio) {
      remoteAudio = document.createElement('audio');
      remoteAudio.id = 'rtc-remote-audio';
      remoteAudio.autoplay = true;
      remoteAudio.playsInline = true;
      document.body.appendChild(remoteAudio);
    }
    try {
      remoteAudio.srcObject = stream;
      remoteAudio.play().catch(function () {});
    } catch (_e) {}
  }

  function startCallTimer() {
    if (activeCall.timerInterval) clearInterval(activeCall.timerInterval);
    activeCall.secondsElapsed = 0;
    activeCall.timerInterval = setInterval(function () {
      activeCall.secondsElapsed++;
      $('#rtc-call-timer').text(formatDuration(activeCall.secondsElapsed));
    }, 1000);
  }

  // =========================================================================
  // Mount In-Call Stage Window
  // =========================================================================
  function mountCallWindow(peer, callType, isCaller) {
    var peerName = peer.full_name || peer.username || 'Classmate';
    var isVideo = callType === 'video';

    var modalHtml =
      '<div class="rtc-call-modal-overlay" id="ug-rtc-call-overlay">' +
        '<div class="rtc-call-window">' +
          '<div class="rtc-call-header">' +
            '<div class="flex items-center gap-2">' +
              '<span class="font-semibold text-white text-sm">' + (isVideo ? 'Video Call' : 'Voice Call') + '</span>' +
            '</div>' +
            '<div class="flex items-center gap-3">' +
              '<span class="rtc-call-timer" id="rtc-call-timer">Calling...</span>' +
              '<button type="button" class="rtc-header-close-btn" id="rtc-header-close-btn" title="End Call" aria-label="End Call">' +
                '<i data-lucide="x" class="icon-sm"></i>' +
              '</button>' +
            '</div>' +
          '</div>' +

          '<div class="rtc-call-stage ' + (isVideo ? 'is-video' : 'is-audio') + '" id="rtc-call-stage">' +
            '<div class="rtc-remote-container">' +
              '<video id="rtc-remote-video" class="rtc-remote-video" autoplay playsinline></video>' +
              '<div class="rtc-peer-poster" id="rtc-peer-poster">' +
                '<div class="rtc-peer-avatar-wrap">' +
                  (fmt ? fmt.renderAvatar(peer, 'avatar-xl', false) : '') +
                  '<div class="rtc-soundwave-ring"></div>' +
                '</div>' +
                '<h3 class="rtc-peer-name">' + (fmt ? fmt.escapeHtml(peerName) : peerName) + '</h3>' +
                '<p class="rtc-peer-sub" id="rtc-connection-status">Connecting...</p>' +
              '</div>' +
            '</div>' +

            (isVideo
              ? '<div class="rtc-local-pip" id="rtc-local-pip">' +
                  '<video id="rtc-local-video" class="rtc-local-video" autoplay muted playsinline></video>' +
                  '<span class="rtc-pip-label">You</span>' +
                '</div>'
              : '') +
          '</div>' +

          '<div class="rtc-call-toolbar">' +
            '<button type="button" class="rtc-tool-btn" id="rtc-btn-toggle-mic" title="Mute Microphone">' +
              '<i data-lucide="mic" class="icon-md"></i>' +
            '</button>' +
            (isVideo
              ? '<button type="button" class="rtc-tool-btn" id="rtc-btn-toggle-cam" title="Turn Camera Off">' +
                  '<i data-lucide="video" class="icon-md"></i>' +
                '</button>'
              : '') +
            '<button type="button" class="rtc-tool-btn rtc-btn-end" id="rtc-btn-end-call" title="End Consultation">' +
              '<i data-lucide="phone-off" class="icon-md"></i><span>End Call</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    if (activeCall.$modal) {
      activeCall.$modal.remove();
    }
    $('body').append(modalHtml);
    activeCall.$modal = $('#ug-rtc-call-overlay');

    if (UI) UI.refreshIcons(activeCall.$modal[0]);

    // Bind controls
    activeCall.$modal.on('click', '#rtc-btn-end-call', function () { endCall(false); });
    activeCall.$modal.on('click', '#rtc-header-close-btn', function () { endCall(false); });
    activeCall.$modal.on('click', '#rtc-btn-toggle-mic', toggleMute);
    activeCall.$modal.on('click', '#rtc-btn-toggle-cam', toggleVideo);
  }

  function toggleMute() {
    activeCall.isMuted = !activeCall.isMuted;
    if (activeCall.localStream) {
      activeCall.localStream.getAudioTracks().forEach(function (t) {
        t.enabled = !activeCall.isMuted;
      });
    }
    var $btn = $('#rtc-btn-toggle-mic');
    $btn.toggleClass('is-active-off', activeCall.isMuted);
    $btn.html('<i data-lucide="' + (activeCall.isMuted ? 'mic-off' : 'mic') + '" class="icon-md"></i>');
    if (UI) UI.refreshIcons($btn[0]);
  }

  function toggleVideo() {
    activeCall.isVideoDisabled = !activeCall.isVideoDisabled;
    if (activeCall.localStream) {
      activeCall.localStream.getVideoTracks().forEach(function (t) {
        t.enabled = !activeCall.isVideoDisabled;
      });
    }
    var $btn = $('#rtc-btn-toggle-cam');
    $btn.toggleClass('is-active-off', activeCall.isVideoDisabled);
    $btn.html('<i data-lucide="' + (activeCall.isVideoDisabled ? 'video-off' : 'video') + '" class="icon-md"></i>');
    if (UI) UI.refreshIcons($btn[0]);
  }

  // =========================================================================
  // End / Teardown Call Session
  // =========================================================================
  function endCall(isRemoteTriggered) {
    SoundFX.stopAll();

    if (!isRemoteTriggered) {
      SoundFX.playBusyTone(); // "tot... tot... tot..."
    }

    if (activeCall.timerInterval) {
      clearInterval(activeCall.timerInterval);
      activeCall.timerInterval = null;
    }

    // Notify peers that call has ended
    var callId = activeCall.callId;
    if (callId && !isRemoteTriggered) {
      var db = getFirestoreDb();
      if (db) {
        db.collection('calls').doc(callId).update({ status: 'ended' }).catch(function () {});
      }
      if (rtcBus) {
        rtcBus.postMessage({ type: 'call_ended', callId: callId });
      }
    }

    if (activeCall.callDocUnsub) {
      activeCall.callDocUnsub();
      activeCall.callDocUnsub = null;
    }
    if (activeCall.candidatesUnsub) {
      activeCall.candidatesUnsub();
      activeCall.candidatesUnsub = null;
    }

    // Stop local media tracks (turns off microphone and webcam LED)
    if (activeCall.localStream) {
      try {
        activeCall.localStream.getTracks().forEach(function (t) { t.stop(); });
      } catch (_e) {}
      activeCall.localStream = null;
    }

    // Close WebRTC PeerConnection
    if (activeCall.peerConnection) {
      try {
        activeCall.peerConnection.close();
      } catch (_e) {}
      activeCall.peerConnection = null;
    }

    // Remove remote audio element
    var remoteAudio = document.getElementById('rtc-remote-audio');
    if (remoteAudio) {
      remoteAudio.srcObject = null;
      remoteAudio.remove();
    }

    if (activeCall.$modal) {
      activeCall.$modal.remove();
      activeCall.$modal = null;
    }

    var dur = activeCall.secondsElapsed;
    activeCall.secondsElapsed = 0;
    activeCall.callId = null;
    activeCall.peer = null;

    if (UI && dur > 0) {
      UI.toast('Call ended (' + formatDuration(dur) + ').', 'info');
    }
  }

  window.UgnayraRtcModule = {
    isEnabled: function () {
      return Boolean(window.UGNAYRA_CONFIG && window.UGNAYRA_CONFIG.FEATURES && window.UGNAYRA_CONFIG.FEATURES.WEBRTC_CALLING);
    },
    isSupported: isSupported,
    startCall: startCall,
    endCall: endCall,
    initIncomingListener: initIncomingListener
  };
})(window, window.jQuery);
