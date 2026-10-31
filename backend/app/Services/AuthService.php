<?php

declare(strict_types=1);

namespace App\Services;

use App\Config\Config;
use App\Helpers\Security;
use App\Models\Notification;
use App\Models\Session;
use App\Models\User;

class AuthService
{
    public function login(string $identifier, string $password, string $ip, string $ua): array
    {
        $user = User::findByIdentifier($identifier);
        if ($user === null) {
            throw new \RuntimeException('Invalid credentials provided.');
        }

        if (!Security::verifyPassword($password, $user['password_hash'])) {
            throw new \RuntimeException('Invalid credentials provided.');
        }

        // Issue new session
        $session = Session::createSession($user['id'], $ip, $ua);
        $this->setSessionCookie($session['session_token']);

        // Update last seen
        User::update($user['id'], ['last_seen_at' => (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM)]);

        $unreadNotifs = Notification::getUnreadCount($user['id']);

        return [
            'user' => $this->sanitizeUser($user),
            'session_token' => $session['session_token'],
            'csrf_token' => $session['csrf_token'],
            'unread_notifications_count' => $unreadNotifs,
            'unread_messages_count' => 0,
        ];
    }

    public function register(array $data, string $ip, string $ua): array
    {
        // Check uniqueness of email and username
        $existing = User::findByIdentifier($data['email']);
        if ($existing !== null) {
            throw new \InvalidArgumentException('A campus account with this email address already exists.');
        }

        $existingUsername = User::findByUsername($data['username']);
        if ($existingUsername !== null) {
            throw new \InvalidArgumentException('This username is already taken. Please choose another.');
        }

        $user = User::create($data);
        if ($user === null) {
            throw new \RuntimeException('Unable to create user account.');
        }

        // Create session
        $session = Session::createSession($user['id'], $ip, $ua);
        $this->setSessionCookie($session['session_token']);

        return [
            'user' => $this->sanitizeUser($user),
            'session_token' => $session['session_token'],
            'csrf_token' => $session['csrf_token'],
            'unread_notifications_count' => 0,
            'unread_messages_count' => 0,
        ];
    }

    public function getProviderStatus(): array
    {
        $sbCfg = Config::supabase();
        $googleCfg = Config::google();
        $sb = new SupabaseClient();
        $settings = $sb->getAuthSettings();
        $sbGoogleEnabled = (bool)($settings['external']['google'] ?? false);

        $oauthUrl = (!empty($sbCfg['url']) && $sbGoogleEnabled)
            ? $sbCfg['url'] . '/auth/v1/authorize?provider=google'
            : '';

        $hasLiveProvider = $sbGoogleEnabled || !empty($googleCfg['client_id']);
        $isDev = Config::app()['env'] === 'development';

        return [
            'supabase_google_enabled' => $sbGoogleEnabled,
            'supabase_oauth_url' => $oauthUrl,
            'google_client_id' => $googleCfg['client_id'],
            'dev_google_bridge' => ($isDev && !$hasLiveProvider),
        ];
    }

    public function authenticateWithGoogle(array $payload, string $ip, string $ua): array
    {
        $identity = $this->verifyGoogleIdentity($payload, $ip);
        $email = strtolower(trim($identity['email']));
        $fullName = trim($identity['full_name']);
        $avatarUrl = !empty($identity['avatar_url']) ? trim((string)$identity['avatar_url']) : null;

        $existing = User::findByIdentifier($email);
        if ($existing !== null) {
            $updates = [
                'last_seen_at' => (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM),
            ];
            if (empty($existing['avatar_url']) && $avatarUrl !== null) {
                $updates['avatar_url'] = $avatarUrl;
                $existing['avatar_url'] = $avatarUrl;
            }
            User::update($existing['id'], $updates);

            $session = Session::createSession($existing['id'], $ip, $ua);
            $this->setSessionCookie($session['session_token']);
            $unreadNotifs = Notification::getUnreadCount($existing['id']);

            return [
                'needs_onboarding' => false,
                'user' => $this->sanitizeUser($existing),
                'session_token' => $session['session_token'],
                'csrf_token' => $session['csrf_token'],
                'unread_notifications_count' => $unreadNotifs,
                'unread_messages_count' => 0,
            ];
        }

        $suggestedUsername = $this->suggestAvailableUsername($email);
        $onboardingToken = $this->signOnboardingToken([
            'email' => $email,
            'full_name' => $fullName,
            'avatar_url' => $avatarUrl,
            'exp' => time() + 900,
        ]);

        return [
            'needs_onboarding' => true,
            'onboarding_token' => $onboardingToken,
            'google_profile' => [
                'email' => $email,
                'full_name' => $fullName,
                'suggested_username' => $suggestedUsername,
                'avatar_url' => $avatarUrl,
            ],
        ];
    }

    public function completeGoogleOnboarding(array $data, string $ip, string $ua): array
    {
        $claims = $this->verifyOnboardingToken((string)($data['onboarding_token'] ?? ''));
        $email = strtolower(trim((string)($claims['email'] ?? '')));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \RuntimeException('Your Google verification session expired. Please continue with Google again.');
        }

        $existingEmail = User::findByIdentifier($email);
        if ($existingEmail !== null) {
            $session = Session::createSession($existingEmail['id'], $ip, $ua);
            $this->setSessionCookie($session['session_token']);
            return [
                'user' => $this->sanitizeUser($existingEmail),
                'session_token' => $session['session_token'],
                'csrf_token' => $session['csrf_token'],
                'unread_notifications_count' => Notification::getUnreadCount($existingEmail['id']),
                'unread_messages_count' => 0,
            ];
        }

        $username = strtolower(trim((string)$data['username']));
        if (User::findByUsername($username) !== null) {
            throw new \InvalidArgumentException('This username is already taken. Please choose another.');
        }

        $user = User::create([
            'email' => $email,
            'username' => $username,
            'password' => Security::generateToken(24),
            'full_name' => trim((string)$data['full_name']),
            'role' => (string)$data['role'],
            'school_id_number' => !empty($data['school_id_number']) ? trim((string)$data['school_id_number']) : null,
            'department' => trim((string)$data['department']),
            'year_or_grade' => !empty($data['year_or_grade']) ? trim((string)$data['year_or_grade']) : null,
            'section' => !empty($data['section']) ? trim((string)$data['section']) : null,
            'avatar_url' => !empty($claims['avatar_url']) ? (string)$claims['avatar_url'] : null,
        ]);

        if ($user === null) {
            throw new \RuntimeException('Unable to complete campus profile registration.');
        }

        $session = Session::createSession($user['id'], $ip, $ua);
        $this->setSessionCookie($session['session_token']);

        return [
            'user' => $this->sanitizeUser($user),
            'session_token' => $session['session_token'],
            'csrf_token' => $session['csrf_token'],
            'unread_notifications_count' => 0,
            'unread_messages_count' => 0,
        ];
    }

    private function verifyGoogleIdentity(array $payload, string $ip): array
    {
        $sbToken = trim((string)($payload['supabase_access_token'] ?? ''));
        if ($sbToken !== '') {
            $sb = new SupabaseClient();
            $sbUser = $sb->verifyUserAccessToken($sbToken);
            if ($sbUser === null || empty($sbUser['email'])) {
                throw new \RuntimeException('Unable to verify Google session token.');
            }
            $meta = is_array($sbUser['user_metadata'] ?? null) ? $sbUser['user_metadata'] : [];
            $name = trim((string)($meta['full_name'] ?? $meta['name'] ?? ''));
            if ($name === '') {
                $name = ucwords(str_replace(['.', '_', '-'], ' ', explode('@', (string)$sbUser['email'])[0]));
            }
            return [
                'email' => (string)$sbUser['email'],
                'full_name' => $name,
                'avatar_url' => (string)($meta['avatar_url'] ?? $meta['picture'] ?? ''),
            ];
        }

        $googleIdToken = trim((string)($payload['google_id_token'] ?? $payload['credential'] ?? ''));
        if ($googleIdToken !== '') {
            $ch = curl_init('https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($googleIdToken));
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 10,
                CURLOPT_SSL_VERIFYPEER => (Config::app()['env'] === 'production'),
            ]);
            $res = curl_exec($ch);
            $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            unset($ch);

            $info = ($status === 200) ? json_decode((string)$res, true) : null;
            if (!is_array($info) || empty($info['email']) || ($info['email_verified'] ?? '') !== 'true') {
                throw new \RuntimeException('Invalid or unverified Google ID token.');
            }
            $expectedAud = Config::google()['client_id'];
            if ($expectedAud !== '' && ($info['aud'] ?? '') !== $expectedAud) {
                throw new \RuntimeException('Google token client audience mismatch.');
            }
            $name = trim((string)($info['name'] ?? ''));
            if ($name === '') {
                $name = ucwords(str_replace(['.', '_', '-'], ' ', explode('@', (string)$info['email'])[0]));
            }
            return [
                'email' => (string)$info['email'],
                'full_name' => $name,
                'avatar_url' => (string)($info['picture'] ?? ''),
            ];
        }

        // Strict Local-Only Development Bridge when external OAuth keys are not yet toggled
        $isLocalDev = Config::app()['env'] === 'development' && in_array($ip, ['127.0.0.1', '::1'], true);
        $devEmail = strtolower(trim((string)($payload['dev_email'] ?? '')));
        if ($isLocalDev && $devEmail !== '' && filter_var($devEmail, FILTER_VALIDATE_EMAIL)) {
            $devName = trim((string)($payload['dev_full_name'] ?? ''));
            if ($devName === '') {
                $devName = ucwords(str_replace(['.', '_', '-'], ' ', explode('@', $devEmail)[0]));
            }
            return [
                'email' => $devEmail,
                'full_name' => $devName,
                'avatar_url' => '',
            ];
        }

        throw new \RuntimeException('Google OAuth provider is not yet enabled. Enable Google in Supabase Auth or set GOOGLE_CLIENT_ID.');
    }

    private function suggestAvailableUsername(string $email): string
    {
        $prefix = strtolower((string)explode('@', $email)[0]);
        $base = preg_replace('/[^a-z0-9._-]/', '', $prefix) ?: 'campus.member';
        if (strlen($base) < 3) {
            $base = str_pad($base, 3, '0');
        }
        $base = substr($base, 0, 24);

        if (User::findByUsername($base) === null) {
            return $base;
        }
        for ($i = 1; $i <= 5; $i++) {
            $candidate = $base . '.' . random_int(10, 99);
            if (User::findByUsername($candidate) === null) {
                return $candidate;
            }
        }
        return $base . '.' . substr(bin2hex(random_bytes(2)), 0, 3);
    }

    private function signOnboardingToken(array $claims): string
    {
        $secret = Config::session()['secret_key'];
        $body = rtrim(strtr(base64_encode((string)json_encode($claims)), '+/', '-_'), '=');
        $sig = rtrim(strtr(base64_encode(hash_hmac('sha256', $body, $secret, true)), '+/', '-_'), '=');
        return $body . '.' . $sig;
    }

    private function verifyOnboardingToken(string $token): array
    {
        $parts = explode('.', trim($token));
        if (count($parts) !== 2) {
            throw new \RuntimeException('Invalid onboarding session token.');
        }
        [$body, $sig] = $parts;
        $secret = Config::session()['secret_key'];
        $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', $body, $secret, true)), '+/', '-_'), '=');
        if (!hash_equals($expected, $sig)) {
            throw new \RuntimeException('Invalid onboarding token signature.');
        }
        $padded = str_pad(strtr($body, '-_', '+/'), (int)(ceil(strlen($body) / 4) * 4), '=');
        $claims = json_decode((string)base64_decode($padded, true), true);
        if (!is_array($claims) || (int)($claims['exp'] ?? 0) < time()) {
            throw new \RuntimeException('Your Google onboarding session expired. Please sign in with Google again.');
        }
        return $claims;
    }

    public function logout(?string $token): void
    {
        if ($token !== null && $token !== '') {
            Session::revokeSession($token);
        }
        $this->clearSessionCookie();
    }

    public function setSessionCookie(string $token): void
    {
        $cfg = Config::session();
        $expires = time() + $cfg['lifetime'];

        if (!headers_sent()) {
            setcookie($cfg['name'], $token, [
                'expires' => $expires,
                'path' => '/',
                'domain' => '',
                'secure' => $cfg['secure'],
                'httponly' => $cfg['httponly'],
                'samesite' => $cfg['samesite'],
            ]);
        }
    }

    public function clearSessionCookie(): void
    {
        $cfg = Config::session();
        if (!headers_sent()) {
            setcookie($cfg['name'], '', [
                'expires' => time() - 3600,
                'path' => '/',
                'domain' => '',
                'secure' => $cfg['secure'],
                'httponly' => $cfg['httponly'],
                'samesite' => $cfg['samesite'],
            ]);
        }
    }

    public function sanitizeUser(array $u): array
    {
        unset($u['password_hash'], $u['csrf_token_hash'], $u['active_session_id']);
        if (isset($u['preferences']) && is_string($u['preferences'])) {
            $u['preferences'] = json_decode($u['preferences'], true);
        }
        return $u;
    }
}
