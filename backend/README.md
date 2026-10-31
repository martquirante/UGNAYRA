# UGNAYRA — Backend REST API

Stateless-ready PHP 8.2+ REST API for **UGNAYRA** (School-Based Social Networking Platform), communicating with **Supabase PostgreSQL** via `PDO` (`pdo_pgsql`) and serving structured JSON responses.

## Directory Structure

```text
backend/
├── public/
│   └── index.php          # Single Front Controller entry point
├── app/
│   ├── Config/            # Environment loader, CORS/Session config, PDO Database singleton
│   ├── Controllers/       # Thin HTTP controllers handling JSON request/response flow
│   ├── Models/            # Parameterized PDO data-access repositories for PostgreSQL
│   ├── Services/          # Business logic (Auth, Feed, Messaging, Communities, Storage)
│   ├── Middleware/        # CORS, Session/Auth, Role-Based Access, CSRF, Rate Limiting
│   ├── Validators/        # Strict server-side input & multipart file upload validation
│   └── Helpers/           # Uniform JSON Responder, UUID/Token helpers, Logger
├── routes/
│   └── api.php            # Declarative REST API route definitions (/api/v1/*)
├── storage/
│   ├── logs/              # Server-side error logs (never exposed to HTTP clients)
│   └── rate_limits/       # Ephemeral rate-limit buckets
├── tests/                 # Automated API, Validator, and Database integration checks
├── composer.json          # PHP 8.2+ & PSR-4 autoloading manifest
└── .env.example           # Documented environment variable template (no secrets)
```

## Security Standards
- Passwords hashed with `password_hash($password, PASSWORD_DEFAULT)` and verified via `password_verify()`.
- 100% parameterized `PDO` prepared statements — zero raw SQL string interpolation.
- Strict CORS origin allowlist (`FRONTEND_ORIGIN`), `HttpOnly` session cookies, and `X-CSRF-Token` validation on state-mutating requests.
- Server-side MIME inspection (`finfo`) and size enforcement on all uploaded images.
- Internal PDO/PostgreSQL exceptions are logged to `storage/logs/` while clients receive sanitized, structured JSON error codes.
