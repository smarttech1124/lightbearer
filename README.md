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
| **Early-bird pricing** | First **20** registrants pay ₦1,500; everyone after pays ₦2,000. Slots are allocated **atomically** inside a **Serializable** Prisma transaction (with retry on write conflicts), so concurrent registrations can never over-allocate the discount. |
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
- **Database:** PostgreSQL via **Prisma ORM** — serverless-friendly (no persistent disk), with a Serializable transaction for atomic early-bird/group allocation.
- **Package manager:** **pnpm**.
- **Auth:** JWT in an httpOnly cookie, `bcryptjs` password hashing, role-based access control.
- **Security:** Helmet (CSP), rate limiting, server-side validation, secure validated file uploads, audit logs.
- **Email:** [Resend](https://resend.com) (HTTP API), with a graceful console mode for local testing.
- **QR:** `qrcode`. **Exports:** `exceljs`, `pdfkit`, native CSV.
- **Frontend:** Framework-free, responsive HTML/CSS/JS with a bespoke luxury design system (deep navy + radiant gold + ivory, Fraunces + Inter typography).

---

## 🚀 Quick start

> Requires **Node.js 22** and **pnpm**. You need a **PostgreSQL** database
> (e.g. a free [Neon](https://neon.tech) or [Supabase](https://supabase.com) project).

```bash
# 1. Install dependencies (also generates the Prisma client)
pnpm install

# 2. Create your environment file and set DATABASE_URL (+ others)
cp .env.example .env         # edit .env — see Configuration below

# 3. Create the database tables from the Prisma schema
pnpm db:push

# 4. Start the server
pnpm start
```

Then open:

- **Public site:** http://localhost:4000
- **Admin portal:** http://localhost:4000/admin

On first run a **bootstrap admin** is created from your `.env`
(`ADMIN_EMAIL` / `ADMIN_PASSWORD`). **Log in and change the password immediately.**

For auto-reload during development: `pnpm dev`. Inspect data with `pnpm db:studio`.

> No Postgres handy? For a quick local run you can set `DATABASE_URL="file:./prisma/dev.db"`
> and change the datasource `provider` to `sqlite` in `prisma/schema.prisma`, then `pnpm db:push`.

---

## ⚙️ Configuration (`.env`)

Everything is configured through environment variables. Copy `.env.example` → `.env`.

### Core
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | **Required.** PostgreSQL connection string (Neon/Supabase/Render/Vercel Postgres). |
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
| `RESEND_API_KEY` | Your Resend API key. If blank, the app runs in console mode. |
| `MAIL_FROM` | The "From" address (domain must be verified in Resend). |

> **Console mode:** with no Resend key, emails are logged and recorded in the notification
> log but **not delivered** — perfect for local development.

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

### Database (PostgreSQL + Prisma)
- Schema lives in `prisma/schema.prisma`. Apply it with `pnpm db:push` (quick sync) or use
  migrations (`pnpm prisma migrate dev` locally, `pnpm db:migrate` to deploy).
- **Backups** are handled by your Postgres provider (Neon/Supabase/Render all offer
  automated backups/point-in-time restore), or run `pg_dump "$DATABASE_URL"` on a schedule.
- Browse/edit data with `pnpm db:studio`.

### Uploaded receipts
Stored in `UPLOADS_DIR` (default `uploads/`) with randomised filenames, served only to
authenticated admins. On an ephemeral host, point `UPLOADS_DIR` at a persistent volume
(or move to a blob store) so receipts survive redeploys. Include them in your backups.

### Reset for a new event
Drop/recreate the database (or `pnpm prisma migrate reset`) and clear `uploads/`, then start
again — a fresh bootstrap admin is created automatically.

---

## 🔒 Production / deployment checklist

- [ ] Set a strong, unique `JWT_SECRET`.
- [ ] Change the bootstrap admin password (and set a real `ADMIN_PASSWORD`).
- [ ] Set `NODE_ENV=production` and the correct `PUBLIC_BASE_URL` (https).
- [ ] Serve over **HTTPS** (terminate TLS at a reverse proxy such as Nginx/Caddy). The app
      already trusts one proxy hop and issues `Secure` cookies in production.
- [ ] Set `RESEND_API_KEY` and a verified `MAIL_FROM` so emails are delivered.
- [ ] Set `ADMIN_NOTIFY_EMAIL` (or set it in the admin portal) for receipt alerts.
- [ ] Set a `DATABASE_URL` pointing at your production Postgres, and run `pnpm db:push` (or `pnpm db:migrate`).
- [ ] Set your real bank details (or do it later in the admin portal).
- [ ] Ensure your Postgres provider has automated backups enabled.
- [ ] Run under a process manager (`pm2`, `systemd`, Docker, or a PaaS) so it restarts on reboot.

### Deploy to Render (one click)
This repo includes `render.yaml` (a Postgres database + web service + disk for receipts).
On Render: **New → Blueprint → connect this repo**, then fill the dashboard secrets
(`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `RESEND_API_KEY`, `MAIL_FROM`, bank details). `DATABASE_URL`
and `JWT_SECRET` are provisioned automatically. A `Dockerfile` is also included for Railway /
Fly.io / any container host or VPS.

> **Vercel / serverless:** the Postgres database works there, but uploaded receipts are written
> to disk — serverless filesystems don't persist, so move `UPLOADS_DIR` to a blob store
> (Vercel Blob / S3) before using Vercel. Render/Railway/Fly/VPS work as-is.

Reverse proxy (Nginx) idea: proxy `https://picnic.yourdomain.org` → `http://127.0.0.1:4000`.

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
├── prisma/schema.prisma      # Postgres data model (Prisma)
├── render.yaml  Dockerfile   # deployment
├── .env.example              # configuration template
├── src/
│   ├── config.js             # env-driven config
│   ├── app.js                # express app + routes + static
│   ├── db/                   # Prisma client + settings/bootstrap helpers
│   ├── middleware/           # auth, security (helmet/rate-limit), upload, validation
│   ├── routes/               # public, auth, admin
│   ├── services/             # registration, groups, payments, barcode, email,
│   │                         # settings, notifications, participants, stats,
│   │                         # export, admins, audit
│   ├── scripts/              # seedAdmin
│   └── utils/                # helpers
├── public/                   # frontend (landing, ticket, find, verify, admin SPA)
│   ├── css/  js/  assets/  admin/
└── uploads/                  # payment receipts (gitignored)
```

---

## 🧪 How the tricky parts stay correct under load

- **Early-bird slots & group balance** are decided inside a **Serializable** Prisma
  transaction (`src/services/registration.js`): "count registrations → pick fee → pick group
  → insert". Postgres aborts conflicting concurrent transactions, and the service retries on
  write conflicts — so the 20 discounted slots are never over-allocated and groups stay balanced.
- **Reference numbers** are unique by DB constraint, with automatic regeneration on the
  (astronomically unlikely) collision.
- **Duplicate registrations** are blocked by a `UNIQUE` email constraint (checked in-tx).
- **Receipt upload → status change** is atomic, and **check-in requires a confirmed payment**.

---

Built with care for the Light Bearers community. ✦
