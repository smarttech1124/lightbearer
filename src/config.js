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

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  port: int(process.env.PORT, 4000),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:4000').replace(/\/+$/, ''),

  paths: {
    root: ROOT,
    public: path.join(ROOT, 'public'),
    uploads: path.join(ROOT, 'uploads'),
    data: path.join(ROOT, 'data'),
    db: path.join(ROOT, 'data', 'portal.db'),
    backups: path.join(ROOT, 'data', 'backups'),
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
    // Resend (preferred). Set RESEND_API_KEY to send real email.
    resendKey: process.env.RESEND_API_KEY || '',
    // SMTP (optional fallback if no Resend key).
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Light Bearers Picnic <onboarding@resend.dev>',
    get provider() {
      if (this.resendKey) return 'resend';
      if (this.host) return 'smtp';
      return 'console';
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
