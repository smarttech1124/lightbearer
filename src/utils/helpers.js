'use strict';

const crypto = require('crypto');

// Crockford-ish base32 alphabet without ambiguous chars (no I, L, O, U)
const REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomRefSegment(len = 5) {
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return out;
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

function titleCase(str) {
  return String(str || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b([a-z])/gi, (m) => m.toUpperCase())
    .replace(/([A-Z])([A-Z]+)/g, (m, a, b) => a + b.toLowerCase());
}

function cleanString(str, max = 200) {
  return String(str == null ? '' : str).trim().slice(0, max);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function isEmail(v) {
  return EMAIL_RE.test(String(v || '').trim());
}

// Normalise a phone number: keep leading + and digits. Validate length.
function normalisePhone(v) {
  let s = String(v || '').trim().replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  return s;
}
function isPhone(v) {
  const digits = String(v || '').replace(/[^\d]/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function formatMoney(amount, symbol = '₦') {
  const n = Number(amount || 0);
  return symbol + n.toLocaleString('en-NG');
}

function nowIso() {
  return new Date().toISOString();
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  randomRefSegment,
  randomToken,
  titleCase,
  cleanString,
  isEmail,
  normalisePhone,
  isPhone,
  formatMoney,
  nowIso,
  escapeHtml,
};
