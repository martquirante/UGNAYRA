<?php

declare(strict_types=1);

use App\Models\User;

if (!class_exists(User::class)) {
    spl_autoload_register(function (string $class): void {
        $prefix = 'App\\';
        $baseDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'app' . DIRECTORY_SEPARATOR;
        if (strncmp($prefix, $class, strlen($prefix)) !== 0) {
            return;
        }
        $file = $baseDir . str_replace('\\', DIRECTORY_SEPARATOR, substr($class, strlen($prefix))) . '.php';
        if (file_exists($file)) {
            require_once $file;
        }
    });
}

\App\Config\Env::load(dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env');

if (\App\Config\Env::get('SEED_DEMO_ACCOUNTS', true) !== true) {
    return;
}

if (defined('UGNAYRA_DEMO_ACCOUNTS_SEEDED')) {
    return;
}
define('UGNAYRA_DEMO_ACCOUNTS_SEEDED', true);

$accounts = [
    ['admin.ugnayra@bulsu.edu.ph', 'bulsu_admin', 'Engr. Ernesto M. Santos', 'personnel', 'EMP-2015-0891'],
    ['prof.delacruz@bulsu.edu.ph', 'prof_delacruz', 'Prof. Maria Elena Dela Cruz', 'teacher', 'FAC-2018-0412'],
    ['sir.ramirez@bulsu.edu.ph', 'sir_ramirez', 'Engr. Arnel Ramirez', 'teacher', 'FAC-2019-0523'],
    ['raymart.student@bulsu.edu.ph', 'raymart_q', 'Raymart Quirante', 'student', '2022-108921'],
    ['juan.luna@bulsu.edu.ph', 'juan_luna', 'Juan D. Luna', 'student', '2022-104412'],
    ['bea.reyes@bulsu.edu.ph', 'bea_reyes', 'Bea Bianca Reyes', 'student', '2022-109934'],
];

foreach ($accounts as [$email, $username, $fullName, $role, $schoolId]) {
    try {
        $existing = User::findByIdentifier($email);
        $data = [
            'email' => $email,
            'username' => $username,
            'password' => 'Password123!',
            'full_name' => $fullName,
            'role' => $role,
            'is_active' => true,
            'school_id_number' => $schoolId,
            'department' => $role === 'student' ? 'CICT' : ($role === 'teacher' ? 'CICT' : 'ADMIN'),
            'year_or_grade' => $role === 'student' ? '3rd Year' : 'Faculty',
            'section' => $role === 'student' ? 'BSIT 3A' : 'Staff',
        ];

        if ($existing === null) {
            User::create($data);
        } else {
            User::update($existing['id'], [
                'username' => $username,
                'password_hash' => password_hash($data['password'], PASSWORD_BCRYPT),
                'full_name' => $fullName,
                'role' => $role,
                'is_active' => true,
                'school_id_number' => $schoolId,
                'department' => $data['department'],
                'year_or_grade' => $data['year_or_grade'],
                'section' => $data['section'],
            ]);
        }
    } catch (Throwable $e) {
        error_log('UGNAYRA demo account seed failed for ' . $email . ': ' . $e->getMessage());
    }
}
