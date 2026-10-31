<?php

declare(strict_types=1);

namespace App\Validators;

class PostValidator extends Validator
{
    public function validateCreate(array $data): bool
    {
        return $this->validate($data, [
            'content' => 'required|min:1|max:10000',
            'visibility' => 'in:campus,community',
            'community_id' => 'uuid',
            'shared_post_id' => 'uuid',
        ]);
    }

    public function validateUpdate(array $data): bool
    {
        return $this->validate($data, [
            'content' => 'required|min:1|max:10000',
        ]);
    }

    public function validateComment(array $data): bool
    {
        return $this->validate($data, [
            'content' => 'required|min:1|max:2000',
            'parent_comment_id' => 'uuid',
        ]);
    }

    public function validateShare(array $data): bool
    {
        return $this->validate($data, [
            'commentary' => 'max:3000',
        ]);
    }
}
