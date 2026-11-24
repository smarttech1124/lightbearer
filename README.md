# ✦ Light Bearers — Picnic Registration & Management Portal

A production-ready, fully automated registration and event-management portal for the
**Light Bearers Members' Picnic Hangout**. Participants register, are auto-assigned to a
balanced group, receive a unique reference and a scannable QR check-in code, pay by bank
transfer, and upload their receipt. Administrators verify payments, manage records, and
check attendees in at the venue — all from a secure, luxury-styled dashboard.

Built as a real full-stack application with a functional backend and database — **not** a
static prototype.

---

## ✨ Features

| Area | What it does |
|------|--------------|
| **Registration** | Elegant, validated form with conditional worker → department field. Server-side validation, duplicate-email prevention. |
| **Random group allocation** | Every registrant is automatically assigned to the **least-full** group (Lighters / Bearers / Anchors / Trailblazers) with cryptographic random tie-breaking — balanced and unpredictable. Groups scale automatically. |
| **Reference numbers** | Unique `LBYY-XXXXX` reference per participant, shown on confirmation, emailed, searchable by admins, and used as the bank-transfer narration. |
| **Early-bird pricing** | First **20** registrants pay ₦1,500; everyone after pays ₦2,000. Slots are allocated **atomically** inside an `IMMEDIATE` SQLite transaction, so concurrent registrations can never over-allocate the discount. |
| **Payments** | Bank-transfer details + receipt upload (image/PDF, validated & size-limited). Status flow: `awaiting_payment → pending_verification → confirmed / rejected`. |
| **Admin email alerts** | When a receipt is uploaded, the designated admin email is notified (name, email, reference, amount, dashboard link) so they can verify it. Delivery log with retries. |
| **QR / barcode** | A scannable QR encoding a secure verification **URL + opaque token** (no PII). Downloadable, emailed, printable, and used for venue check-in. Only **confirmed** participants can be admitted. |
| **Admin dashboard** | Secure login (JWT, bcrypt), role-based access, live stats, search/filter/sort/paginate, participant detail & edit, payment verification, group stats, notification log, audit log, settings, admin management. |
| **Exports** | One-click **Excel (.xlsx)**, **CSV**, and **PDF** exports that respect the active filters. |
| **Check-in** | Scan a participant's QR with any phone camera → opens their check-in page. In-dashboard lookup-by-reference and an optional in-browser QR scanner are also provided. |
| **Automation** | Confirmation emails, reference generation, group allocation, early-bird pricing, admin receipt alerts, QR generation, real-time stats, audit logging — all automatic. |

---

## 🧱 Tech stack

- **Backend:** Node.js + Express
- **Database:** SQLite via `better-sqlite3` (WAL mode, transactional, zero external services) — ideal for atomic early-bird/group allocation and easy backups.
- **Auth:** JWT in an httpOnly cookie, `bcryptjs` password hashing, role-based access control.
- **Security:** Helmet (CSP), rate limiting, server-side validation, secure validated file uploads, audit logs.
- **Email:** [Resend](https://resend.com) (HTTP API) with an optional SMTP (`nodemailer`) fallback and a graceful console mode for local testing.
- **QR:** `qrcode`. **Exports:** `exceljs`, `pdfkit`, native CSV.
- **Frontend:** Framework-free, responsive HTML/CSS/JS with a bespoke luxury design system (deep navy + radiant gold + ivory, Fraunces + Inter typography).

---

## 🚀 Quick start

> Requires **Node.js 20+** (tested on Node 22).

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env        # then edit .env (see Configuration below)

# 3. Start the server
npm start
```

Then open:

- **Public site:** http://localhost:4000
- **Admin portal:** http://localhost:4000/admin

On first run a **bootstrap admin** is created from your `.env`
(`ADMIN_EMAIL` / `ADMIN_PASSWORD`). **Log in and change the password immediately.**

For auto-reload during development: `npm run dev`.

---

## ⚙️ Configuration (`.env`)

Everything is configured through environment variables. Copy `.env.example` → `.env`.

### Core
| Variable | Description |
|----------|-------------|
| `PORT` | Port to listen on (default `4000`). |
| `PUBLIC_BASE_URL` | Public URL of the site. **Used in QR codes, emails and check-in links** — set this to your real HTTPS domain in production. |
| `JWT_SECRET` | Secret for signing admin sessions. **Set a long random value in production** (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). If unset, an ephemeral secret is used and sessions reset on restart. |
| `ADMIN_SESSION_HOURS` | Admin session lifetime (default `12`). |

### First admin (bootstrap)
| Variable | Description |
|----------|-------------|
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Created once on first run as a **superadmin**. Change the password after logging in. |

### Event & pricing
| Variable | Default |
|----------|---------|
| `EVENT_NAME` | `Light Bearers Picnic Hangout` |
| `EARLY_BIRD_LIMIT` | `20` |
| `EARLY_BIRD_FEE` | `1500` |
| `REGULAR_FEE` | `2000` |
| `CURRENCY`, `CURRENCY_SYMBOL` | `NGN`, `₦` |
| `GROUPS` | `Lighters,Bearers,Anchors,Trailblazers` (comma-separated; any number supported) |

### Bank details (shown to participants)
`BANK_NAME`, `BANK_ACCOUNT_NAME`, `BANK_ACCOUNT_NUMBER` — these are the **initial defaults**.
A superadmin can change them anytime from the admin portal
(**Settings → Bank details & notifications**) without editing the server.

### Email — Resend (recommended)
Email is sent via [Resend](https://resend.com):

1. Create a Resend account and an **API key**; set `RESEND_API_KEY`.
2. **Verify your sending domain** in Resend, then set `MAIL_FROM` to an address on that
   domain (e.g. `Light Bearers <tickets@yourdomain.org>`). For quick testing you can use
   `onboarding@resend.dev` without verifying a domain.

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Your Resend API key. If blank, the app falls back to SMTP, then console mode. |
| `MAIL_FROM` | The "From" address (domain must be verified in Resend). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Optional SMTP fallback used **only** when `RESEND_API_KEY` is empty. |

> **Console mode:** with no Resend key and no SMTP host, emails are logged and recorded in
> the notification log but **not delivered** — perfect for local development.

Emails sent: registration confirmation (with reference, bank details & QR), payment
confirmed, payment rejected, and the **admin "receipt uploaded — please verify" alert**.

### Admin notification email
When a participant uploads a receipt, an alert email is sent so an admin knows to verify it.

| Variable | Description |
|----------|-------------|
| `ADMIN_NOTIFY_EMAIL` | Recipient of receipt-uploaded alerts. Defaults to `ADMIN_EMAIL`. Also editable from the admin portal (**Settings → Bank details & notifications**). |

### Uploads
`MAX_UPLOAD_MB` (default `8`). Allowed types: JPG, PNG, WEBP, GIF, PDF.

---

## 👥 Admin roles

| Role | Capabilities |
|------|--------------|
| **superadmin** | Everything, plus settings, admin management, and the audit log. |
| **admin** | Manage & edit participants, verify payments, check-in, exports, retry notifications. |
| **verifier** | Confirm/reject payments and check participants in. |

Add more admins from **Settings → Administrators** (superadmin only), or from the CLI:

```bash
node src/scripts/seedAdmin.js someone@example.com "Their Name" "StrongPassword" admin
```

---

## 🔄 Participant journey

1. Visit the portal and complete the registration form.
2. The system validates input, checks early-bird eligibility, assigns a unique reference, and randomly allocates a balanced group.
3. The confirmation page shows the reference, assigned group, applicable fee, bank details, and a QR code; a confirmation email is sent.
4. The participant transfers the fee using the reference as the narration and uploads the receipt.
5. The designated admin is notified by email; status becomes **Pending Verification**.
6. The designated admin receives an email alert, reviews the receipt, and confirms (or rejects). The participant is emailed the outcome.
7. At the venue, the participant presents their QR code; staff scan it to check them in (confirmed payments only).

Participants can return any time via **Find my ticket** (reference + email) or their emailed ticket link.

---

## 🛠️ Operations

### Database
A single SQLite file at `data/portal.db` (WAL mode). Back it up safely while running:

```bash
npm run backup        # → data/backups/portal-<timestamp>.db
```

Schedule this (Windows Task Scheduler / cron) for regular backups. Restore by stopping the
server and replacing `data/portal.db`.

### Uploaded receipts
Stored in `uploads/` with randomised filenames and served only to authenticated admins.
Include this folder in your backups.

### Reset for a new event
Stop the server, delete `data/portal.db*` and the files in `uploads/`, then start again —
a fresh database and bootstrap admin are created automatically.

---

## 🔒 Production / deployment checklist

- [ ] Set a strong, unique `JWT_SECRET`.
- [ ] Change the bootstrap admin password (and set a real `ADMIN_PASSWORD`).
- [ ] Set `NODE_ENV=production` and the correct `PUBLIC_BASE_URL` (https).
- [ ] Serve over **HTTPS** (terminate TLS at a reverse proxy such as Nginx/Caddy). The app
      already trusts one proxy hop and issues `Secure` cookies in production.
- [ ] Set `RESEND_API_KEY` and a verified `MAIL_FROM` so emails are delivered.
- [ ] Set `ADMIN_NOTIFY_EMAIL` (or set it in the admin portal) for receipt alerts.
- [ ] Set your real bank details.
- [ ] Schedule `npm run backup`.
- [ ] Run under a process manager (`pm2`, `systemd`, or a Windows service) so it restarts on reboot.

Example reverse-proxy idea (Nginx): proxy `https://picnic.yourdomain.org` → `http://127.0.0.1:4000`.

---

## 📡 API overview

Public:
- `GET /api/config`, `GET /api/counters`
- `POST /api/register`
- `POST /api/lookup` (reference + email)
- `GET /api/ticket/:token`, `POST /api/ticket/:token/receipt`
- `GET /api/qr/:token.png`

Auth:
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password`

Admin (cookie-authenticated, role-gated):
- `GET /api/admin/stats`
- `GET /api/admin/participants`, `GET /api/admin/participants/:id`, `PATCH /api/admin/participants/:id`
- `POST /api/admin/participants/:id/confirm|reject|checkin|undo-checkin`
- `GET /api/admin/receipts/:id/file`
- `GET /api/admin/verify/:token`, `POST /api/admin/verify/:token/checkin`
- `GET /api/admin/groups`, `GET /api/admin/notifications`, `POST /api/admin/notifications/:id/retry`
- `GET /api/admin/audit`, `GET /api/admin/export?format=xlsx|csv|pdf&...filters`
- `GET/POST /api/admin/settings`, `GET/POST /api/admin/admins`, `POST /api/admin/admins/:id/active`

---

## 📁 Project structure

```
lightBearers/
├── server.js                 # entry point
├── .env.example              # configuration template
├── src/
│   ├── config.js             # env-driven config
│   ├── app.js                # express app + routes + static
│   ├── db/                   # schema.sql + connection (better-sqlite3, WAL)
│   ├── middleware/           # auth, security (helmet/rate-limit), upload, validation
│   ├── routes/               # public, auth, admin
│   ├── services/             # registration, groups, payments, barcode, email,
│   │                         # settings, notifications, participants, stats,
│   │                         # export, admins, audit
│   ├── scripts/              # seedAdmin, backup
│   └── utils/                # helpers
├── public/                   # frontend (landing, ticket, find, verify, admin SPA)
│   ├── css/  js/  assets/  admin/
├── data/                     # SQLite db + backups (gitignored)
└── uploads/                  # payment receipts (gitignored)
```

---

## 🧪 How the tricky parts stay correct under load

- **Early-bird slots & group balance** are decided inside a single `IMMEDIATE` SQLite
  transaction (`src/services/registration.js`). The write lock is taken up-front, so the
  "count registrations → pick fee → pick group → insert" sequence is atomic. Concurrent
  registrations are serialized by the database — no over-allocation, no duplicate groups.
- **Reference numbers** are unique by DB constraint, with automatic regeneration on the
  (astronomically unlikely) collision.
- **Duplicate registrations** are blocked by a `UNIQUE` email constraint (checked in-tx).
- **Receipt upload → status change** is atomic, and **check-in requires a confirmed payment**.

---

Built with care for the Light Bearers community. ✦
