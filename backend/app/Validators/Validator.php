<?php

declare(strict_types=1);

namespace App\Validators;

/**
 * UGNAYRA — Robust Server-Side Form & Payload Validator
 */
class Validator
{
    protected array $errors = [];

    public function validate(array $data, array $rules): bool
    {
        $this->errors = [];

        foreach ($rules as $field => $fieldRules) {
            $value = $data[$field] ?? null;
            $ruleList = is_string($fieldRules) ? explode('|', $fieldRules) : $fieldRules;

            foreach ($ruleList as $rule) {
                $ruleName = $rule;
                $ruleParam = null;

                if (str_contains($rule, ':')) {
                    [$ruleName, $ruleParam] = explode(':', $rule, 2);
                }

                $this->applyRule($field, $value, $ruleName, $ruleParam, $data);
            }
        }

        return empty($this->errors);
    }

    public function errors(): array
    {
        return $this->errors;
    }

    protected function addError(string $field, string $message): void
    {
        if (!isset($this->errors[$field])) {
            $this->errors[$field] = [];
        }
        $this->errors[$field][] = $message;
    }

    protected function applyRule(string $field, mixed $val, string $rule, ?string $param, array $allData): void
    {
        $label = ucwords(str_replace('_', ' ', $field));

        switch ($rule) {
            case 'required':
                if ($val === null || (is_string($val) && trim($val) === '') || (is_array($val) && empty($val))) {
                    $this->addError($field, "{$label} is required.");
                }
                break;

            case 'email':
                if (!empty($val) && !filter_var($val, FILTER_VALIDATE_EMAIL)) {
                    $this->addError($field, "Please enter a valid school email address.");
                }
                break;

            case 'username':
                if (!empty($val) && !preg_match('/^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{1,28}[a-zA-Z0-9])?$/', (string)$val)) {
                    $this->addError($field, "Username must be 3-30 characters using letters, numbers, dots, underscores, or hyphens.");
                }
                break;

            case 'person_name':
                if (!empty($val) && !preg_match('/^[\p{L}][\p{L}\s.\'-]{1,119}$/u', trim((string)$val))) {
                    $this->addError($field, "{$label} must contain letters only (no numbers or special symbols).");
                }
                break;

            case 'digits_only':
                if ($val !== null && trim((string)$val) !== '') {
                    $cleanDigits = trim((string)$val);
                    $bounds = $param ? explode(',', $param) : ['6', '12'];
                    $minD = (int)($bounds[0] ?? 6);
                    $maxD = (int)($bounds[1] ?? 12);
                    if (!preg_match('/^[0-9]+$/', $cleanDigits)) {
                        $this->addError($field, "{$label} must contain numbers only (0-9).");
                    } elseif (strlen($cleanDigits) < $minD || strlen($cleanDigits) > $maxD) {
                        $this->addError($field, "{$label} must be {$minD} to {$maxD} digits.");
                    }
                }
                break;

            case 'section_code':
                if ($val !== null && trim((string)$val) !== '') {
                    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9\s\/-]{0,39}$/', trim((string)$val))) {
                        $this->addError($field, "{$label} may only contain letters, numbers, spaces, and hyphens.");
                    }
                }
                break;

            case 'strong_password':
                if (!empty($val)) {
                    $pw = (string)$val;
                    if (
                        strlen($pw) < 8 ||
                        !preg_match('/[A-Z]/', $pw) ||
                        !preg_match('/[a-z]/', $pw) ||
                        !preg_match('/[0-9]/', $pw) ||
                        !preg_match('/[^A-Za-z0-9]/', $pw)
                    ) {
                        $this->addError(
                            $field,
                            "Password must have at least 8 characters, uppercase, lowercase, a number, and a special character."
                        );
                    }
                }
                break;

            case 'min':
                $min = (int)$param;
                if (!empty($val) && self::strLength((string)$val) < $min) {
                    $this->addError($field, "{$label} must be at least {$min} characters.");
                }
                break;

            case 'max':
                $max = (int)$param;
                if (!empty($val) && self::strLength((string)$val) > $max) {
                    $this->addError($field, "{$label} cannot exceed {$max} characters.");
                }
                break;

            case 'in':
                $allowed = array_map('trim', explode(',', (string)$param));
                if (!empty($val) && !in_array((string)$val, $allowed, true)) {
                    $this->addError($field, "Invalid {$label} selected.");
                }
                break;

            case 'matches':
                $otherVal = $allData[$param] ?? null;
                if ($val !== $otherVal) {
                    $this->addError($field, "{$label} does not match.");
                }
                break;

            case 'uuid':
                if (!empty($val) && !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', (string)$val)) {
                    $this->addError($field, "Invalid ID format.");
                }
                break;
        }
    }

    private static function strLength(string $value): int
    {
        if (function_exists('mb_strlen')) {
            return mb_strlen($value, 'UTF-8');
        }
        $uChars = preg_match_all('/./us', $value);
        return $uChars !== false ? $uChars : strlen($value);
    }
}
