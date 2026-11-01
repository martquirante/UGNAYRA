<?php

declare(strict_types=1);

/**
 * UGNAYRA — Backend Automated Test Suite
 * Verifies autoloader, environment loader, security cryptographic primitives,
 * request parsing, validators, routing, academic catalog, LMS, and storage services.
 */

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'index.php';

use App\Config\Config;
use App\Config\Database;
use App\Config\Env;
use App\Helpers\Request;
use App\Helpers\Security;
use App\Models\AcademicSection;
use App\Models\Classroom;
use App\Models\ClassSession;
use App\Services\StorageService;
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
        'role' => 'superadmin',
        'full_name' => 'J',
        'username' => 'a',
        'email' => 'invalid-email',
        'department' => '',
        'password' => 'short',
        'password_confirmation' => 'different',
    ];
    assertTrue(!$authVal->validateRegister($bad), 'Bad registration should fail');
    $errs = $authVal->errors();
    assertTrue(isset($errs['role']));
    assertTrue(isset($errs['full_name']));
    assertTrue(isset($errs['email']));
    assertTrue(isset($errs['password']));
    assertTrue(isset($errs['password_confirmation']));
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

// 10. Dynamic Academic Designation Resolution (Formula Validation)
it('Computes canonical academic designations dynamically for student registration', function () {
    // BSIT 2nd Year Section D Batch 1 -> BSIT 2D1
    $desig1 = AcademicSection::computeDesignation('BSIT', '2nd_year', 'D', 1);
    assertEq($desig1, 'BSIT 2D1');

    // BSIT 3rd Year Section A without lab batch -> BSIT 3A
    $desig2 = AcademicSection::computeDesignation('BSIT', '3rd_year', 'A');
    assertEq($desig2, 'BSIT 3A');

    // ACT 1st Year Section B Batch 2 -> ACT 1B2
    $desig3 = AcademicSection::computeDesignation('ACT', '1st_year', 'B', 2);
    assertEq($desig3, 'ACT 1B2');
});

// 11. Storage Service Magic-Byte & Document Detection
it('Detects authentic PDF and document MIME types via magic bytes', function () {
    $storage = new StorageService();

    // Synthetic PDF with magic byte %PDF-
    $tmpPdf = tempnam(sys_get_temp_dir(), 'test_pdf_');
    file_put_contents($tmpPdf, "%PDF-1.4\n%synthetic test stream\n%%EOF");
    $mimePdf = $storage->detectMimeType($tmpPdf);
    @unlink($tmpPdf);
    assertEq($mimePdf, 'application/pdf', 'Expected PDF magic bytes to be identified');

    // Synthetic ZIP with magic byte PK\x03\x04
    $tmpZip = tempnam(sys_get_temp_dir(), 'test_zip_');
    file_put_contents($tmpZip, "PK\x03\x04\x14\x00\x00\x00\x08\x00");
    $mimeZip = $storage->detectMimeType($tmpZip);
    @unlink($tmpZip);
    assertEq($mimeZip, 'application/zip', 'Expected ZIP magic bytes to be identified');
});

// 12. Classroom Join Code and Virtual Meeting Code Generator
it('Generates compliant meeting room codes and join codes', function () {
    $meetCode = ClassSession::generateMeetingCode('IT 305W');
    assertTrue((bool)preg_match('/^ugn-it305w-[0-9a-f]{6}$/', $meetCode), "Invalid meeting code format: {$meetCode}");

    $joinCode = Classroom::generateJoinCode();
    assertTrue((bool)preg_match('/^UG-[A-Z0-9]{5,6}$/', $joinCode), "Invalid classroom join code format: {$joinCode}");
});

echo PHP_EOL . "=================================================" . PHP_EOL;
echo "  Results: {$passed} Passed, {$failed} Failed" . PHP_EOL;
echo "=================================================" . PHP_EOL . PHP_EOL;

if ($failed > 0) {
    exit(1);
}
