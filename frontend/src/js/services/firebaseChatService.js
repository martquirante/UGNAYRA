/**
 * UGNAYRA — Firebase NoSQL Realtime Messaging Service
 * Powers live private conversations using Firebase Firestore (NoSQL document database).
 * Kept strictly decoupled: credentials read dynamically from backend .env secrets.
 */
(function (window, $) {
  'use strict';

  var firebaseApp = null;
  var firestoreDb = null;
  var initPromise = null;
  var activeThreadUnsub = null;
  var activeTypingUnsub = null;

  function initFirebase() {
    if (firestoreDb) return Promise.resolve(firestoreDb);
    if (initPromise) return initPromise;

    initPromise = new Promise(function (resolve, reject) {
      // 1. Fetch Firebase client credentials securely populated from backend/.env
      var configUrl = (window.UGNAYRA_CONFIG ? window.UGNAYRA_CONFIG.API_BASE_URL : '/api/v1') + '/config/firebase';

      $.ajax({
        url: configUrl,
        method: 'GET',
        dataType: 'json'
      })
        .then(function (res) {
          var cfg = (res.data && res.data.firebase) || {};
          if (!cfg.api_key || !cfg.project_id) {
            console.warn('Firebase NoSQL Chat: Credentials not found in .env.');
            resolve(null);
            return;
          }

          var firebaseSdkConfig = {
            apiKey: cfg.api_key,
            authDomain: cfg.auth_domain,
            projectId: cfg.project_id,
            storageBucket: cfg.storage_bucket,
            messagingSenderId: cfg.messaging_sender_id,
            appId: cfg.app_id,
            measurementId: cfg.measurement_id
          };

          if (typeof window.firebase === 'undefined') {
            console.warn('Firebase NoSQL Chat: Firebase SDK not loaded.');
            resolve(null);
            return;
          }

          try {
            // Check if app already initialized
            var apps = window.firebase.apps || [];
            if (!apps.length) {
              firebaseApp = window.firebase.initializeApp(firebaseSdkConfig);
            } else {
              firebaseApp = apps[0];
            }

            firestoreDb = window.firebase.firestore();
            console.log('🔥 Firebase NoSQL Realtime Chat initialized successfully (Project: ' + cfg.project_id + ')');
            resolve(firestoreDb);
          } catch (initErr) {
            console.error('Firebase NoSQL Chat initialization error:', initErr);
            resolve(null);
          }
        })
        .catch(function (err) {
          console.warn('Firebase NoSQL Chat: Could not retrieve configuration.', err);
          resolve(null);
        });
    });

    return initPromise;
  }

  function isAvailable() {
    return Boolean(firestoreDb);
  }

  /**
   * Listen in real-time to messages in a conversation thread via Firestore NoSQL
   */
  function listenToThread(conversationId, onMessagesReceived) {
    if (activeThreadUnsub) {
      activeThreadUnsub();
      activeThreadUnsub = null;
    }

    if (!firestoreDb || !conversationId) return;

    try {
      activeThreadUnsub = firestoreDb
        .collection('conversations')
        .doc(conversationId)
        .collection('messages')
        .orderBy('created_at', 'asc')
        .limit(100)
        .onSnapshot(
          function (snapshot) {
            var items = [];
            snapshot.forEach(function (doc) {
              var data = doc.data();
              data.id = doc.id;
              items.push(data);
            });
            if (typeof onMessagesReceived === 'function') {
              onMessagesReceived(items);
            }
          },
          function (err) {
            console.warn('Firestore onSnapshot error:', err);
          }
        );
    } catch (e) {
      console.warn('Failed to attach Firestore thread listener:', e);
    }
  }

  function stopThreadListener() {
    if (activeThreadUnsub) {
      activeThreadUnsub();
      activeThreadUnsub = null;
    }
    if (activeTypingUnsub) {
      activeTypingUnsub();
      activeTypingUnsub = null;
    }
  }

  /**
   * Listen to typing indicators in Firestore
   */
  function listenToTyping(conversationId, currentUserId, onTypingChanged) {
    if (activeTypingUnsub) {
      activeTypingUnsub();
      activeTypingUnsub = null;
    }

    if (!firestoreDb || !conversationId) return;

    try {
      activeTypingUnsub = firestoreDb
        .collection('conversations')
        .doc(conversationId)
        .collection('typing')
        .onSnapshot(function (snapshot) {
          var typingUser = null;
          var now = Date.now();
          snapshot.forEach(function (doc) {
            if (doc.id === currentUserId) return;
            var d = doc.data();
            // Valid if updated within 4 seconds
            if (d.is_typing && now - (d.timestamp || 0) < 4000) {
              typingUser = d.user_name || 'Classmate';
            }
          });
          if (typeof onTypingChanged === 'function') {
            onTypingChanged(typingUser);
          }
        });
    } catch (e) {
      console.warn('Failed to attach Firestore typing listener:', e);
    }
  }

  /**
   * Send a typing presence signal to Firestore NoSQL
   */
  function setTyping(conversationId, user, isTyping) {
    if (!firestoreDb || !conversationId || !user || !user.id) return;
    try {
      firestoreDb
        .collection('conversations')
        .doc(conversationId)
        .collection('typing')
        .doc(user.id)
        .set({
          is_typing: Boolean(isTyping),
          user_name: user.full_name || user.username || 'Classmate',
          timestamp: Date.now()
        }, { merge: true });
    } catch (_e) {}
  }

  /**
   * Post a new message document to Firestore NoSQL collection
   */
  function sendMessage(conversationId, messageData) {
    if (!firestoreDb) {
      return Promise.reject(new Error('Firebase NoSQL is not connected.'));
    }

    var col = firestoreDb.collection('conversations').doc(conversationId).collection('messages');
    var nowIso = new Date().toISOString();

    var docPayload = {
      client_id: messageData.client_id || messageData.id || null,
      sender_id: messageData.sender_id,
      sender: messageData.sender || null,
      body: messageData.body || '',
      attachment_url: messageData.attachment_url || null,
      created_at: nowIso,
      is_read: false,
      status: 'sent'
    };

    return col.add(docPayload).then(function (docRef) {
      docPayload.id = docRef.id;

      // Update parent conversation summary document in Firestore
      firestoreDb.collection('conversations').doc(conversationId).set({
        last_message_preview: (docPayload.body || 'Image attachment').substring(0, 100),
        last_message_at: nowIso,
        updated_at: nowIso
      }, { merge: true });

      return docPayload;
    });
  }

  /**
   * Mark peer messages in Firestore as read (seen status)
   */
  function markMessagesRead(conversationId, currentUserId) {
    if (!firestoreDb || !conversationId || !currentUserId) return;
    try {
      var col = firestoreDb.collection('conversations').doc(conversationId).collection('messages');
      col.where('is_read', '==', false).limit(30).get().then(function (snapshot) {
        snapshot.forEach(function (doc) {
          var data = doc.data();
          if (data.sender_id !== currentUserId) {
            doc.ref.update({
              is_read: true,
              status: 'seen',
              read_at: new Date().toISOString()
            }).catch(function () {});
          }
        });
      }).catch(function () {});
    } catch (_e) {}
  }

  window.UgnayraFirebaseChat = {
    init: initFirebase,
    isAvailable: isAvailable,
    listenToThread: listenToThread,
    stopThreadListener: stopThreadListener,
    listenToTyping: listenToTyping,
    setTyping: setTyping,
    sendMessage: sendMessage,
    markMessagesRead: markMessagesRead
  };
})(window, window.jQuery);

