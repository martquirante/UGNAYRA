<div align="center">

  <img src="./ugnayra_logo.png" alt="UGNAYRA" width="280" />

  <h2>School-Based Social Networking Platform</h2>

  <p>
    A dedicated, verified campus social network engineered for students, educators, and school administrators.
  </p>

  <p>
    <a href="#platform-overview">Platform Overview</a> &bull;
    <a href="#core-capabilities">Core Capabilities</a> &bull;
    <a href="#campus-roles-and-permissions">Campus Roles</a> &bull;
    <a href="#design-system--user-experience">UI/UX Design</a> &bull;
    <a href="#platform-architecture">Architecture</a> &bull;
    <a href="#privacy--security-governance">Security &amp; Privacy</a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/Status-Production%20Ready-success?style=flat-square" alt="Status" />
    <img src="https://img.shields.io/badge/Architecture-Decoupled%20Monorepo-blue?style=flat-square" alt="Architecture" />
    <img src="https://img.shields.io/badge/PHP-8.2+-777BB4?style=flat-square&logo=php&logoColor=white" alt="PHP 8.2+" />
    <img src="https://img.shields.io/badge/PostgreSQL-Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white" alt="PostgreSQL" />
    <img src="https://img.shields.io/badge/Google-Identity%20OAuth%202.0-4285F4?style=flat-square&logo=google&logoColor=white" alt="Google Identity" />
    <img src="https://img.shields.io/badge/Interface-HTML5%20%7C%20CSS3%20Tokens-E34F26?style=flat-square&logo=html5&logoColor=white" alt="Frontend" />
    <img src="https://img.shields.io/badge/Security-RBAC%20%7C%20CSRF%20Hardened-E53E3E?style=flat-square&logo=auth0&logoColor=white" alt="Security" />
  </p>

</div>

---

## Platform Overview

**UGNAYRA** (derived from the Filipino word *“Ugnayan”*, signifying *connection*, *interactivity*, and *collaboration*) is an academic-first social networking platform. Modern higher education and secondary institutions frequently face severe communication fragmentation—academic discussions are scattered across commercial instant messengers, unmonitored group chats, and crowded public social media feeds.

UGNAYRA solves this challenge by delivering a **centralized, verified, and distraction-free digital campus hub**. Within UGNAYRA, every user profile is tied to a verified academic role, enabling students to collaborate on coursework, faculty members to disseminate learning materials, and campus leadership to broadcast priority advisories with immediate reach.

---

## Core Capabilities

<details open>
<summary><b>Institutional Authentication &amp; Verified Access</b></summary>
<br>

- **Dual-Mode Sign-In:** Complete integration with official **Google Identity Services (OAuth 2.0)** and institutional credentials, providing passwordless single-click entry.
- **Academic Profile Onboarding:** First-time Google accounts complete an automated academic onboarding flow to declare their role, college department, student or employee ID number, year level, and section.
- **Session Hardening:** Multi-layered credential management with server-side validation and encrypted cookies.
</details>

<details open>
<summary><b>Academic Feed &amp; Scholarly Sharing</b></summary>
<br>

- **Context-Aware Campus Feed:** Real-time post publication supporting multi-image carousels, academic references, and project milestone showcases.
- **Threaded Discussions:** Nested commentary and interaction trees allowing focused peer reviews, questions, and instructor feedback.
- **Audience Scope Controls:** Seamlessly toggle feed visibility between campus-wide public streams, department-exclusive broadcasts, and private community groups.
</details>

<details open>
<summary><b>Direct Peer &amp; Faculty Messaging</b></summary>
<br>

- **Private Scholarly Conversations:** One-on-one communication channel between classmates, project teammates, and instructors.
- **Presence &amp; Typing Indicators:** Low-latency online indicators and live typing signals designed to facilitate rapid academic consultations.
- **Adaptive Network Engine:** Efficient delta-synchronization engine that conserves device battery and bandwidth on congested campus Wi-Fi networks.
</details>

<details open>
<summary><b>Academic Communities &amp; Subject Groups</b></summary>
<br>

- **Collaborative Workspaces:** Scoped spaces for college departments, specific subject codes, student organizations, and study groups.
- **Role-Governed Membership:** Community administrators manage member rosters, oversee subject discussions, and distribute group-specific announcements.
- **Resource Depository:** Centralized timeline for study guides, lecture summaries, and collaborative project links.
</details>

<details open>
<summary><b>Verified Campus Advisories &amp; Priority Bulletins</b></summary>
<br>

- **Role-Gated Publication:** Only verified faculty members and authorized campus personnel are permitted to issue institutional announcements.
- **Visual Urgency Indicators:** Visual classification across multiple priority tiers—*Urgent Advisory*, *Academic Deadline*, *Campus Event*, and *General Bulletin*.
- **Direct Activity Center:** High-visibility notification hub alerting students immediately when urgent bulletins or academic advisories are published.
</details>

---

## Campus Roles and Permissions

UGNAYRA implements a strict Role-Based Access Control (RBAC) hierarchy ensuring structured boundaries between student life and institutional administration:

| Feature &amp; Capability | Student | Faculty / Teacher | Campus Personnel |
|:---|:---:|:---:|:---:|
| **Access Campus Feed &amp; Engage in Discussions** | Supported | Supported | Supported |
| **Publish Academic Timeline Posts &amp; Media** | Supported | Supported | Supported |
| **Direct Peer &amp; Instructor Messaging** | Supported | Supported | Supported |
| **Join Course &amp; Club Communities** | Supported | Supported | Supported |
| **Create Subject or Interest Communities** | Supported | Supported | Supported |
| **Publish Official Campus Bulletins** | Read Only | Supported *(Faculty Memo)* | Supported *(Official Advisory)* |
| **Issue High-Priority Emergency Alerts** | Read Only | Read Only | Exclusive Access |
| **Manage Departmental Rosters** | Read Only | Supported | Exclusive Access |

---

## Design System &amp; User Experience

The UGNAYRA interface was designed from the ground up to balance modern social media ergonomics with academic focus and accessibility:

<div align="center">

| Design Token | Color Swatch | Hex Code | Purpose &amp; Usage |
|:---|:---:|:---:|:---|
| **Deep Navy** | ![#173B70](https://img.shields.io/badge/-%23173B70-173B70?style=flat-square) | `#173B70` | Primary brand anchor, header hierarchy, and dark mode base |
| **Royal Blue** | ![#2864A8](https://img.shields.io/badge/-%232864A8-2864A8?style=flat-square) | `#2864A8` | Interactive buttons, active navigation states, link highlights |
| **Warm Gold** | ![#F5C518](https://img.shields.io/badge/-%23F5C518-F5C518?style=flat-square) | `#F5C518` | Visual accents, verification markers, and active tabs |
| **Advisory Red** | ![#D94B45](https://img.shields.io/badge/-%23D94B45-D94B45?style=flat-square) | `#D94B45` | Priority advisories, urgent notifications, critical actions |
| **Clean Surface** | ![#F7F8FA](https://img.shields.io/badge/-%23F7F8FA-F7F8FA?style=flat-square) | `#F7F8FA` | Low-strain background canvas in light mode |

</div>

### Key UX Highlights
- **Adaptive Dark / Light Themes:** Hand-calibrated contrast ratios complying with WCAG 2.1 AA standards, minimizing eye fatigue during late-night study sessions.
- **Mobile-First Responsive Shell:** Adaptive layout offering a floating bottom bar on mobile screens and an expansive productivity sidebar on desktop viewports.
- **Vector Iconography:** Powered by crisp, modern SVG icons that scale without pixelation across high-density displays.
- **Zero Content Layout Shift (CLS):** Pre-allocated image frames and skeleton loading states ensure stable rendering during asynchronous data retrieval.

---

## Platform Architecture

UGNAYRA operates on a decoupled client-server architecture designed for reliability, fast initial loads, and independent scalability:

```text
                                 [ UGNAYRA Ecosystem ]
                                           │
         ┌─────────────────────────────────┼─────────────────────────────────┐
         ▼                                 ▼                                 ▼
┌──────────────────┐             ┌──────────────────┐             ┌──────────────────┐
│   Static Client  │             │   Core REST API  │             │ Cloud Data Store │
│   (Vercel SPA)   │ ◄──HTTPS──► │  (Render Docker) │ ◄──TLS/SQL► │  (Supabase PG)   │
│                  │             │                  │             │                  │
│  • HTML5/CSS3    │             │  • PHP 8.2+      │             │  • PostgreSQL 15 │
│  • Vanilla ES6+  │             │  • Middleware    │             │  • Media Storage │
│  • jQuery AJAX   │             │  • CSRF/RBAC     │             │  • Google OAuth  │
└──────────────────┘             └──────────────────┘             └──────────────────┘
```

- **Frontend Application:** Zero server-side rendering overhead. Assets are pre-minified and distributed globally via Content Delivery Networks for instantaneous edge delivery.
- **Backend Application Programming Interface:** Modular PHP 8.2 service architecture handling request authentication, CSRF validation, rate limiting, and business logic execution.
- **Database &amp; Object Storage:** PostgreSQL relational database with foreign-key referential integrity, indexed query paths, and dedicated object storage for verified media files.

---

## Privacy &amp; Security Governance

UGNAYRA is engineered with security and privacy by design:

- **Strict Identity Verification:** Academic accounts are protected by multi-tier authentication, preventing impersonation and unverified access.
- **Encrypted Communication:** All data in transit is enforced via TLS/HTTPS, and all database operations utilize parameterized queries to eliminate SQL injection vectors.
- **Cross-Site Request Forgery (CSRF) Prevention:** Mutating state operations require validated CSRF tokens alongside SameSite cookie protections.
- **Input Sanitization &amp; Output Encoding:** Multi-layer sanitization pipelines guard against Cross-Site Scripting (XSS) across all rich-text and comment inputs.
- **Rate-Limiting Protection:** Token-bucket rate limiting safeguards login endpoints and API resources against abusive brute-force attempts.

---

<div align="center">

  <p>
    <strong>UGNAYRA</strong> &bull; School-Based Social Networking Platform
  </p>
  <p>
    Conceived and engineered by <strong>Raymart Quirante</strong>
  </p>
  <p>
    <sub>Dedicated to modernizing campus communication, collaboration, and student engagement.</sub>
  </p>

</div>
