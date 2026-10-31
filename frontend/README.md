# UGNAYRA — Frontend Client

Static frontend client for **UGNAYRA** (School-Based Social Networking Platform), built exclusively with HTML5, modular CSS3, Vanilla JavaScript, jQuery, and AJAX.

## Directory Structure

```text
frontend/
├── public/
│   ├── assets/
│   │   ├── images/        # Default avatars, cover placeholders, UI illustrations
│   │   ├── icons/         # Touch icons & platform icons
│   │   └── logos/         # Extracted UGNAYRA mark, wordmark, and full lockup
│   └── favicon.ico        # Multi-resolution browser icon
├── src/
│   ├── assets/
│   │   ├── images/
│   │   └── fonts/
│   ├── css/
│   │   ├── base/          # CSS reset, color/spacing/type tokens, typography, utilities
│   │   ├── components/    # Buttons, forms, cards, modals, avatars, badges, skeletons, toasts
│   │   ├── layouts/       # App shell, 3-column desktop grid, mobile bottom bar, headers
│   │   └── pages/         # Auth, feed, messages, communities, announcements, profile
│   ├── js/
│   │   ├── core/          # Runtime config, jQuery AJAX client, router/view manager, state store
│   │   ├── components/    # Reusable UI renderers (post card, comment list, modal, toast)
│   │   ├── modules/       # Feature controllers (auth, feed, messaging, communities, search)
│   │   ├── services/      # Endpoint-specific API wrappers returning JSON promises
│   │   └── utils/         # Output escaping (XSS prevention), relative timestamps, validators
│   └── pages/             # Modular HTML view templates/entry pages per domain
└── index.html             # Primary application entry shell
```

## Architectural Rules
- **Zero Backend Mixing:** No `.php` files or server credentials ever reside inside `frontend/`.
- **Configurable API Origin:** All requests route through `src/js/core/apiClient.js`, reading `API_BASE_URL` so local development (`http://localhost:8080/api/v1`) and Vercel production deployments switch seamlessly without modifying feature modules.
- **No Unnecessary Reloads:** Likes, comments, post creation, search suggestions, notifications, and private messages update the DOM dynamically via jQuery AJAX and escaped JSON templates.
