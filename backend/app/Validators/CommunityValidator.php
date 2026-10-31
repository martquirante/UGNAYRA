<?php

declare(strict_types=1);

namespace App\Validators;

class CommunityValidator extends Validator
{
    public function validateCreate(array $data): bool
    {
        return $this->validate($data, [
            'name' => 'required|min:3|max:120',
            'category' => 'required|in:academic,department,organization,study_group,campus_life',
            'description' => 'required|min:5|max:1000',
            'privacy' => 'in:public,restricted',
        ]);
    }

    public function validateUpdate(array $data): bool
    {
        return $this->validate($data, [
            'name' => 'min:3|max:120',
            'category' => 'in:academic,department,organization,study_group,campus_life',
            'description' => 'min:5|max:1000',
            'privacy' => 'in:public,restricted',
        ]);
    }
}
