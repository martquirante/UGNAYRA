<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Models\Comment;
use App\Models\Post;
use App\Services\NotificationService;
use App\Services\StorageService;
use App\Validators\PostValidator;
use App\Validators\UploadValidator;

class PostController
{
    private PostValidator $validator;
    private UploadValidator $uploadValidator;
    private StorageService $storage;

    public function __construct()
    {
        $this->validator = new PostValidator();
        $this->uploadValidator = new UploadValidator();
        $this->storage = new StorageService();
    }

    public function index(Request $request): void
    {
        $user = $request->getUser();
        $filter = (string)$request->query('filter', 'all');
        $cursor = $request->query('cursor');
        $limit = min(50, max(1, (int)$request->query('limit', 20)));
        $commId = $request->query('community_id');

        $result = Post::listFeed($user['id'] ?? null, $filter, $cursor, $limit, $commId);

        JsonResponse::paginated(
            $result['items'],
            $result['has_more'],
            $result['next_cursor'],
            $limit,
            'Campus feed retrieved.'
        );
    }

    public function store(Request $request): void
    {
        $user = $request->getUser();
        $body = $request->all();

        // Process any uploaded images (single or multiple)
        $uploadedImages = [];
        if (isset($_FILES['images']) && is_array($_FILES['images']['name'])) {
            $count = count($_FILES['images']['name']);
            for ($i = 0; $i < $count; $i++) {
                if (($_FILES['images']['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
                    $fileInfo = [
                        'name' => $_FILES['images']['name'][$i],
                        'type' => $_FILES['images']['type'][$i],
                        'tmp_name' => $_FILES['images']['tmp_name'][$i],
                        'error' => $_FILES['images']['error'][$i],
                        'size' => $_FILES['images']['size'][$i],
                    ];
                    $url = $this->storage->storeUploadedFile($fileInfo, 'posts');
                    if ($url !== null) {
                        $uploadedImages[] = $url;
                    }
                }
            }
        } elseif (isset($_FILES['image']) && ($_FILES['image']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
            $url = $this->storage->storeUploadedFile($_FILES['image'], 'posts');
            if ($url !== null) {
                $uploadedImages[] = $url;
            }
        }

        // If client already provided image URLs in JSON body
        if (!empty($body['images']) && is_array($body['images'])) {
            $uploadedImages = array_merge($uploadedImages, $body['images']);
        }

        $body['author_id'] = $user['id'];
        $body['images'] = $uploadedImages;

        // Content or images must be present
        if (empty(trim((string)($body['content'] ?? ''))) && empty($uploadedImages) && empty($body['shared_post_id'])) {
            JsonResponse::validationError(['content' => ['Post must contain text, an image, or a shared post.']]);
            return;
        }

        if (!$this->validator->validateCreate($body)) {
            JsonResponse::validationError($this->validator->errors());
            return;
        }

        $post = Post::create($body);
        if ($post === null) {
            JsonResponse::error('INTERNAL_ERROR', 'Could not publish post.', 500);
            return;
        }

        JsonResponse::success(['post' => $post], 'Post published successfully.', 201);
    }

    public function show(Request $request): void
    {
        $id = (string)$request->param('id');
        $user = $request->getUser();

        $post = Post::findById($id, $user['id'] ?? null);
        if ($post === null) {
            JsonResponse::error('NOT_FOUND', 'Post not found.', 404);
            return;
        }

        JsonResponse::success(['post' => $post], 'Post retrieved.');
    }

    public function update(Request $request): void
    {
        $id = (string)$request->param('id');
        $user = $request->getUser();
        $body = $request->all();

        $post = Post::findById($id, $user['id']);
        if ($post === null) {
            JsonResponse::error('NOT_FOUND', 'Post not found.', 404);
            return;
        }

        // Only author can edit post
        if ($post['author']['id'] !== $user['id']) {
            JsonResponse::error('FORBIDDEN', 'You do not have permission to edit this post.', 403);
            return;
        }

        if (!$this->validator->validateUpdate($body)) {
            JsonResponse::validationError($this->validator->errors());
            return;
        }

        Post::update($id, (string)$body['content']);
        $updated = Post::findById($id, $user['id']);

        JsonResponse::success(['post' => $updated], 'Post updated.');
    }

    public function destroy(Request $request): void
    {
        $id = (string)$request->param('id');
        $user = $request->getUser();

        $post = Post::findById($id, $user['id']);
        if ($post === null) {
            JsonResponse::error('NOT_FOUND', 'Post not found.', 404);
            return;
        }

        // Author or authorized personnel can delete
        $canDelete = ($post['author']['id'] === $user['id']) || ($user['role'] === 'personnel');
        if (!$canDelete) {
            JsonResponse::error('FORBIDDEN', 'You cannot delete this post.', 403);
            return;
        }

        Post::delete($id);
        JsonResponse::success(null, 'Post deleted successfully.');
    }

    public function like(Request $request): void
    {
        $id = (string)$request->param('id');
        $user = $request->getUser();

        $result = Post::toggleLike($id, $user['id']);
        if ($result['is_liked']) {
            NotificationService::notifyLike($id, $user['id']);
        }

        JsonResponse::success($result, $result['is_liked'] ? 'Post liked.' : 'Like removed.');
    }

    public function unlike(Request $request): void
    {
        $this->like($request);
    }

    public function share(Request $request): void
    {
        $originalId = (string)$request->param('id');
        $user = $request->getUser();
        $body = $request->all();

        $orig = Post::findById($originalId, $user['id']);
        if ($orig === null) {
            JsonResponse::error('NOT_FOUND', 'Original post not found.', 404);
            return;
        }

        $post = Post::create([
            'author_id' => $user['id'],
            'shared_post_id' => $originalId,
            'content' => $body['commentary'] ?? '',
            'visibility' => 'campus',
        ]);

        JsonResponse::success(['post' => $post], 'Post shared to your campus feed.', 201);
    }

    public function comments(Request $request): void
    {
        $id = (string)$request->param('id');
        $limit = min(100, max(1, (int)$request->query('limit', 50)));

        $comments = Comment::listForPost($id, $limit);
        JsonResponse::success(['items' => $comments], 'Comments retrieved.');
    }

    public function storeComment(Request $request): void
    {
        $postId = (string)$request->param('id');
        $user = $request->getUser();
        $body = $request->all();

        $body['post_id'] = $postId;
        $body['author_id'] = $user['id'];

        if (!$this->validator->validateComment($body)) {
            JsonResponse::validationError($this->validator->errors());
            return;
        }

        $comment = Comment::create($body);
        if ($comment === null) {
            JsonResponse::error('INTERNAL_ERROR', 'Could not submit comment.', 500);
            return;
        }

        NotificationService::notifyComment($postId, $user['id'], (string)$body['content']);

        JsonResponse::success(['comment' => $comment], 'Comment posted successfully.', 201);
    }

    public function destroyComment(Request $request): void
    {
        $commentId = (string)$request->param('commentId');
        $user = $request->getUser();

        $comment = Comment::findById($commentId);
        if ($comment === null) {
            JsonResponse::error('NOT_FOUND', 'Comment not found.', 404);
            return;
        }

        $canDelete = ($comment['author_id'] === $user['id']) || ($user['role'] === 'personnel');
        if (!$canDelete) {
            JsonResponse::error('FORBIDDEN', 'You cannot delete this comment.', 403);
            return;
        }

        Comment::delete($commentId);
        JsonResponse::success(null, 'Comment removed.');
    }
}
