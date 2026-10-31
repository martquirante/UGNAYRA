<?php

declare(strict_types=1);

namespace App\Validators;

class ProfileValidator extends Validator
{
    public function validateUpdateMe(array $data): bool
    {
        return $this->validate($data, [
            'full_name' => 'min:2|max:120',
            'department' => 'min:2|max:120',
            'year_or_grade' => 'max:40',
            'section' => 'max:40',
            'bio' => 'max:500',
        ]);
    }
}
