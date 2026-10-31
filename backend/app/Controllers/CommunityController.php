<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JsonResponse;
use App\Helpers\Request;
use App\Models\Community;
use App\Models\Post;
use App\Validators\CommunityValidator;
use App\Validators\PostValidator;

class CommunityController
{
    private CommunityValidator $validator;
    private PostValidator $postValidator;

    public function __construct()
    {
        $this->validator = new CommunityValidator();
        $this->postValidator = new PostValidator();
    }

    public function index(Request $request): void
    {
        $user = $request->getUser();
        $filter = (string)$request->query('filter', 'all');
        $limit = min(50, max(1, (int)$request->query('limit', 30)));

        $list = Community::listCommunities($user['id'] ?? null, $filter, $limit);
        JsonResponse::success(['items' => $list], 'Communities retrieved.');
    }

    public function store(Request $request): void
    {
        $user = $request->getUser();
        $body = $request->all();

        if (!$this->validator->validateCreate($body)) {
            JsonResponse::validationError($this->validator->errors());
            return;
        }

        $body['created_by'] = $user['id'];
        $comm = Community::create($body);

        if ($comm === null) {
            JsonResponse::error('INTERNAL_ERROR', 'Could not create community.', 500);
            return;
        }

        JsonResponse::success(['community' => $comm], 'Community established!', 201);
    }

    public function show(Request $request): void
    {
        $idOrSlug = (string)$request->param('idOrSlug');
        $user = $request->getUser();

        $comm = Community::findBySlugOrId($idOrSlug, $user['id'] ?? null);
        if ($comm === null) {
            JsonResponse::error('NOT_FOUND', 'Community not found.', 404);
            return;
        }

        JsonResponse::success(['community' => $comm], 'Community retrieved.');
    }

    public function join(Request $request): void
    {
        $id = (string)$request->param('id');
        $user = $request->getUser();

        Community::join($id, $user['id'], 'member');
        $comm = Community::findBySlugOrId($id, $user['id']);

        JsonResponse::success(['community' => $comm], 'Joined community successfully.');
    }

    public function leave(Request $request): void
    {
        $id = (string)$request->param('id');
        $user = $request->getUser();

        Community::leave($id, $user['id']);
        $comm = Community::findBySlugOrId($id, $user['id']);

        JsonResponse::success(['community' => $comm], 'Left community.');
    }

    public function members(Request $request): void
    {
        $id = (string)$request->param('id');
        $limit = min(50, max(1, (int)$request->query('limit', 30)));

        $members = Community::listMembers($id, $limit);
        JsonResponse::success(['items' => $members], 'Community members retrieved.');
    }

    public function posts(Request $request): void
    {
        $commId = (string)$request->param('id');
        $user = $request->getUser();
        $cursor = $request->query('cursor');
        $limit = min(50, max(1, (int)$request->query('limit', 20)));

        $result = Post::listFeed($user['id'] ?? null, 'all', $cursor, $limit, $commId);

        JsonResponse::paginated(
            $result['items'],
            $result['has_more'],
            $result['next_cursor'],
            $limit,
            'Community posts retrieved.'
        );
    }

    public function storePost(Request $request): void
    {
        $commId = (string)$request->param('id');
        $user = $request->getUser();
        $body = $request->all();

        $body['community_id'] = $commId;
        $body['author_id'] = $user['id'];
        $body['visibility'] = 'community';

        // Auto join user if not yet joined
        Community::join($commId, $user['id'], 'member');

        $post = Post::create($body);
        if ($post === null) {
            JsonResponse::error('INTERNAL_ERROR', 'Could not publish to community.', 500);
            return;
        }

        JsonResponse::success(['post' => $post], 'Posted to community.', 201);
    }
}
