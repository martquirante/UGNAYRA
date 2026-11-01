/**
 * UGNAYRA — Reusable Post Card & Delegated jQuery Interaction Component
 * Handles rendering, likes/unlikes, slideToggle comments, shares, editing, and deletion.
 */
(function (window, $) {
  'use strict';

  var fmt = window.UgnayraFormat;
  var UI = window.UgnayraUI;
  var Services = window.UgnayraServices;

  function renderMediaGrid(images) {
    if (!Array.isArray(images) || !images.length) return '';
    var sliced = images.slice(0, 4);
    var countClass = 'count-' + sliced.length;
    var itemsHtml = sliced.map(function (img) {
      var src = fmt.resolveMediaUrl(img.image_url || img.url || img);
      var alt = img.alt_text || 'Post attachment';
      return (
        '<img src="' + fmt.escapeHtml(src) + '" alt="' + fmt.escapeHtml(alt) + '" ' +
        'class="post-media-item js-open-lightbox" loading="lazy" />'
      );
    }).join('');
    return '<div class="post-media-grid ' + countClass + '">' + itemsHtml + '</div>';
  }

  function renderSharedEmbed(sharedPost) {
    if (!sharedPost) return '';
    if (sharedPost.unavailable) {
      return (
        '<div class="shared-post-embed text-secondary">' +
          '<em>Original shared post is no longer available.</em>' +
        '</div>'
      );
    }
    var author = sharedPost.author || {};
    return (
      '<div class="shared-post-embed">' +
        '<div class="flex items-center gap-2 mb-2">' +
          fmt.renderAvatar(author, 'avatar-xs', false) +
          '<a href="/profile/' + fmt.escapeHtml(author.username || author.id || '') + '" class="text-sm" style="font-weight:600;color:var(--color-ink-900);">' +
            fmt.escapeHtml(author.full_name || 'Campus Member') +
          '</a>' +
          fmt.roleBadgeHtml(author.role) +
          '<span class="text-xs-muted">· ' + fmt.escapeHtml(fmt.timeAgo(sharedPost.created_at)) + '</span>' +
        '</div>' +
        (sharedPost.content ? '<div class="text-body" style="font-size:var(--text-sm);">' + fmt.formatPostContent(sharedPost.content) + '</div>' : '') +
        renderMediaGrid(sharedPost.images || []) +
      '</div>'
    );
  }

  function renderCommentItem(comment, currentUser) {
    var author = comment.author || {};
    var canDelete = currentUser && (
      currentUser.id === comment.author_id ||
      currentUser.id === author.id ||
      currentUser.role === 'personnel'
    );
    return (
      '<div class="comment-item" data-comment-id="' + fmt.escapeHtml(comment.id) + '">' +
        '<a href="/profile/' + fmt.escapeHtml(author.username || author.id || '') + '">' +
          fmt.renderAvatar(author, 'avatar-xs', false) +
        '</a>' +
        '<div class="comment-bubble">' +
          '<div class="comment-header">' +
            '<div class="flex items-center gap-2 flex-wrap">' +
              '<a href="/profile/' + fmt.escapeHtml(author.username || author.id || '') + '" class="comment-author">' +
                fmt.escapeHtml(author.full_name || 'Campus Member') +
              '</a>' +
              fmt.roleBadgeHtml(author.role) +
              '<span class="text-xs-muted">' + fmt.escapeHtml(fmt.timeAgo(comment.created_at)) + '</span>' +
            '</div>' +
            (canDelete
              ? '<button type="button" class="btn-icon js-delete-comment" style="width:24px;height:24px;" ' +
                'data-comment-id="' + fmt.escapeHtml(comment.id) + '" aria-label="Delete comment" title="Delete comment">' +
                '<i data-lucide="trash-2" class="icon-xs"></i></button>'
              : '') +
          '</div>' +
          '<div class="comment-text">' + fmt.formatPostContent(comment.content) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderPostCard(post) {
    var st = window.UgnayraStore.getState();
    var me = st.user;
    var author = post.author || {};
    var isOwner = me && (me.id === post.author_id || me.id === author.id);
    var canDelete = isOwner || (me && me.role === 'personnel');

    var communityBadge = '';
    if (post.community && post.community.name) {
      var cSlug = post.community.slug || post.community.id;
      communityBadge =
        '<a href="/communities/' + fmt.escapeHtml(cSlug) + '" class="post-community-pill">' +
          '<i data-lucide="users" class="icon-xs"></i>' +
          fmt.escapeHtml(post.community.name) +
        '</a>';
    }

    var announcementTag = post.is_announcement
      ? '<span class="badge badge-important"><i data-lucide="megaphone" class="icon-xs"></i>Community Notice</span>'
      : '';

    var menuHtml = '';
    if (isOwner || canDelete) {
      menuHtml =
        '<div class="dropdown">' +
          '<button type="button" class="btn-icon js-toggle-post-menu" aria-label="Post options">' +
            '<i data-lucide="more-horizontal" class="icon-md"></i>' +
          '</button>' +
          '<div class="dropdown-menu hidden">' +
            (isOwner
              ? '<button type="button" class="dropdown-item js-edit-post" data-post-id="' + fmt.escapeHtml(post.id) + '">' +
                  '<i data-lucide="pencil" class="icon-sm"></i><span>Edit Post</span>' +
                '</button>'
              : '') +
            (canDelete
              ? '<button type="button" class="dropdown-item is-danger js-delete-post" data-post-id="' + fmt.escapeHtml(post.id) + '">' +
                  '<i data-lucide="trash-2" class="icon-sm"></i><span>Delete Post</span>' +
                '</button>'
              : '') +
          '</div>' +
        '</div>';
    }

    var likesCount = Number(post.likes_count || 0);
    var commentsCount = Number(post.comments_count || 0);
    var sharesCount = Number(post.shares_count || 0);
    var isLiked = Boolean(post.is_liked);

    return (
      '<article class="post-card ' + (post.is_pinned ? 'is-pinned-post' : '') + '" ' +
        'data-post-id="' + fmt.escapeHtml(post.id) + '" ' +
        'data-raw-content="' + fmt.escapeHtml(post.content || '') + '">' +
        '<header class="post-header">' +
          '<div class="post-author-row">' +
            '<a href="/profile/' + fmt.escapeHtml(author.username || author.id || '') + '">' +
              fmt.renderAvatar(author, 'avatar-md', false) +
            '</a>' +
            '<div class="min-w-0">' +
              '<div class="flex items-center gap-2 flex-wrap">' +
                '<a href="/profile/' + fmt.escapeHtml(author.username || author.id || '') + '" class="post-author-name">' +
                  fmt.escapeHtml(author.full_name || 'Campus Member') +
                '</a>' +
                fmt.roleBadgeHtml(author.role) +
                announcementTag +
              '</div>' +
              '<div class="post-meta-line">' +
                (author.department ? '<span>' + fmt.escapeHtml(author.department) + '</span><span>·</span>' : '') +
                '<time datetime="' + fmt.escapeHtml(post.created_at || '') + '" title="' + fmt.escapeHtml(fmt.formatDateTime(post.created_at)) + '">' +
                  fmt.escapeHtml(fmt.timeAgo(post.created_at)) +
                '</time>' +
                (post.is_edited ? '<span class="js-edited-label">· Edited</span>' : '<span class="js-edited-label hidden">· Edited</span>') +
                (communityBadge ? '<span>·</span>' + communityBadge : '') +
              '</div>' +
            '</div>' +
          '</div>' +
          menuHtml +
        '</header>' +

        (post.content
          ? '<div class="post-body js-post-body">' + fmt.formatPostContent(post.content) + '</div>'
          : '<div class="post-body js-post-body hidden"></div>') +

        renderSharedEmbed(post.shared_post) +
        renderMediaGrid(post.images || []) +

        '<div class="post-stats-bar tabular-nums">' +
          '<span><strong class="js-likes-count">' + likesCount + '</strong> ' + (likesCount === 1 ? 'reaction' : 'reactions') + '</span>' +
          '<div class="flex items-center gap-3">' +
            '<button type="button" class="text-xs-muted js-toggle-comments" data-post-id="' + fmt.escapeHtml(post.id) + '">' +
              '<span class="js-comments-count">' + commentsCount + '</span> comments' +
            '</button>' +
            '<span><span class="js-shares-count">' + sharesCount + '</span> shares</span>' +
          '</div>' +
        '</div>' +

        '<div class="post-actions-bar">' +
          '<button type="button" class="post-action-btn js-like-btn ' + (isLiked ? 'is-liked' : '') + '" ' +
            'data-post-id="' + fmt.escapeHtml(post.id) + '" aria-pressed="' + (isLiked ? 'true' : 'false') + '">' +
            '<i data-lucide="heart" class="icon-md"></i><span>Like</span>' +
          '</button>' +
          '<button type="button" class="post-action-btn js-toggle-comments" data-post-id="' + fmt.escapeHtml(post.id) + '">' +
            '<i data-lucide="message-square" class="icon-md"></i><span>Comment</span>' +
          '</button>' +
          '<button type="button" class="post-action-btn js-share-post" data-post-id="' + fmt.escapeHtml(post.id) + '">' +
            '<i data-lucide="repeat-2" class="icon-md"></i><span>Share</span>' +
          '</button>' +
        '</div>' +

        '<section class="comments-drawer hidden" data-comments-for="' + fmt.escapeHtml(post.id) + '" aria-label="Post comments">' +
          '<div class="comment-list js-comment-list"></div>' +
          '<form class="comment-form js-comment-form" data-post-id="' + fmt.escapeHtml(post.id) + '" novalidate>' +
            (me ? fmt.renderAvatar(me, 'avatar-xs', false) : '') +
            '<input type="text" name="content" class="form-input" style="height:36px;font-size:var(--text-sm);" ' +
              'placeholder="Write a respectful academic reply..." maxlength="2000" aria-label="Write a comment" required />' +
            '<button type="submit" class="btn btn-primary btn-sm">Reply</button>' +
          '</form>' +
        '</section>' +
      '</article>'
    );
  }

  // -------------------------------------------------------------------------
  // Delegated jQuery Event Handlers for All Post Cards Across Every View
  // -------------------------------------------------------------------------

  // 1. Dropdown Menu Toggle
  $(document).on('click', '.js-toggle-post-menu', function (e) {
    e.stopPropagation();
    var $menu = $(this).siblings('.dropdown-menu');
    $('.dropdown-menu').not($menu).addClass('hidden');
    $menu.toggleClass('hidden');
  });

  // 2. Image Lightbox
  $(document).on('click', '.js-open-lightbox', function () {
    UI.openLightbox($(this).attr('src'), $(this).attr('alt'));
  });

  // 3. Like / Unlike via AJAX (Optimistic Update + Rollback on Error)
  $(document).on('click', '.js-like-btn', function () {
    var $btn = $(this);
    if ($btn.data('busy')) return;
    $btn.data('busy', true);

    var postId = $btn.attr('data-post-id');
    var $card = $btn.closest('.post-card');
    var $count = $card.find('.js-likes-count');
    var wasLiked = $btn.hasClass('is-liked');
    var prevCount = parseInt($count.text(), 10) || 0;
    var nextCount = wasLiked ? Math.max(0, prevCount - 1) : prevCount + 1;

    $btn.toggleClass('is-liked', !wasLiked).attr('aria-pressed', (!wasLiked).toString());
    $count.text(nextCount);

    var req = wasLiked ? Services.Posts.unlike(postId) : Services.Posts.like(postId);
    req
      .then(function (res) {
        if (res && res.data && typeof res.data.likes_count === 'number') {
          $count.text(res.data.likes_count);
        }
      })
      .catch(function (err) {
        $btn.toggleClass('is-liked', wasLiked).attr('aria-pressed', wasLiked.toString());
        $count.text(prevCount);
        UI.toast(err.message || 'Could not update reaction.', 'error');
      })
      .finally(function () {
        $btn.data('busy', false);
      });
  });

  // 4. Toggle Comments Drawer with jQuery slideToggle & Load via AJAX
  $(document).on('click', '.js-toggle-comments', function () {
    var postId = $(this).attr('data-post-id');
    var $card = $(this).closest('.post-card');
    var $drawer = $card.find('.comments-drawer');
    var $list = $drawer.find('.js-comment-list');

    if ($drawer.hasClass('hidden')) {
      $drawer.removeClass('hidden').hide().slideDown(170, function () {
        $drawer.find('input[name="content"]').trigger('focus');
      });

      if (!$drawer.data('loaded')) {
        $list.html('<p class="text-xs-muted" style="padding:4px 0;">Loading comments...</p>');
        Services.Posts.listComments(postId)
          .then(function (res) {
            var items = (res.data && res.data.items) || [];
            var me = window.UgnayraStore.getState().user;
            if (!items.length) {
              $list.html('<p class="text-xs-muted js-no-comments">No comments yet. Start the discussion.</p>');
            } else {
              $list.html(items.map(function (c) { return renderCommentItem(c, me); }).join(''));
              UI.refreshIcons($list[0]);
            }
            $drawer.data('loaded', true);
          })
          .catch(function (err) {
            $list.html('<p class="form-error">' + fmt.escapeHtml(err.message) + '</p>');
          });
      }
    } else {
      $drawer.slideUp(150, function () {
        $drawer.addClass('hidden');
      });
    }
  });

  // 5. Submit New Comment via AJAX
  $(document).on('submit', '.js-comment-form', function (e) {
    e.preventDefault();
    var $form = $(this);
    var postId = $form.attr('data-post-id');
    var $input = $form.find('input[name="content"]');
    var content = ($input.val() || '').trim();
    if (!content) return;

    var $btn = $form.find('button[type="submit"]');
    UI.setButtonLoading($btn, true);

    Services.Posts.addComment(postId, { content: content })
      .then(function (res) {
        var comment = res.data && res.data.comment;
        var me = window.UgnayraStore.getState().user;
        var $card = $form.closest('.post-card');
        var $list = $card.find('.js-comment-list');
        $list.find('.js-no-comments').remove();

        if (comment) {
          var $newEl = $(renderCommentItem(comment, me)).hide();
          $list.append($newEl);
          $newEl.fadeIn(160);
          UI.refreshIcons($newEl[0]);
        }
        $input.val('');
        var $cCount = $card.find('.js-comments-count');
        var next = (res.data && typeof res.data.comments_count === 'number')
          ? res.data.comments_count
          : ((parseInt($cCount.first().text(), 10) || 0) + 1);
        $cCount.text(next);
      })
      .catch(function (err) {
        UI.toast(err.message || 'Unable to post comment.', 'error');
      })
      .finally(function () {
        UI.setButtonLoading($btn, false);
      });
  });

  // 6. Delete Comment via AJAX
  $(document).on('click', '.js-delete-comment', function () {
    var $btn = $(this);
    var commentId = $btn.attr('data-comment-id');
    var $item = $btn.closest('.comment-item');
    var $card = $btn.closest('.post-card');

    UI.confirm({
      title: 'Delete Comment',
      message: 'Remove this comment permanently?',
      confirmLabel: 'Delete',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      Services.Posts.deleteComment(commentId)
        .then(function () {
          $item.fadeOut(140, function () { $item.remove(); });
          var $cCount = $card.find('.js-comments-count');
          var cur = parseInt($cCount.first().text(), 10) || 0;
          $cCount.text(Math.max(0, cur - 1));
          UI.toast('Comment deleted.', 'success');
        })
        .catch(function (err) {
          UI.toast(err.message || 'Unable to delete comment.', 'error');
        });
    });
  });

  // 7. Edit Post Modal via AJAX
  $(document).on('click', '.js-edit-post', function () {
    $('.dropdown-menu').addClass('hidden');
    var postId = $(this).attr('data-post-id');
    var $card = $(this).closest('.post-card');
    var currentText = $card.attr('data-raw-content') || '';

    var $modal = UI.openModal({
      title: 'Edit Post',
      bodyHtml:
        '<form id="edit-post-form" novalidate>' +
          '<div class="form-group" style="margin-bottom:0;">' +
            '<label class="form-label" for="edit-post-textarea">Post Content</label>' +
            '<textarea id="edit-post-textarea" name="content" class="form-textarea" rows="5" maxlength="5000">' +
              fmt.escapeHtml(currentText) +
            '</textarea>' +
            '<div class="form-error"></div>' +
          '</div>' +
        '</form>',
      footerHtml:
        '<button type="button" class="btn btn-secondary js-close-modal">Cancel</button>' +
        '<button type="button" class="btn btn-primary" id="save-edit-post-btn">Save Changes</button>'
    });

    $modal.on('click', '#save-edit-post-btn', function () {
      var $saveBtn = $(this);
      var updated = ($modal.find('#edit-post-textarea').val() || '').trim();
      if (!updated) {
        window.UgnayraValidator.setFieldError($modal.find('#edit-post-form'), 'content', 'Post content cannot be empty.');
        return;
      }
      UI.setButtonLoading($saveBtn, true, 'Saving...');
      Services.Posts.update(postId, { content: updated })
        .then(function () {
          $card.attr('data-raw-content', updated);
          $card.find('.js-post-body').removeClass('hidden').html(fmt.formatPostContent(updated));
          $card.find('.js-edited-label').removeClass('hidden');
          UI.closeModal();
          UI.toast('Post updated.', 'success');
        })
        .catch(function (err) {
          UI.toast(err.message || 'Failed to update post.', 'error');
        })
        .finally(function () {
          UI.setButtonLoading($saveBtn, false);
        });
    });
  });

  // 8. Delete Post Confirmation via AJAX
  $(document).on('click', '.js-delete-post', function () {
    $('.dropdown-menu').addClass('hidden');
    var postId = $(this).attr('data-post-id');
    var $card = $(this).closest('.post-card');

    UI.confirm({
      title: 'Delete Post',
      message: 'This post and all its comments and reactions will be permanently removed.',
      confirmLabel: 'Delete Post',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      Services.Posts.remove(postId)
        .then(function () {
          $card.fadeOut(180, function () { $card.remove(); });
          UI.toast('Post deleted.', 'success');
        })
        .catch(function (err) {
          UI.toast(err.message || 'Could not delete post.', 'error');
        });
    });
  });

  // 9. Multi-Channel Share & Repost Modal via AJAX
  function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '-9999px';
        textArea.style.left = '-9999px';
        textArea.setAttribute('readonly', '');
        document.body.appendChild(textArea);
        textArea.select();
        var successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) resolve();
        else reject(new Error('Copy command failed'));
      } catch (err) {
        reject(err);
      }
    });
  }

  $(document).on('click', '.js-copy-post-link', function () {
    var $btn = $(this);
    var url = $btn.attr('data-url');
    if (!url) return;

    copyTextToClipboard(url)
      .then(function () {
        $btn.addClass('is-copied').html('<i data-lucide="check" class="icon-sm"></i><span>Copied!</span>');
        UI.refreshIcons($btn[0]);
        UI.toast('Post link copied to clipboard!', 'success');
        clearTimeout($btn.data('copyTimer'));
        var t = setTimeout(function () {
          $btn.removeClass('is-copied').html('<i data-lucide="copy" class="icon-sm"></i><span>Copy</span>');
          UI.refreshIcons($btn[0]);
        }, 2200);
        $btn.data('copyTimer', t);
      })
      .catch(function () {
        UI.toast('Please copy the link directly from the text field.', 'warning');
      });
  });

  $(document).on('click', '.js-share-permalink', function () {
    this.select();
  });

  $(document).on('click', '.js-native-share-trigger', function () {
    var url = $(this).attr('data-url');
    var title = $(this).attr('data-title') || 'UGNAYRA Campus Post';
    var text = $(this).attr('data-text') || '';

    if (navigator.share) {
      navigator.share({
        title: title,
        text: text,
        url: url
      }).catch(function (err) {
        if (err && err.name !== 'AbortError') {
          UI.toast('Native share cancelled or unsupported on this device.', 'info');
        }
      });
    } else {
      copyTextToClipboard(url).then(function () {
        UI.toast('Direct link copied to clipboard!', 'success');
      });
    }
  });

  $(document).on('input keyup', '#share-post-comment', function () {
    var len = $(this).val().length;
    var $ctr = $('#share-comment-counter');
    $ctr.text(len + ' / 2000');
    if (len >= 2000) {
      $ctr.css('color', 'var(--color-red-600)');
    } else if (len >= 1800) {
      $ctr.css('color', 'var(--color-amber-600)');
    } else {
      $ctr.css('color', 'var(--color-ink-500)');
    }
  });

  $(document).on('click', '.js-share-post', function () {
    var postId = $(this).attr('data-post-id');
    var $card = $(this).closest('.post-card');

    var authorName = $card.find('.post-author-name').first().text().trim() || 'Campus Member';
    var authorProfileHref = $card.find('.post-author-name').first().attr('href') || '';
    var authorHandle = authorProfileHref.replace(/^\/profile\/?/, '@');
    if (authorHandle === '@' || !authorHandle) authorHandle = '';

    var authorRoleBadge = $card.find('.post-header .badge').first().prop('outerHTML') || '';
    var $rawAvatar = $card.find('.post-author-row .avatar').first().clone();
    $rawAvatar.removeClass('avatar-md avatar-lg').addClass('avatar-sm');
    var authorAvatarHtml = $rawAvatar[0] ? $rawAvatar[0].outerHTML : '';

    var rawContent = ($card.attr('data-raw-content') || '').trim();
    var postTime = $card.find('time').first().text().trim() || 'recent';
    var permalink = window.location.origin + '/post/' + encodeURIComponent(postId);

    var shareSnippet = rawContent
      ? (rawContent.length > 140 ? rawContent.substring(0, 140) + '...' : rawContent)
      : 'Check out this campus post on UGNAYRA';
    var shareTitle = 'Post by ' + authorName + ' · UGNAYRA';
    var shareXText = (rawContent ? (rawContent.length > 90 ? rawContent.substring(0, 90) + '... ' : rawContent + ' ') : '') + '— ' + authorName + ' on UGNAYRA';

    var $modal = UI.openModal({
      title: 'Share Post',
      bodyHtml:
        '<div class="share-modal-container">' +
          '<!-- Direct Link Section -->' +
          '<div class="share-section">' +
            '<div class="share-section-header">' +
              '<div class="share-section-title">' +
                '<i data-lucide="link" class="icon-xs"></i>' +
                '<span>Direct Post Link</span>' +
              '</div>' +
              '<span class="share-section-hint">Anyone with this link can view this post</span>' +
            '</div>' +
            '<div class="share-link-bar">' +
              '<div class="share-link-input-wrap">' +
                '<i data-lucide="link-2" class="share-link-icon"></i>' +
                '<input type="text" class="share-link-input js-share-permalink" readonly value="' + fmt.escapeHtml(permalink) + '" spellcheck="false" aria-label="Direct post link" />' +
              '</div>' +
              '<button type="button" class="btn btn-primary share-copy-btn js-copy-post-link" data-url="' + fmt.escapeHtml(permalink) + '" title="Copy link to clipboard">' +
                '<i data-lucide="copy" class="icon-sm"></i><span>Copy</span>' +
              '</button>' +
            '</div>' +
          '</div>' +

          '<!-- Social Share Channels -->' +
          '<div class="share-section">' +
            '<div class="share-section-header">' +
              '<div class="share-section-title">' +
                '<i data-lucide="share-2" class="icon-xs"></i>' +
                '<span>Share to Social Apps</span>' +
              '</div>' +
            '</div>' +
            '<div class="social-share-chips">' +
              (navigator.share
                ? '<button type="button" class="social-chip is-native js-native-share-trigger" data-url="' + fmt.escapeHtml(permalink) + '" data-title="' + fmt.escapeHtml(shareTitle) + '" data-text="' + fmt.escapeHtml(shareSnippet) + '" title="Share via native device menu">' +
                    '<i data-lucide="share" class="icon-xs"></i><span>Share via...</span>' +
                  '</button>'
                : '') +
              '<a href="https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(permalink) + '" target="_blank" rel="noopener noreferrer" class="social-chip is-facebook" title="Share to Facebook">' +
                '<svg class="social-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>' +
                '<span>Facebook</span>' +
              '</a>' +
              '<a href="https://twitter.com/intent/tweet?url=' + encodeURIComponent(permalink) + '&text=' + encodeURIComponent(shareXText) + '" target="_blank" rel="noopener noreferrer" class="social-chip is-x" title="Post on X (Twitter)">' +
                '<svg class="social-icon" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>' +
                '<span>X (Twitter)</span>' +
              '</a>' +
              '<a href="https://t.me/share/url?url=' + encodeURIComponent(permalink) + '&text=' + encodeURIComponent(shareTitle) + '" target="_blank" rel="noopener noreferrer" class="social-chip is-telegram" title="Send via Telegram">' +
                '<svg class="social-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.56 8.16l-1.97 9.28c-.15.66-.54.82-1.09.51l-3.03-2.24-1.46 1.41c-.16.16-.3.3-.61.3l.22-3.1 5.64-5.1c.25-.22-.05-.34-.38-.12L8.9 13.37l-3-.94c-.66-.21-.67-.66.14-.98l11.7-4.51c.54-.2 1.01.12.82.22z"/></svg>' +
                '<span>Telegram</span>' +
              '</a>' +
              '<a href="mailto:?subject=' + encodeURIComponent('Campus Discussion: ' + authorName + ' on UGNAYRA') + '&body=' + encodeURIComponent('Check out this campus update on UGNAYRA:\n\n' + permalink) + '" class="social-chip is-email" title="Share via Email">' +
                '<i data-lucide="mail" class="icon-xs"></i><span>Email</span>' +
              '</a>' +
            '</div>' +
          '</div>' +

          '<!-- Repost Divider -->' +
          '<div class="share-divider">' +
            '<span>OR REPOST TO CAMPUS FEED</span>' +
          '</div>' +

          '<!-- Campus Repost Section -->' +
          '<div class="share-repost-section">' +
            '<div class="share-quoted-preview">' +
              '<div class="share-quoted-header">' +
                authorAvatarHtml +
                '<div class="share-quoted-meta">' +
                  '<div class="flex items-center gap-1 flex-wrap">' +
                    '<span class="share-quoted-name">' + fmt.escapeHtml(authorName) + '</span>' +
                    authorRoleBadge +
                    (authorHandle ? '<span class="text-xs-muted">' + fmt.escapeHtml(authorHandle) + '</span>' : '') +
                  '</div>' +
                  '<span class="text-xs-muted">' + fmt.escapeHtml(postTime) + '</span>' +
                '</div>' +
              '</div>' +
              (rawContent ? '<p class="share-quoted-text">' + fmt.escapeHtml(rawContent.length > 200 ? rawContent.substring(0, 200) + '...' : rawContent) + '</p>' : '') +
            '</div>' +

            '<form id="share-post-form" novalidate class="mt-3">' +
              '<div class="form-group mb-0">' +
                '<div class="flex items-center justify-between mb-1">' +
                  '<label class="form-label mb-0" for="share-post-comment">Add your thoughts <span class="form-label-optional">Optional</span></label>' +
                  '<span class="text-xs-muted tabular-nums" id="share-comment-counter">0 / 2000</span>' +
                '</div>' +
                '<textarea id="share-post-comment" name="content" class="form-textarea" rows="2" maxlength="2000" ' +
                  'placeholder="Why is this relevant to your classmates or department?"></textarea>' +
              '</div>' +
            '</form>' +
          '</div>' +
        '</div>',
      footerHtml:
        '<button type="button" class="btn btn-secondary js-close-modal">Cancel</button>' +
        '<button type="button" class="btn btn-primary" id="confirm-share-post-btn">' +
          '<i data-lucide="repeat-2" class="icon-sm"></i><span>Repost to Feed</span>' +
        '</button>'
    });

    $modal.on('click', '#confirm-share-post-btn', function () {
      var $btn = $(this);
      var note = ($modal.find('#share-post-comment').val() || '').trim();
      UI.setButtonLoading($btn, true, 'Reposting...');
      Services.Posts.share(postId, { content: note })
        .then(function (res) {
          var $sCount = $card.find('.js-shares-count');
          $sCount.text((parseInt($sCount.text(), 10) || 0) + 1);
          UI.closeModal();
          UI.toast('Reposted to the campus feed.', 'success');
          if (res.data && res.data.post && window.UgnayraFeedModule) {
            window.UgnayraFeedModule.prependPostIfVisible(res.data.post);
          }
        })
        .catch(function (err) {
          UI.toast(err.message || 'Unable to share post.', 'error');
        })
        .finally(function () {
          UI.setButtonLoading($btn, false);
        });
    });
  });

  window.UgnayraPostCard = {
    render: renderPostCard,
    renderCommentItem: renderCommentItem
  };
})(window, window.jQuery);
