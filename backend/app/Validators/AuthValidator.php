<?php

declare(strict_types=1);

namespace App\Validators;

class AuthValidator extends Validator
{
    public function validateLogin(array $data): bool
    {
        return $this->validate($data, [
            'identifier' => 'required',
            'password' => 'required',
        ]);
    }

    public function validateRegister(array $data): bool
    {
        return $this->validate($data, [
            'role' => 'required|in:student,teacher,personnel',
            'full_name' => 'required|min:2|max:120|person_name',
            'username' => 'required|min:3|max:30|username',
            'email' => 'required|email|max:150',
            'department' => 'required|min:2|max:120',
            'year_or_grade' => 'max:40',
            'section' => 'max:40|section_code',
            'school_id_number' => 'digits_only:6,12',
            'password' => 'required|min:8|max:128|strong_password',
            'password_confirmation' => 'required|matches:password',
        ]);
    }

    public function validateGoogleOnboarding(array $data): bool
    {
        return $this->validate($data, [
            'onboarding_token' => 'required',
            'role' => 'required|in:student,teacher,personnel',
            'full_name' => 'required|min:2|max:120|person_name',
            'username' => 'required|min:3|max:30|username',
            'department' => 'required|min:2|max:120',
            'year_or_grade' => 'max:40',
            'section' => 'max:40|section_code',
            'school_id_number' => 'digits_only:6,12',
        ]);
    }
}
