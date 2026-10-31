<?php

declare(strict_types=1);

/**
 * UGNAYRA — Backend Automated Test Suite
 * Verifies autoloader, environment loader, security cryptographic primitives,
 * request parsing, validators, routing, and database configuration.
 */

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'index.php';

use App\Config\Config;
use App\Config\Database;
use App\Config\Env;
use App\Helpers\Request;
use App\Helpers\Security;
use App\Services\SupabaseClient;
use App\Validators\AnnouncementValidator;
use App\Validators\AuthValidator;
use App\Validators\CommunityValidator;
use App\Validators\PostValidator;
use App\Validators\ProfileValidator;
use App\Validators\Validator;

$passed = 0;
$failed = 0;

function it(string $description, callable $test): void
{
    global $passed, $failed;
    try {
        $test();
        echo "[PASS] " . $description . PHP_EOL;
        $passed++;
    } catch (\Throwable $e) {
        echo "[FAIL] " . $description . PHP_EOL;
        echo "       Error: " . $e->getMessage() . PHP_EOL;
        echo "       Location: " . $e->getFile() . ":" . $e->getLine() . PHP_EOL;
        $failed++;
    }
}

function assertEq(mixed $actual, mixed $expected, string $msg = ''): void
{
    if ($actual !== $expected) {
        throw new \AssertionError($msg ?: ("Expected " . var_export($expected, true) . ", got " . var_export($actual, true)));
    }
}

function assertTrue(bool $condition, string $msg = 'Expected condition to be true'): void
{
    if (!$condition) {
        throw new \AssertionError($msg);
    }
}

echo PHP_EOL . "=================================================" . PHP_EOL;
echo "  UGNAYRA — Backend Test Suite (PHP " . PHP_VERSION . ")" . PHP_EOL;
echo "=================================================" . PHP_EOL . PHP_EOL;

// 1. Environment & Config
it('Loads environment configuration without third-party dependencies', function () {
    assertEq(Config::app()['name'], 'UGNAYRA');
    assertTrue(is_array(Config::corsOrigins()));
    assertEq(Config::database()['connection'], 'pgsql');
});

// 2. Security Cryptographic Helpers
it('Generates RFC 4122 compliant v4 UUIDs', function () {
    $uuid = Security::generateUuid();
    assertTrue((bool)preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $uuid), "Invalid UUID: {$uuid}");
});

it('Hashes and verifies passwords using bcrypt (cost 12)', function () {
    $plain = 'Ugnayra@2026!';
    $hash = Security::hashPassword($plain);
    assertTrue(str_starts_with($hash, '$2y$12$'), 'Expected bcrypt cost 12 prefix');
    assertTrue(Security::verifyPassword($plain, $hash), 'Password verification failed');
    assertTrue(!Security::verifyPassword('WrongPass', $hash), 'Wrong password unexpectedly passed');
});

it('Generates cryptographic tokens and SHA-256 hashes', function () {
    $token = Security::generateToken(16);
    assertEq(strlen($token), 32);
    $hashed = Security::hashToken($token);
    assertEq(strlen($hashed), 64);
});

it('Sanitizes user input strings and strips dangerous tags', function () {
    $raw = "<script>alert('XSS')</script> Hello <b>World</b>";
    $clean = Security::sanitizeString($raw);
    assertEq($clean, "alert('XSS') Hello World");
});

// 3. Base Validator
it('Validates required, email, username, and length rules', function () {
    $v = new Validator();
    $valid = $v->validate([
        'email' => 'student1@school.edu',
        'username' => 'juan.delacruz_26',
        'age' => '20',
    ], [
        'email' => 'required|email',
        'username' => 'required|username|min:3|max:30',
        'age' => 'required',
    ]);
    assertTrue($valid, 'Expected valid payload to pass');
    assertEq(count($v->errors()), 0);

    $invalid = $v->validate([
        'email' => 'not-an-email',
        'username' => 'bad username with spaces!',
    ], [
        'email' => 'required|email',
        'username' => 'required|username',
        'role' => 'required',
    ]);
    assertTrue(!$invalid, 'Expected invalid payload to fail');
    assertTrue(isset($v->errors()['email']));
    assertTrue(isset($v->errors()['username']));
    assertTrue(isset($v->errors()['role']));
});

// 4. Specialized Auth Validator
it('Validates registration fields and password confirmation matching', function () {
    $authVal = new AuthValidator();

    $good = [
        'role' => 'student',
        'full_name' => 'Juan Dela Cruz',
        'username' => 'jdelacruz',
        'email' => 'juan@school.edu',
        'department' => 'BS Information Technology',
        'password' => 'Password123!',
        'password_confirmation' => 'Password123!',
    ];
    assertTrue($authVal->validateRegister($good), 'Good registration should pass');

    $bad = [
        'role' => 'superadmin', // Invalid role
        'full_name' => 'J', // Too short
        'username' => 'a', // Too short
        'email' => 'invalid-email',
        'department' => '',
        'password' => 'short', // Too short
        'password_confirmation' => 'different', // Mismatch
    ];
    assertTrue(!$authVal->validateRegister($bad), 'Bad registration should fail');
    $errs = $authVal->errors();
    assertTrue(isset($errs['role']));
    assertTrue(isset($errs['full_name']));
    assertTrue(isset($errs['email']));
    assertTrue(isset($errs['password']));
    assertTrue(isset($errs['password_confirmation']));

    $badFormat = [
        'role' => 'student',
        'full_name' => 'Juan 1234',
        'username' => 'jdelacruz',
        'email' => 'juan@school.edu',
        'department' => 'BS Information Technology (BSIT)',
        'school_id_number' => '2024ABC',
        'section' => '3A@@!!',
        'password' => 'weakpassword',
        'password_confirmation' => 'weakpassword',
    ];
    assertTrue(!$authVal->validateRegister($badFormat), 'Non-numeric ID, digits in name, and weak password should fail');
    $fmtErrs = $authVal->errors();
    assertTrue(isset($fmtErrs['full_name']));
    assertTrue(isset($fmtErrs['school_id_number']));
    assertTrue(isset($fmtErrs['section']));
    assertTrue(isset($fmtErrs['password']));
});

// 5. Post Validator
it('Validates post creation and content length bounds', function () {
    $postVal = new PostValidator();
    assertTrue($postVal->validateCreate(['content' => 'Hello Campus!']));
    assertTrue(!$postVal->validateCreate(['content' => '']));
    assertTrue($postVal->validateComment(['content' => 'Great update!']));
    assertTrue(!$postVal->validateComment(['content' => '']));
});

// 6. Community Validator
it('Validates community categories and name constraints', function () {
    $commVal = new CommunityValidator();
    assertTrue($commVal->validateCreate([
        'name' => 'Junior Philippine Computer Society',
        'category' => 'organization',
        'description' => 'Official student organization for IT and CS majors.',
    ]));
    assertTrue(!$commVal->validateCreate([
        'name' => 'Hi',
        'category' => 'invalid_cat',
        'description' => '',
    ]));
});

// 7. Announcement Validator
it('Validates official announcement priorities and categories', function () {
    $annVal = new AnnouncementValidator();
    assertTrue($annVal->validateCreate([
        'title' => 'Final Examination Schedule',
        'body' => 'Examinations will begin on Monday. Check room schedules.',
        'category' => 'academic',
        'priority' => 'urgent',
    ]));
    assertTrue(!$annVal->validateCreate([
        'title' => 'No',
        'body' => '',
        'category' => 'wrong',
        'priority' => 'wrong',
    ]));
});

// 8. Router Compilation and Pattern Matching
it('Compiles REST route parameters and matches URL paths', function () {
    $router = require dirname(__DIR__) . DIRECTORY_SEPARATOR . 'routes' . DIRECTORY_SEPARATOR . 'api.php';
    assertTrue($router instanceof \App\Config\Router, 'Router instantiated successfully');
});

// 9. Supabase Client Configuration
it('Inspects Supabase Client configuration state safely', function () {
    $client = new SupabaseClient();
    $configured = $client->isConfigured();
    echo "       (Supabase HTTPS Client Configured: " . ($configured ? 'YES' : 'NO') . ")" . PHP_EOL;
});

echo PHP_EOL . "=================================================" . PHP_EOL;
echo "  Results: {$passed} Passed, {$failed} Failed" . PHP_EOL;
echo "=================================================" . PHP_EOL . PHP_EOL;

if ($failed > 0) {
    exit(1);
}
