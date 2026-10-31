# UGNAYRA — REST API & Communication Specification

**Base Path:** `/api/v1`  
**Request / Response Format:** `application/json; charset=utf-8` (except `multipart/form-data` for media uploads, which still return `application/json`)  
**Client Transport:** jQuery `$.ajax` via `frontend/src/js/core/apiClient.js`

---

## 1. API Base URL Resolution Strategy

To keep `frontend/` and `backend/` strictly independent across local development and cloud deployment (Vercel + Render), the frontend resolves `API_BASE_URL` in this priority order inside `frontend/src/js/core/config.js`:

1. Explicit runtime override (`window.__UGNAYRA_API_URL__` or `<meta name="ugnayra-api-base" content="...">`).
2. Local development detection (`localhost` / `127.0.0.1`) → defaults to `http://127.0.0.1:8080/api/v1`.
3. Production Vercel deployment → `/api/v1` (routed cleanly via `vercel.json` rewrite to the Render PHP Web Service, or direct HTTPS Render URL when configured).

---

## 2. Uniform JSON Envelope Contract

Every PHP endpoint MUST return a consistent JSON structure so client modules handle payloads, pagination, and errors uniformly.

### 2.1 Success Response (`200 OK` / `201 Created`)
```json
{
  "success": true,
  "message": "Post published successfully.",
  "data": {
    "post": {
      "id": "b7f92c1e-4a83-4c19-9a4e-8f2c9012ab34",
      "content": "Reminder: IT305W milestone review starts at 2:00 PM in Lab 3.",
      "visibility": "campus",
      "likes_count": 0,
      "comments_count": 0,
      "shares_count": 0,
      "is_liked": false,
      "created_at": "2026-10-31T14:00:00+08:00"
    }
  },
  "meta": {
    "timestamp": "2026-10-31T14:00:00+08:00",
    "request_id": "req_74d8e9102f1b"
  }
}
```

### 2.2 Paginated Collection Response (`200 OK`)
```json
{
  "success": true,
  "message": "Feed retrieved.",
  "data": {
    "items": []
  },
  "meta": {
    "timestamp": "2026-10-31T14:00:00+08:00",
    "request_id": "req_81a2c4099b2e",
    "pagination": {
      "limit": 15,
      "next_cursor": "2026-10-31T13:12:45+08:00|6d1f0a12-91ba-4e20-b8d2-1092a8e41200",
      "has_more": true
    }
  }
}
```

### 2.3 Error Response (`400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`)
Internal SQL traces or PDO messages are **never** included in HTTP responses.
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please review the highlighted fields.",
    "details": {
      "email": ["Please enter a valid school email address."],
      "password": ["Password must be at least 8 characters long."]
    }
  },
  "meta": {
    "timestamp": "2026-10-31T14:00:00+08:00",
    "request_id": "req_90f12e84a7c3"
  }
}
```

### Standard Error Codes
| HTTP Status | `error.code` | Meaning |
|---|---|---|
| `400` | `BAD_REQUEST` | Malformed JSON body or invalid query parameter |
| `401` | `UNAUTHENTICATED` | Missing or expired user session |
| `403` | `FORBIDDEN` / `CSRF_MISMATCH` | Insufficient role permission or invalid `X-CSRF-Token` |
| `404` | `NOT_FOUND` | Requested record or endpoint does not exist |
| `409` | `CONFLICT` | Duplicate email, student/faculty ID, or community slug |
| `413` | `PAYLOAD_TOO_LARGE` | Uploaded image exceeds `UPLOAD_MAX_BYTES` |
| `422` | `VALIDATION_ERROR` | Field-level validation failed (`error.details` populated) |
| `429` | `RATE_LIMITED` | Too many requests within window (`Retry-After` header sent) |
| `500` | `INTERNAL_ERROR` | Generic server error (logged privately to `storage/logs/`) |

---

## 3. Client AJAX & Security Handshake

1. **Bootstrap (`GET /api/v1/auth/me`):** On initial app load, jQuery fetches current session state and receives `{ authenticated, user, csrf_token }`.
2. **State-Mutating Calls (`POST`, `PUT`, `PATCH`, `DELETE`):** `apiClient.js` automatically attaches:
   - `X-CSRF-Token: <csrf_token>`
   - `xhrFields: { withCredentials: true }`
   - `contentType: 'application/json; charset=utf-8'` (or `false` + `processData: false` when sending `FormData` with image uploads).
3. **Method Tunneling Compatibility:** Standard REST verbs (`PUT`, `PATCH`, `DELETE`) are supported natively, plus `_method` header `X-HTTP-Method-Override` when uploading `multipart/form-data` edits in PHP.

---

## 4. Complete REST Endpoint Catalog

### A. System & Health
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | API runtime & database connectivity status check |

### B. Authentication & Session (`/api/v1/auth`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/auth/csrf` | Public | Issue/refresh session CSRF token |
| `POST` | `/api/v1/auth/register` | Public | Register account (`student`, `teacher`, `personnel` with institutional details) |
| `POST` | `/api/v1/auth/login` | Public | Authenticate credentials, regenerate PHP session, return user & CSRF token |
| `POST` | `/api/v1/auth/logout` | Auth | Destroy current PHP session & revoke DB session record |
| `GET` | `/api/v1/auth/me` | Public/Auth | Return active authenticated profile, role permissions, unread counts, and CSRF token |

### C. User Profiles & Directory (`/api/v1/profiles`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/profiles` | Auth | Directory listing / classmates & faculty suggestions (filterable by role/department) |
| `GET` | `/api/v1/profiles/{idOrUsername}` | Auth | Retrieve full user profile, academic metadata, stats, and relationship state |
| `PATCH` | `/api/v1/profiles/me` | Auth | Update own profile details (bio, department, grade/year, section, office hours) |
| `POST` | `/api/v1/profiles/me/avatar` | Auth | Upload & replace profile picture (`multipart/form-data`) |
| `POST` | `/api/v1/profiles/me/cover` | Auth | Upload & replace profile cover photo (`multipart/form-data`) |
| `GET` | `/api/v1/profiles/{id}/posts` | Auth | Cursor-paginated posts authored or shared by a specific user |

### D. News Feed, Posts, Reactions & Comments (`/api/v1/posts`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/posts` | Auth | Cursor-paginated main campus feed (`filter=all\|following\|teachers\|media`) |
| `POST` | `/api/v1/posts` | Auth | Create text/image post (optional `community_id` or `shared_post_id`) |
| `GET` | `/api/v1/posts/{id}` | Auth | Fetch single post with author, attachments, shared parent, and initial comments |
| `PATCH` | `/api/v1/posts/{id}` | Owner | Edit post text content |
| `DELETE` | `/api/v1/posts/{id}` | Owner / Personnel | Delete post |
| `POST` | `/api/v1/posts/{id}/like` | Auth | Like a post (idempotent; increments count & triggers notification) |
| `DELETE` | `/api/v1/posts/{id}/like` | Auth | Remove like from a post |
| `POST` | `/api/v1/posts/{id}/share` | Auth | Share an existing post to feed with optional commentary |
| `GET` | `/api/v1/posts/{id}/comments` | Auth | Paginated comments for a post |
| `POST` | `/api/v1/posts/{id}/comments` | Auth | Add comment to a post (triggers notification) |
| `DELETE` | `/api/v1/comments/{commentId}` | Owner / Post Owner / Personnel | Delete a comment |

### E. Private Messaging & Presence (`/api/v1/conversations`, `/api/v1/presence`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/conversations` | Auth | List user's conversations ordered by latest message with unread counts & peer presence |
| `POST` | `/api/v1/conversations` | Auth | Open or retrieve existing 1-to-1 conversation with `recipient_id` |
| `GET` | `/api/v1/conversations/{id}/messages` | Member | Fetch message history (`before` cursor) or delta poll new messages (`after` timestamp) |
| `POST` | `/api/v1/conversations/{id}/messages` | Member | Send message (text and/or optional attachment) |
| `POST` | `/api/v1/conversations/{id}/read` | Member | Mark messages in conversation as read up to latest ID |
| `POST` | `/api/v1/conversations/{id}/typing` | Member | Set ephemeral typing indicator timestamp for active peer |
| `POST` | `/api/v1/presence/heartbeat` | Auth | Update `last_seen_at` & fetch compact badge summary + online classmates list |

### F. School Communities (`/api/v1/communities`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/communities` | Auth | Browse/filter campus communities (`filter=joined\|discover\|academic\|clubs`) |
| `POST` | `/api/v1/communities` | Auth | Create a new school community (creator becomes community admin) |
| `GET` | `/api/v1/communities/{idOrSlug}` | Auth | Community details, rules, banner, membership status, and pinned announcements |
| `PATCH` | `/api/v1/communities/{id}` | Community Admin / Personnel | Update community metadata or cover banner |
| `POST` | `/api/v1/communities/{id}/join` | Auth | Join community |
| `DELETE` | `/api/v1/communities/{id}/leave` | Member | Leave community |
| `GET` | `/api/v1/communities/{id}/members` | Auth | Paginated community member list with roles (`admin`, `moderator`, `member`) |
| `GET` | `/api/v1/communities/{id}/posts` | Auth | Cursor-paginated community posts & community announcements |
| `POST` | `/api/v1/communities/{id}/posts` | Member | Publish post or community announcement (`is_announcement=true` for community admins/teachers) |

### G. Official School Announcements (`/api/v1/announcements`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/announcements` | Auth | List school announcements filterable by `category` and `priority` |
| `POST` | `/api/v1/announcements` | `teacher` / `personnel` | Publish official announcement (`category`, `priority`: `normal\|important\|urgent`, `is_pinned`) |
| `PATCH` | `/api/v1/announcements/{id}` | Author / `personnel` | Edit announcement or toggle pinned state |
| `DELETE` | `/api/v1/announcements/{id}` | Author / `personnel` | Remove announcement |

### H. Notifications (`/api/v1/notifications`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/notifications` | Auth | Paginated notifications (`filter=all\|unread`) with actor & target links |
| `POST` | `/api/v1/notifications/{id}/read` | Auth | Mark single notification as read |
| `POST` | `/api/v1/notifications/read-all` | Auth | Mark all unread notifications as read |

### I. Unified Search & Discovery (`/api/v1/search`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/search` | Auth | AJAX search (`?q=...&type=all\|people\|posts\|communities\|announcements&limit=...`) |

### J. Future-Ready WebRTC Signaling Seam (`/api/v1/rtc` — Reserved Module)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/rtc/sessions` | Auth | Initialize peer call session (isolated future WebRTC module) |
| `POST` | `/api/v1/rtc/sessions/{id}/signal` | Participant | Exchange SDP offer/answer or ICE candidate |
| `GET` | `/api/v1/rtc/sessions/{id}/signal` | Participant | Poll pending signaling events |
