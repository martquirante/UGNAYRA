/**
 * UGNAYRA — Private Messaging Controller (Mounts src/pages/messages/messages.html)
 */
(function (window, $) {
  'use strict';

  var fmt = window.UgnayraFormat;
  var UI = window.UgnayraUI;
  var Services = window.UgnayraServices;
  var Store = window.UgnayraStore;
  var Templates = window.UgnayraTemplates;

  var chatState = {
    conversations: [],
    activeId: null,
    messages: [],
    lastMessageTimestamp: null,
    pollTimer: null,
    lastTypingSentAt: 0,
    filterText: ''
  };

  function stopChatPolling() {
    if (chatState.pollTimer) {
      clearInterval(chatState.pollTimer);
      chatState.pollTimer = null;
    }
    if (window.UgnayraFirebaseChat && typeof window.UgnayraFirebaseChat.stopThreadListener === 'function') {
      window.UgnayraFirebaseChat.stopThreadListener();
    }
    $('body').removeClass('in-mobile-chat-thread');
  }

  function renderConversationList() {
    var $box = $('#conversation-list-box');
    if (!$box.length) return;
    var q = chatState.filterText.toLowerCase();
    var filtered = chatState.conversations.filter(function (c) {
      if (!q) return true;
      var peerName = (c.peer && c.peer.full_name) ? c.peer.full_name.toLowerCase() : '';
      var preview = ((c.last_message && c.last_message.body) || c.last_message_preview || '').toLowerCase();
      return peerName.indexOf(q) !== -1 || preview.indexOf(q) !== -1;
    });

    if (!filtered.length) {
      $box.html(
        UI.renderCompactEmptyState({
          icon: 'messages',
          title: 'No Conversations Found',
          description: 'Start a direct chat with a classmate, professor, or group project partner.',
          ctaHtml: '<button type="button" class="btn btn-primary btn-sm" id="empty-new-chat-btn"><i data-lucide="plus"></i><span>New Message</span></button>'
        })
      );
      UI.refreshIcons($box[0]);
      return;
    }

    var html = filtered.map(function (c) {
      var peer = c.peer || {};
      var active = c.id === chatState.activeId;
      var unread = Number(c.unread_count || 0);
      var lastPreview = (c.last_message && c.last_message.body) || c.last_message_preview || 'Start the conversation...';
      var lastTime = (c.last_message && c.last_message.created_at) || c.last_message_at || c.created_at;
      return (
        '<button type="button" class="conversation-row js-select-conversation ' +
          (active ? 'is-active ' : '') + (unread > 0 ? 'has-unread' : '') + '" ' +
          'data-conversation-id="' + fmt.escapeHtml(c.id) + '">' +
          fmt.renderAvatar(peer, 'avatar-md', true) +
          '<div class="flex-1 min-w-0">' +
            '<div class="flex items-center justify-between gap-2">' +
              '<span class="text-sm truncate conversation-peer-name" style="color:var(--color-ink-900);">' +
                fmt.escapeHtml(peer.full_name || c.title || 'Campus Conversation') +
              '</span>' +
              '<span class="text-xs-muted">' + fmt.escapeHtml(lastTime ? fmt.timeAgo(lastTime) : '') + '</span>' +
            '</div>' +
            '<div class="flex items-center justify-between gap-2" style="margin-top:2px;">' +
              '<span class="text-xs-muted truncate conversation-preview">' +
                fmt.escapeHtml(lastPreview) +
              '</span>' +
              (unread > 0 ? '<span class="unread-pill">' + unread + '</span>' : '') +
            '</div>' +
          '</div>' +
        '</button>'
      );
    }).join('');

    $box.html(html);
  }

  function renderDeliveryReceipt(status, peer) {
    if (status === 'sending') {
      // 1. A blue circle means that your message is sending
      return (
        '<span class="delivery-receipt status-sending" title="Sending..." aria-label="Sending">' +
          '<svg class="receipt-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#3b82f6" stroke-width="1.8">' +
            '<circle cx="8" cy="8" r="6" />' +
          '</svg>' +
        '</span>'
      );
    }
    if (status === 'sent') {
      // 2. A blue circle with a check means that your message has been sent
      return (
        '<span class="delivery-receipt status-sent" title="Sent" aria-label="Sent">' +
          '<svg class="receipt-icon" viewBox="0 0 16 16" width="14" height="14" fill="none">' +
            '<circle cx="8" cy="8" r="6" stroke="#3b82f6" stroke-width="1.8" />' +
            '<path d="M5.5 8.2l1.8 1.8 3.5-3.8" stroke="#3b82f6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />' +
          '</svg>' +
        '</span>'
      );
    }
    if (status === 'delivered') {
      // 3. A filled-in blue circle with a check means that your message has been delivered
      return (
        '<span class="delivery-receipt status-delivered" title="Delivered" aria-label="Delivered">' +
          '<svg class="receipt-icon" viewBox="0 0 16 16" width="14" height="14">' +
            '<circle cx="8" cy="8" r="7" fill="#2563eb" />' +
            '<path d="M5.5 8.2l1.8 1.8 3.5-3.8" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none" />' +
          '</svg>' +
        '</span>'
      );
    }
    if (status === 'seen') {
      // 4. A small version of someone's profile picture will appear below the message when they've seen it
      var peerName = (peer && peer.full_name) || 'Classmate';
      var peerAvatarUrl = (peer && peer.avatar_url) ? fmt.resolveMediaUrl(peer.avatar_url) : null;
      if (peerAvatarUrl) {
        return (
          '<span class="delivery-receipt status-seen" title="Seen by ' + fmt.escapeHtml(peerName) + '" aria-label="Seen">' +
            '<img src="' + fmt.escapeHtml(peerAvatarUrl) + '" alt="' + fmt.escapeHtml(peerName) + '" class="receipt-seen-avatar" />' +
          '</span>'
        );
      }
      var initials = fmt.initials ? fmt.initials(peerName) : (peerName.substring(0, 2).toUpperCase());
      return (
        '<span class="delivery-receipt status-seen" title="Seen by ' + fmt.escapeHtml(peerName) + '" aria-label="Seen">' +
          '<span class="receipt-seen-initials">' + fmt.escapeHtml(initials) + '</span>' +
        '</span>'
      );
    }
    return '';
  }

  var linkPreviewCache = {};
  var activePreviewRequests = {};

  function extractFirstUrl(text) {
    if (!text) return null;
    var urlMatch = text.match(/(https?:\/\/[^\s<]+|www\.[a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)+(?:\/[^\s<]*)?)/i);
    if (!urlMatch) return null;
    var url = urlMatch[1].replace(/[.,;:!?')\]]+$/, '');
    if (/^www\./i.test(url)) url = 'https://' + url;
    return url;
  }

  function getDomainFromUrl(url) {
    try {
      var a = document.createElement('a');
      a.href = url;
      return a.hostname.replace(/^www\./i, '');
    } catch (e) {
      return '';
    }
  }

  function getYouTubeVideoId(url) {
    if (!url) return null;
    var m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/i);
    return m ? m[1] : null;
  }

  function guessDefaultSiteTitle(domain) {
    var domainMap = {
      'youtube.com': 'YouTube',
      'youtu.be': 'YouTube',
      'chatgpt.com': 'ChatGPT: Get instant answers & ideas',
      'openai.com': 'OpenAI',
      'github.com': 'GitHub: Where the world builds software',
      'google.com': 'Google Search',
      'wikipedia.org': 'Wikipedia, the free encyclopedia',
      'facebook.com': 'Facebook',
      'twitter.com': 'X (formerly Twitter)',
      'x.com': 'X',
      'instagram.com': 'Instagram',
      'linkedin.com': 'LinkedIn',
      'bulsu.edu.ph': 'Bulacan State University'
    };
    if (domainMap[domain]) return domainMap[domain];
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  function renderLinkPreviewHtml(url) {
    var domain = getDomainFromUrl(url);
    if (!domain) return '';
    var ytId = getYouTubeVideoId(url);
    var cached = linkPreviewCache[url];

    var title = (cached && cached.title) ? cached.title : (ytId ? 'YouTube Video' : guessDefaultSiteTitle(domain));
    var desc = (cached && cached.description) ? cached.description : ('Click to open ' + domain);
    var img = (cached && cached.image) ? cached.image : (ytId ? ('https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg') : null);
    var favicon = (cached && cached.favicon) || ('https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=64');

    var mediaHtml = '';
    if (img) {
      mediaHtml =
        '<div class="msg-link-preview-media">' +
          '<img src="' + fmt.escapeHtml(img) + '" alt="' + fmt.escapeHtml(title) + '" class="msg-link-preview-img" loading="lazy" onerror="this.parentElement.style.display=\'none\';" />' +
        '</div>';
    } else {
      mediaHtml = '<div class="msg-link-preview-media" style="display:none;"><img src="" alt="" class="msg-link-preview-img" loading="lazy" onerror="this.parentElement.style.display=\'none\';" /></div>';
    }

    return (
      '<a href="' + fmt.escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" class="msg-link-preview-card" data-preview-url="' + fmt.escapeHtml(url) + '">' +
        mediaHtml +
        '<div class="msg-link-preview-body">' +
          '<div class="msg-link-preview-site">' +
            '<img src="' + fmt.escapeHtml(favicon) + '" alt="" class="msg-link-preview-favicon" onerror="this.style.display=\'none\';" />' +
            '<span class="msg-link-preview-domain">' + fmt.escapeHtml(domain) + '</span>' +
          '</div>' +
          '<div class="msg-link-preview-title">' + fmt.escapeHtml(title) + '</div>' +
          '<div class="msg-link-preview-desc">' + fmt.escapeHtml(desc) + '</div>' +
        '</div>' +
      '</a>'
    );
  }

  function applyPreviewData($card, data) {
    if (!data) return;
    if (data.title) {
      $card.find('.msg-link-preview-title').text(data.title);
    }
    if (data.description) {
      $card.find('.msg-link-preview-desc').text(data.description);
    }
    if (data.favicon) {
      $card.find('.msg-link-preview-favicon').attr('src', data.favicon);
    }
    if (data.image) {
      var $media = $card.find('.msg-link-preview-media');
      var $img = $media.find('.msg-link-preview-img');
      $img.attr('src', data.image);
      $media.show();
    }
  }

  function enrichLinkPreviews($container) {
    var $cards = ($container || $('#thread-messages-scroll')).find('.msg-link-preview-card[data-preview-url]');
    $cards.each(function () {
      var $card = $(this);
      var url = $card.attr('data-preview-url');
      if (!url) return;

      if (linkPreviewCache[url]) {
        applyPreviewData($card, linkPreviewCache[url]);
        return;
      }

      if (activePreviewRequests[url]) {
        activePreviewRequests[url].then(function (data) {
          if (data) applyPreviewData($card, data);
        });
        return;
      }

      if (Services.Meta && typeof Services.Meta.linkPreview === 'function') {
        activePreviewRequests[url] = Services.Meta.linkPreview(url)
          .then(function (res) {
            var p = res.data && res.data.preview;
            if (p) {
              linkPreviewCache[url] = p;
              applyPreviewData($card, p);
              return p;
            }
            return null;
          })
          .catch(function () {
            return null;
          });
      }
    });
  }

  function updateMessageStatus(msgId, newStatus, peer) {
    if (!msgId) return;
    var $row = $('[data-msg-id="' + msgId + '"], [data-client-id="' + msgId + '"], [data-backend-id="' + msgId + '"], [data-firestore-id="' + msgId + '"]');
    if ($row.length) {
      $row.find('.receipt-slot').html(renderDeliveryReceipt(newStatus, peer));
    }
  }

  function findMessageMatch(msg) {
    if (!msg) return null;
    var msgId = String(msg.id || '');
    var clientId = String(msg.client_id || '');
    var msgSenderId = String(msg.sender_id || (msg.sender && msg.sender.id) || '');
    var msgBody = String(msg.body || '').trim();
    var msgTime = msg.created_at ? new Date(msg.created_at).getTime() : Date.now();

    for (var i = 0; i < chatState.messages.length; i++) {
      var m = chatState.messages[i];
      var mId = String(m.id || '');
      var mClientId = String(m.client_id || m.temp_id || '');
      var mBackendId = String(m.backend_id || '');
      var mFirestoreId = String(m.firestore_id || '');
      var mSenderId = String(m.sender_id || (m.sender && m.sender.id) || '');
      var mBody = String(m.body || '').trim();
      var mTime = m.created_at ? new Date(m.created_at).getTime() : Date.now();

      // 1. Direct ID match
      if (msgId && (mId === msgId || mBackendId === msgId || mFirestoreId === msgId || mClientId === msgId)) {
        return m;
      }
      // 2. Client ID match
      if (clientId && (mClientId === clientId || mId === clientId)) {
        return m;
      }
      // 3. Sender + Body match within 60 seconds
      if (msgSenderId && mSenderId === msgSenderId && mBody && mBody === msgBody) {
        if (Math.abs(mTime - msgTime) <= 60000) {
          return m;
        }
      }
    }
    return null;
  }

  function appendOrUpdateBubble($container, msg, peer) {
    if (!msg) return false;
    var existing = findMessageMatch(msg);
    var msgId = String(msg.id || '');
    var clientId = String(msg.client_id || '');

    // Check if DOM already has an element for this message
    var $existingEl = $();
    if (msgId) {
      $existingEl = $container.find('[data-msg-id="' + msgId + '"], [data-backend-id="' + msgId + '"], [data-firestore-id="' + msgId + '"]');
    }
    if (!$existingEl.length && clientId) {
      $existingEl = $container.find('[data-client-id="' + clientId + '"], [data-msg-id="' + clientId + '"]');
    }
    if (!$existingEl.length && existing) {
      var checkId = existing.id || existing.backend_id || existing.client_id;
      if (checkId) {
        $existingEl = $container.find('[data-msg-id="' + checkId + '"], [data-client-id="' + checkId + '"], [data-backend-id="' + checkId + '"]');
      }
    }

    if ($existingEl.length) {
      // Message already exists in DOM! Just reconcile IDs and update delivery receipt
      if (msgId && !$existingEl.attr('data-firestore-id')) {
        $existingEl.attr('data-firestore-id', msgId);
      }
      if (msg.backend_id) {
        $existingEl.attr('data-backend-id', msg.backend_id);
      }
      if (existing) {
        if (msgId && existing.id !== msgId && !existing.firestore_id) {
          existing.firestore_id = msgId;
        }
        if (msg.backend_id) {
          existing.backend_id = msg.backend_id;
        }
        if (msg.is_read || msg.status === 'seen') {
          existing.is_read = true;
          existing.status = 'seen';
          updateMessageStatus(existing.id, 'seen', peer);
        } else if (msg.status && existing.status !== 'seen') {
          existing.status = msg.status;
          updateMessageStatus(existing.id, msg.status, peer);
        }
      }
      return false; // Did not add a new bubble
    }

    // Extra safety guard: check the very last message in the container
    var $lastRow = $container.children('.msg-row').last();
    if ($lastRow.length) {
      var lastText = $lastRow.find('.msg-bubble .msg-text').text().trim() || $lastRow.find('.msg-bubble').text().trim();
      var thisText = String(msg.body || '').trim();
      var me = Store.getState().user || {};
      var isMine = msg.sender_id === me.id || (msg.sender && msg.sender.id === me.id);
      var lastIsMine = $lastRow.hasClass('is-mine');

      if (isMine === lastIsMine && thisText && lastText === thisText) {
        var lastMsgObj = chatState.messages[chatState.messages.length - 1];
        var msgTime = msg.created_at ? new Date(msg.created_at).getTime() : Date.now();
        var lastTime = (lastMsgObj && lastMsgObj.created_at) ? new Date(lastMsgObj.created_at).getTime() : Date.now();
        if (Math.abs(msgTime - lastTime) <= 60000) {
          if (msgId) $lastRow.attr('data-firestore-id', msgId);
          if (msg.backend_id) $lastRow.attr('data-backend-id', msg.backend_id);
          if (lastMsgObj) {
            lastMsgObj.firestore_id = msgId;
            if (msg.is_read) {
              lastMsgObj.is_read = true;
              lastMsgObj.status = 'seen';
              updateMessageStatus(lastMsgObj.id, 'seen', peer);
            }
          }
          return false;
        }
      }
    }

    // Truly new message! Push to state, render bubble, enrich links
    chatState.messages.push(msg);
    var $bubble = $(renderMessageBubble(msg, peer));
    $container.append($bubble);
    enrichLinkPreviews($bubble);
    return true;
  }

  function renderMessageBubble(msg, peer) {
    var me = Store.getState().user || {};
    var isMine = msg.sender_id === me.id || (msg.sender && msg.sender.id === me.id);
    var attachmentHtml = '';
    if (msg.attachment_url) {
      var src = fmt.resolveMediaUrl(msg.attachment_url);
      attachmentHtml =
        '<div style="margin-bottom:' + (msg.body ? '6px' : '0') + ';">' +
          '<img src="' + fmt.escapeHtml(src) + '" alt="Message attachment" class="js-open-lightbox" ' +
            'style="max-width:240px;max-height:220px;border-radius:8px;cursor:zoom-in;" loading="lazy" />' +
        '</div>';
    }

    var receiptHtml = '';
    if (isMine) {
      var status = msg.status || 'sent';
      if (msg.is_read || status === 'seen') {
        status = 'seen';
      } else if (status === 'delivered' || (peer && peer.is_online)) {
        status = 'delivered';
      }
      receiptHtml = renderDeliveryReceipt(status, peer);
    }

    var previewHtml = '';
    var url = extractFirstUrl(msg.body);
    if (url) {
      previewHtml = renderLinkPreviewHtml(url);
    }

    var dataAttrs = 'data-msg-id="' + fmt.escapeHtml(msg.id || '') + '"';
    if (msg.client_id) dataAttrs += ' data-client-id="' + fmt.escapeHtml(msg.client_id) + '"';
    if (msg.backend_id) dataAttrs += ' data-backend-id="' + fmt.escapeHtml(msg.backend_id) + '"';
    if (msg.firestore_id) dataAttrs += ' data-firestore-id="' + fmt.escapeHtml(msg.firestore_id) + '"';

    return (
      '<div class="msg-row ' + (isMine ? 'is-mine' : '') + '" ' + dataAttrs + '>' +
        (!isMine ? fmt.renderAvatar(msg.sender || {}, 'avatar-xs', false) : '') +
        '<div class="msg-bubble-wrap">' +
          '<div class="msg-bubble">' +
            attachmentHtml +
            (msg.body ? ('<div class="msg-text">' + fmt.formatPostContent(msg.body) + '</div>') : '') +
            previewHtml +
          '</div>' +
          '<div class="msg-meta-row">' +
            '<span class="msg-timestamp">' + fmt.escapeHtml(fmt.timeAgo(msg.created_at)) + '</span>' +
            (isMine ? '<span class="receipt-slot">' + receiptHtml + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function scrollThreadToBottom() {
    var el = document.getElementById('thread-messages-scroll');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function openThread(conversationId) {
    chatState.activeId = conversationId;
    chatState.messages = [];
    chatState.lastMessageTimestamp = null;

    if (window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState(null, '', '/messages/' + encodeURIComponent(conversationId));
    }

    var conv = chatState.conversations.find(function (c) { return c.id === conversationId; });
    var peer = (conv && conv.peer) || {};
    var peerProfileHref = '/profile/' + encodeURIComponent(peer.username || peer.id || '');

    $('#messenger-root').addClass('mobile-thread-open');
    if (window.innerWidth < 1024) {
      $('body').addClass('in-mobile-chat-thread');
    }
    renderConversationList();

    // Clone the semantic HTML <template id="tpl-active-thread"> from messages.html
    var tpl = document.getElementById('tpl-active-thread');
    var $pane = $('#messenger-thread-pane');
    if (tpl && tpl.content) {
      $pane.empty()[0].appendChild(tpl.content.cloneNode(true));
    }

    $('#thread-peer-link, #thread-profile-btn').attr('href', peerProfileHref);
    $('#thread-peer-avatar').html(fmt.renderAvatar(peer, 'avatar-sm', true));
    $('#thread-peer-name').text(peer.full_name || 'Campus Member');
    $('#thread-peer-role-badge').html(fmt.roleBadgeHtml(peer.role));
    $('#thread-peer-status').html(
      peer.is_online
        ? '<span style="color:var(--color-green-700);font-weight:500;">Online now</span>'
        : fmt.escapeHtml(peer.department || fmt.roleLabel(peer.role))
    );
    $('#thread-messages-scroll').html('<p class="text-xs-muted" style="text-align:center;padding:16px;">Loading conversation history...</p>');

    if (window.innerWidth >= 1024) {
      $('.js-mobile-back-inbox').addClass('hidden');
    }
    UI.refreshIcons($pane[0]);

    Services.Messages.listMessages(conversationId, { limit: 60 })
      .then(function (res) {
        if (chatState.activeId !== conversationId) return;
        var rawItems = (res.data && (res.data.messages || res.data.items)) || [];

        // Deduplicate incoming raw items from backend
        var seenIds = {};
        var items = [];
        rawItems.forEach(function (m) {
          if (m.id && seenIds[m.id]) return;
          if (m.id) seenIds[m.id] = true;

          if (items.length > 0) {
            var prev = items[items.length - 1];
            if (String(prev.sender_id) === String(m.sender_id) &&
                String(prev.body || '').trim() === String(m.body || '').trim()) {
              var tPrev = prev.created_at ? new Date(prev.created_at).getTime() : 0;
              var tCurr = m.created_at ? new Date(m.created_at).getTime() : 0;
              if (Math.abs(tCurr - tPrev) < 5000) {
                return;
              }
            }
          }
          items.push(m);
        });

        chatState.messages = items;
        var $scroll = $('#thread-messages-scroll');
        if (!items.length) {
          $scroll.html('<p class="text-xs-muted" style="text-align:center;padding:24px;">No messages yet. Say hello!</p>');
        } else {
          $scroll.html(items.map(function (m) { return renderMessageBubble(m, peer); }).join(''));
          chatState.lastMessageTimestamp = items[items.length - 1].created_at;
          scrollThreadToBottom();
          enrichLinkPreviews($scroll);
        }
        markConversationAsRead(conversationId);
        startActiveThreadPolling(conversationId);

        // Attach Realtime Firebase NoSQL Firestore Listeners
        if (window.UgnayraFirebaseChat && window.UgnayraFirebaseChat.isAvailable()) {
          var me = Store.getState().user || {};
          window.UgnayraFirebaseChat.listenToThread(conversationId, function (fbMsgs) {
            if (chatState.activeId !== conversationId) return;
            var currentPeer = (conv && conv.peer) || {};
            if (fbMsgs && fbMsgs.length) {
              var $s = $('#thread-messages-scroll');
              var addedAny = false;

              fbMsgs.forEach(function (fbMsg) {
                var added = appendOrUpdateBubble($s, fbMsg, currentPeer);
                if (added) addedAny = true;
              });

              if (addedAny) {
                chatState.lastMessageTimestamp = fbMsgs[fbMsgs.length - 1].created_at;
                scrollThreadToBottom();
                markConversationAsRead(conversationId);
              }
            }
          });

          window.UgnayraFirebaseChat.listenToTyping(conversationId, me.id, function (typingUser) {
            if (chatState.activeId !== conversationId) return;
            $('#thread-typing-indicator').text(typingUser ? (typingUser + ' is typing...') : '');
          });
        }
      })
      .catch(function (err) {
        $('#thread-messages-scroll').html('<p class="form-error" style="padding:16px;">' + fmt.escapeHtml(err.message) + '</p>');
      });
  }

  function markConversationAsRead(conversationId) {
    var conv = chatState.conversations.find(function (c) { return c.id === conversationId; });
    if (conv && conv.unread_count > 0) {
      var prevUnread = Number(conv.unread_count || 0);
      conv.unread_count = 0;
      renderConversationList();
      Store.setState({ unreadMessages: Math.max(0, Store.getState().unreadMessages - prevUnread) });
    }
    Services.Messages.markRead(conversationId).catch(function () {});

    // Sync seen status to Firestore NoSQL
    if (window.UgnayraFirebaseChat && typeof window.UgnayraFirebaseChat.markMessagesRead === 'function') {
      var me = Store.getState().user || {};
      window.UgnayraFirebaseChat.markMessagesRead(conversationId, me.id);
    }
  }

  function startActiveThreadPolling(conversationId) {
    if (chatState.pollTimer) clearInterval(chatState.pollTimer);
    chatState.pollTimer = setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      if (chatState.activeId !== conversationId) return;

      Services.Messages.listMessages(conversationId, {
        after: chatState.lastMessageTimestamp || ''
      })
        .then(function (res) {
          if (chatState.activeId !== conversationId) return;
          var incoming = (res.data && (res.data.messages || res.data.items)) || [];
          var peerTyping = Boolean(res.data && res.data.peer_is_typing);
          var peerName = (res.data && res.data.peer_name) || 'Classmate';

          $('#thread-typing-indicator').text(peerTyping ? (peerName + ' is typing...') : '');

          if (incoming.length) {
            var $scroll = $('#thread-messages-scroll');
            var conv = chatState.conversations.find(function (c) { return c.id === conversationId; });
            var peer = (conv && conv.peer) || {};
            var addedAny = false;

            if (!chatState.messages.length) $scroll.empty();
            incoming.forEach(function (m) {
              var added = appendOrUpdateBubble($scroll, m, peer);
              if (added) addedAny = true;
            });

            if (addedAny) {
              chatState.lastMessageTimestamp = incoming[incoming.length - 1].created_at;
              scrollThreadToBottom();
              markConversationAsRead(conversationId);
            }
          }
        })
        .catch(function () {});
    }, window.UGNAYRA_CONFIG.CHAT_POLL_MS);
  }

  function loadConversations(initialTargetId) {
    Services.Messages.listConversations()
      .then(function (res) {
        chatState.conversations = (res.data && (res.data.conversations || res.data.items)) || [];
        renderConversationList();
        var pickId = initialTargetId || (window.innerWidth >= 1024 && chatState.conversations[0] && chatState.conversations[0].id);
        if (pickId) openThread(pickId);
      })
      .catch(function (err) {
        $('#conversation-list-box').html('<p class="form-error" style="padding:16px;">' + fmt.escapeHtml(err.message) + '</p>');
      });
  }

  function openNewChatPickerModal() {
    var $modal = UI.openModal({
      title: 'Start Private Conversation',
      bodyHtml:
        '<div class="form-group">' +
          '<label class="form-label" for="new-chat-search">Search Student, Teacher, or Personnel</label>' +
          '<input type="search" id="new-chat-search" class="form-input" placeholder="Type name, username, or department..." />' +
        '</div>' +
        '<div id="new-chat-results" style="max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">' +
          '<p class="text-xs-muted">Loading campus directory...</p>' +
        '</div>'
    });

    function fetchDirectory(query) {
      Services.Profiles.list({ q: query || '', limit: 20 })
        .then(function (res) {
          var me = Store.getState().user || {};
          var users = ((res.data && res.data.items) || []).filter(function (u) { return u.id !== me.id; });
          var $resBox = $modal.find('#new-chat-results');
          if (!users.length) {
            $resBox.html('<p class="text-xs-muted">No matching campus members found.</p>');
            return;
          }
          $resBox.html(users.map(function (u) {
            return (
              '<button type="button" class="dropdown-item js-pick-chat-recipient" data-user-id="' + fmt.escapeHtml(u.id) + '" ' +
                'style="justify-content:space-between;padding:10px;border:1px solid var(--color-border-subtle);">' +
                '<div class="flex items-center gap-3 min-w-0">' +
                  fmt.renderAvatar(u, 'avatar-sm', true) +
                  '<div class="min-w-0" style="text-align:left;">' +
                    '<div class="text-sm truncate" style="font-weight:600;">' + fmt.escapeHtml(u.full_name) + '</div>' +
                    '<div class="text-xs-muted truncate">@' + fmt.escapeHtml(u.username) + ' · ' + fmt.escapeHtml(u.department || fmt.roleLabel(u.role)) + '</div>' +
                  '</div>' +
                '</div>' +
                fmt.roleBadgeHtml(u.role) +
              '</button>'
            );
          }).join(''));
          UI.refreshIcons($resBox[0]);
        })
        .catch(function (err) {
          $modal.find('#new-chat-results').html('<p class="form-error">' + fmt.escapeHtml(err.message) + '</p>');
        });
    }

    fetchDirectory('');
    var timer = null;
    $modal.on('input', '#new-chat-search', function () {
      var val = ($(this).val() || '').trim();
      clearTimeout(timer);
      timer = setTimeout(function () { fetchDirectory(val); }, 250);
    });

    $modal.on('click', '.js-pick-chat-recipient', function () {
      var uid = $(this).attr('data-user-id');
      Services.Messages.openDirect(uid)
        .then(function (res) {
          UI.closeModal();
          var conv = res.data && res.data.conversation;
          if (conv) {
            var exists = chatState.conversations.some(function (c) { return c.id === conv.id; });
            if (!exists) chatState.conversations.unshift(conv);
            renderConversationList();
            openThread(conv.id);
          }
        })
        .catch(function (err) {
          UI.toast(err.message || 'Could not open conversation.', 'error');
        });
    });
  }

  function mount(conversationIdParam) {
    stopChatPolling();
    chatState.activeId = null;
    chatState.filterText = '';
    if (window.UgnayraFirebaseChat && typeof window.UgnayraFirebaseChat.init === 'function') {
      window.UgnayraFirebaseChat.init();
    }
    return Templates.renderInto('#main-stage', Templates.VIEWS.MESSAGES).then(function () {
      loadConversations(conversationIdParam || null);
    });
  }

  $(document).on('click', '.js-select-conversation', function () {
    var cid = $(this).attr('data-conversation-id');
    if (cid) openThread(cid);
  });

  $(document).on('click', '.js-mobile-back-inbox', function () {
    $('#messenger-root').removeClass('mobile-thread-open');
    $('body').removeClass('in-mobile-chat-thread');
    if (chatState.pollTimer) {
      clearInterval(chatState.pollTimer);
      chatState.pollTimer = null;
    }
    chatState.activeId = null;
    if (window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState(null, '', '/messages');
    }
    renderConversationList();
  });

  $(document).on('input', '#conversation-filter-input', function () {
    chatState.filterText = ($(this).val() || '').trim();
    renderConversationList();
  });

  $(document).on('click', '#new-conversation-btn, #empty-new-chat-btn', openNewChatPickerModal);

  $(document).on('keydown', '#thread-message-input', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('#thread-send-form').trigger('submit');
      return;
    }
    var now = Date.now();
    if (chatState.activeId && now - chatState.lastTypingSentAt > window.UGNAYRA_CONFIG.TYPING_THROTTLE_MS) {
      chatState.lastTypingSentAt = now;
      Services.Messages.sendTyping(chatState.activeId).catch(function () {});
      if (window.UgnayraFirebaseChat && window.UgnayraFirebaseChat.isAvailable()) {
        window.UgnayraFirebaseChat.setTyping(chatState.activeId, Store.getState().user, true);
      }
    }
  });

  var isSendingMessage = false;

  $(document).on('submit', '#thread-send-form', function (e) {
    e.preventDefault();
    if (!chatState.activeId) return;
    if (isSendingMessage) return;

    var $input = $('#thread-message-input');
    var body = ($input.val() || '').trim();
    if (!body) return;

    isSendingMessage = true;
    setTimeout(function () { isSendingMessage = false; }, 350);

    var targetConvId = chatState.activeId;
    var $btn = $('#thread-send-btn');
    var me = Store.getState().user || {};
    var conv = chatState.conversations.find(function (c) { return c.id === targetConvId; });
    var peer = (conv && conv.peer) || {};

    $input.val('').trigger('focus');

    // 1. Optimistic Message with 'sending' (hollow blue circle)
    var tempId = 'temp_' + Date.now();
    var optimisticMsg = {
      id: tempId,
      client_id: tempId,
      temp_id: tempId,
      conversation_id: targetConvId,
      sender_id: me.id,
      sender: me,
      body: body,
      created_at: new Date().toISOString(),
      is_read: false,
      status: 'sending'
    };

    if (!chatState.messages.length) $('#thread-messages-scroll').empty();
    chatState.messages.push(optimisticMsg);
    var $bubble = $(renderMessageBubble(optimisticMsg, peer));
    $('#thread-messages-scroll').append($bubble);
    enrichLinkPreviews($bubble);
    scrollThreadToBottom();

    // 2. Send through Firebase Firestore NoSQL realtime layer
    if (window.UgnayraFirebaseChat && window.UgnayraFirebaseChat.isAvailable()) {
      window.UgnayraFirebaseChat.sendMessage(targetConvId, {
        client_id: tempId,
        sender_id: me.id,
        sender: me,
        body: body
      }).then(function (docPayload) {
        optimisticMsg.firestore_id = docPayload ? docPayload.id : null;
        optimisticMsg.status = 'sent';
        updateMessageStatus(optimisticMsg.id, 'sent', peer);

        setTimeout(function () {
          optimisticMsg.status = 'delivered';
          updateMessageStatus(optimisticMsg.id, 'delivered', peer);
        }, 350);
      }).catch(function () {});
    }

    // 3. Persist to Backend API
    Services.Messages.send(targetConvId, { body: body })
      .then(function (res) {
        var realMsg = res.data && res.data.message;
        if (realMsg && chatState.activeId === targetConvId) {
          optimisticMsg.backend_id = realMsg.id;
          var $row = $('[data-client-id="' + tempId + '"], [data-msg-id="' + tempId + '"]');
          if ($row.length) {
            $row.attr('data-backend-id', realMsg.id);
            $row.attr('data-msg-id', realMsg.id);
          }
          optimisticMsg.id = realMsg.id;
          optimisticMsg.status = (peer && peer.is_online) ? 'delivered' : 'sent';
          updateMessageStatus(optimisticMsg.id, optimisticMsg.status, peer);

          chatState.lastMessageTimestamp = realMsg.created_at;

          if (conv) {
            conv.last_message_preview = body;
            conv.last_message = { body: body, created_at: realMsg.created_at, is_mine: true };
            conv.last_message_at = realMsg.created_at;
            renderConversationList();
          }
        }
      })
      .catch(function (err) {
        UI.toast(err.message || 'Message failed to send.', 'error');
      });
  });

  $(document).on('change', '#thread-attachment-input', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file || !chatState.activeId) return;

    var cfg = window.UGNAYRA_CONFIG;
    if (cfg.ALLOWED_IMAGE_TYPES.indexOf(file.type) === -1 || file.size > cfg.MAX_UPLOAD_BYTES) {
      UI.toast('Choose a JPEG, PNG, WebP, or GIF image under 5 MB.', 'error');
      return;
    }

    var targetConvId = chatState.activeId;
    var fd = new FormData();
    fd.append('attachment', file);
    fd.append('body', ($('#thread-message-input').val() || '').trim());

    var conv = chatState.conversations.find(function (c) { return c.id === targetConvId; });
    var peer = (conv && conv.peer) || {};

    UI.toast('Uploading attachment...', 'info');
    Services.Messages.send(targetConvId, fd)
      .then(function (res) {
        $('#thread-message-input').val('');
        var msg = res.data && res.data.message;
        if (msg && chatState.activeId === targetConvId) {
          if (!chatState.messages.length) $('#thread-messages-scroll').empty();
          appendOrUpdateBubble($('#thread-messages-scroll'), msg, peer);
          chatState.lastMessageTimestamp = msg.created_at;
          scrollThreadToBottom();
        }
      })
      .catch(function (err) {
        UI.toast(err.message || 'Could not send image attachment.', 'error');
      });
  });

  // WebRTC Audio/Video Consultation Trigger
  $(document).on('click', '.js-start-rtc-call', function () {
    var callType = $(this).attr('data-call-type') || 'audio';
    var conv = chatState.conversations.find(function (c) { return c.id === chatState.activeId; });
    var peer = (conv && conv.peer) ? Object.assign({}, conv.peer) : {};

    if (!peer.id && conv) {
      peer.id = conv.peer_id || conv.target_user_id || conv.receiver_id || null;
    }

    if (!peer.id) {
      var profileHref = $('#thread-peer-link').attr('href') || '';
      var peerIdFromHref = profileHref.replace(/^\/profile\//, '');
      if (peerIdFromHref) {
        peer.id = peerIdFromHref;
      }
    }

    peer.full_name = peer.full_name || $('#thread-peer-name').text() || 'Classmate';
    peer.role = peer.role || 'student';

    if (window.UgnayraRtcModule) {
      window.UgnayraRtcModule.startCall(peer, callType, chatState.activeId);
    }
  });

  window.UgnayraMessagesModule = {
    mount: mount,
    unmount: stopChatPolling
  };
})(window, window.jQuery);
