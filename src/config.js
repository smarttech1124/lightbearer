'use strict';

const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

function bool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}
function int(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

const ROOT = path.resolve(__dirname, '..');

// Uploaded receipts live on disk. On hosts with an ephemeral filesystem (e.g.
// serverless) point UPLOADS_DIR at a mounted persistent volume, or swap to a
// blob store. The database is PostgreSQL via Prisma (DATABASE_URL).
const UPLOADS_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(ROOT, 'uploads');

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  port: int(process.env.PORT, 4000),
  // Falls back to Render's auto-provided external URL, then localhost.
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:4000').replace(/\/+$/, ''),

  paths: {
    root: ROOT,
    public: path.join(ROOT, 'public'),
    uploads: UPLOADS_DIR,
  },

  security: {
    jwtSecret: process.env.JWT_SECRET && process.env.JWT_SECRET !== 'change-me-to-a-long-random-string'
      ? process.env.JWT_SECRET
      : crypto.randomBytes(48).toString('hex'), // ephemeral fallback (dev only)
    jwtSecretIsEphemeral: !process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-to-a-long-random-string',
    sessionHours: int(process.env.ADMIN_SESSION_HOURS, 12),
  },

  bootstrapAdmin: {
    email: (process.env.ADMIN_EMAIL || 'admin@lightbearers.org').toLowerCase().trim(),
    password: process.env.ADMIN_PASSWORD || 'ChangeMe!2026',
    name: process.env.ADMIN_NAME || 'Lead Administrator',
  },

  event: {
    name: process.env.EVENT_NAME || 'Light Bearers Picnic Hangout',
    earlyBirdLimit: int(process.env.EARLY_BIRD_LIMIT, 20),
    earlyBirdFee: int(process.env.EARLY_BIRD_FEE, 1500),
    regularFee: int(process.env.REGULAR_FEE, 2000),
    currency: process.env.CURRENCY || 'NGN',
    currencySymbol: process.env.CURRENCY_SYMBOL || '₦',
    groups: (process.env.GROUPS || 'Lighters,Bearers,Anchors,Trailblazers')
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean),
  },

  bank: {
    name: process.env.BANK_NAME || 'Guaranty Trust Bank (GTBank)',
    accountName: process.env.BANK_ACCOUNT_NAME || 'Light Bearers Picnic',
    accountNumber: process.env.BANK_ACCOUNT_NUMBER || '0123456789',
  },

  mail: {
    // Resend. Set RESEND_API_KEY to send real email; otherwise console mode.
    resendKey: process.env.RESEND_API_KEY || '',
    from: process.env.MAIL_FROM || 'Light Bearers Picnic <onboarding@resend.dev>',
    get provider() {
      return this.resendKey ? 'resend' : 'console';
    },
    get enabled() {
      return this.provider !== 'console';
    },
  },

  // Where receipt-uploaded / verification notices are emailed. Falls back to the
  // bootstrap admin address. Can be overridden from the admin portal.
  notifyEmailDefault: (process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'admin@lightbearers.org')
    .toLowerCase()
    .trim(),

  uploads: {
    maxBytes: int(process.env.MAX_UPLOAD_MB, 8) * 1024 * 1024,
    allowedMime: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
    allowedExt: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'],
  },
};

module.exports = config;
