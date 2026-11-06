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

if (\App\Config\Env::get('SEED_DEMO_ACCOUNTS', false) !== true) {
    return;
}

if (defined('UGNAYRA_DEMO_ACCOUNTS_SEEDED')) {
    return;
}
define('UGNAYRA_DEMO_ACCOUNTS_SEEDED', true);

$accounts = [
    ['admin.ugnayra@bulsu.edu.ph', 'bulsu_admin', 'Engr. Ernesto M. Santos', 'personnel'],
    ['prof.delacruz@bulsu.edu.ph', 'prof_delacruz', 'Prof. Maria Elena Dela Cruz', 'teacher'],
    ['sir.ramirez@bulsu.edu.ph', 'sir_ramirez', 'Engr. Arnel Ramirez', 'teacher'],
    ['raymart.student@bulsu.edu.ph', 'raymart_q', 'Raymart Quirante', 'student'],
    ['juan.luna@bulsu.edu.ph', 'juan_luna', 'Juan D. Luna', 'student'],
    ['bea.reyes@bulsu.edu.ph', 'bea_reyes', 'Bea Bianca Reyes', 'student'],
];

foreach ($accounts as [$email, $username, $fullName, $role]) {
    try {
        $existing = User::findByIdentifier($email);
        $data = [
            'email' => $email,
            'username' => $username,
            'password' => 'Password123!',
            'full_name' => $fullName,
            'role' => $role,
            'is_active' => true,
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
            ]);
        }
    } catch (Throwable $e) {
        error_log('UGNAYRA demo account seed failed for ' . $email . ': ' . $e->getMessage());
    }
}
