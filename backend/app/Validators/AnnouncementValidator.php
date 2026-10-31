<?php

declare(strict_types=1);

namespace App\Validators;

class AnnouncementValidator extends Validator
{
    public function validateCreate(array $data): bool
    {
        return $this->validate($data, [
            'title' => 'required|min:4|max:180',
            'body' => 'required|min:10|max:10000',
            'category' => 'required|in:academic,campus_events,administrative,urgent_notice,student_affairs',
            'priority' => 'required|in:normal,important,urgent',
            'target_department' => 'max:120',
        ]);
    }

    public function validateUpdate(array $data): bool
    {
        return $this->validate($data, [
            'title' => 'min:4|max:180',
            'body' => 'min:10|max:10000',
            'category' => 'in:academic,campus_events,administrative,urgent_notice,student_affairs',
            'priority' => 'in:normal,important,urgent',
            'target_department' => 'max:120',
        ]);
    }
}
