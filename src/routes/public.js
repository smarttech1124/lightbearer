'use strict';

const express = require('express');
const config = require('../config');
const { validateRegistration, DEPARTMENTS, GENDERS } = require('../middleware/validate');
const { registerLimiter, uploadLimiter } = require('../middleware/security');
const { receiptUpload, sha256File } = require('../middleware/upload');
const { register, RegistrationError } = require('../services/registration');
const participantsSvc = require('../services/participants');
const paymentsSvc = require('../services/payments');
const statsSvc = require('../services/stats');
const barcode = require('../services/barcode');
const email = require('../services/email');
const settingsSvc = require('../services/settings');
const { getSetting } = require('../db');

const router = express.Router();

function fireAndForget(promiseFactory, label) {
  Promise.resolve()
    .then(promiseFactory)
    .catch((err) => console.error(`[async:${label}] ${err && err.message}`));
}

function publicParticipant(p) {
  return {
    reference: p.reference,
    first_name: p.first_name,
    last_name: p.last_name,
    email: p.email,
    phone: p.phone,
    gender: p.gender,
    is_worker: !!p.is_worker,
    department: p.department,
    group_name: p.group_name,
    fee_tier: p.fee_tier,
    fee_amount: p.fee_amount,
    payment_status: p.payment_status,
    checked_in: !!p.checked_in,
    created_at: p.created_at,
    verify_token: p.verify_token,
  };
}

// --- Public configuration (safe to expose) ---
router.get('/config', (req, res) => {
  res.json({
    event: {
      name: config.event.name,
      currency: config.event.currency,
      currencySymbol: config.event.currencySymbol,
      earlyBirdFee: config.event.earlyBirdFee,
      regularFee: config.event.regularFee,
      earlyBirdLimit: config.event.earlyBirdLimit,
      groups: config.event.groups,
    },
    bank: settingsSvc.bank(),
    departments: DEPARTMENTS,
    genders: GENDERS,
    registrationOpen: getSetting('registration_open', 'true') === 'true',
    counters: statsSvc.publicCounters(),
  });
});

router.get('/counters', (req, res) => {
  res.json(statsSvc.publicCounters());
});

// --- Registration ---
router.post('/register', registerLimiter, async (req, res) => {
  const v = validateRegistration(req.body);
  if (!v.ok) return res.status(422).json({ error: 'Please correct the highlighted fields.', fields: v.errors });

  let participant;
  try {
    participant = register(v.data);
  } catch (err) {
    if (err instanceof RegistrationError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('[register] unexpected', err);
    return res.status(500).json({ error: 'Something went wrong creating your registration. Please try again.' });
  }

  // Build QR for immediate display
  let qr = null;
  try {
    qr = await barcode.qrDataUrl(participant);
  } catch (e) {
    console.error('[register] qr', e.message);
  }

  // Send confirmation email in the background (don't block the response)
  fireAndForget(() => email.sendRegistrationEmail(participant), 'registration-email');

  res.status(201).json({
    participant: publicParticipant(participant),
    qr,
    ticketUrl: `${config.publicBaseUrl}/ticket/${participant.verify_token}`,
    bank: settingsSvc.bank(),
    currencySymbol: config.event.currencySymbol,
  });
});

// --- Find my ticket (reference + email) ---
router.post('/lookup', (req, res) => {
  const ref = String(req.body.reference || '').trim().toUpperCase();
  const mail = String(req.body.email || '').trim().toLowerCase();
  if (!ref || !mail) return res.status(400).json({ error: 'Enter both your reference and email.' });
  const p = participantsSvc.byReference(ref);
  if (!p || p.email.toLowerCase() !== mail) {
    return res.status(404).json({ error: 'No matching registration found. Check your reference and email.' });
  }
  res.json({ token: p.verify_token, ticketUrl: `${config.publicBaseUrl}/ticket/${p.verify_token}` });
});

// --- Ticket / status data by token ---
router.get('/ticket/:token', async (req, res) => {
  const p = participantsSvc.byToken(req.params.token);
  if (!p) return res.status(404).json({ error: 'Ticket not found.' });
  const receipt = paymentsSvc.currentReceipt(p.id);
  let qr = null;
  try { qr = await barcode.qrDataUrl(p); } catch { /* ignore */ }
  res.json({
    participant: publicParticipant(p),
    hasReceipt: !!receipt,
    receiptUploadedAt: receipt ? receipt.uploaded_at : null,
    qr,
    bank: settingsSvc.bank(),
    currencySymbol: config.event.currencySymbol,
    event: { name: config.event.name },
  });
});

// --- QR image by token (opaque; safe public) ---
router.get('/qr/:token.png', async (req, res) => {
  const p = participantsSvc.byToken(req.params.token);
  if (!p) return res.status(404).send('Not found');
  try {
    const png = await barcode.qrPngBuffer(p);
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(png);
  } catch (e) {
    res.status(500).send('QR error');
  }
});

// --- Upload payment receipt ---
router.post('/ticket/:token/receipt', uploadLimiter, receiptUpload, async (req, res) => {
  const p = participantsSvc.byToken(req.params.token);
  if (!p) return res.status(404).json({ error: 'Ticket not found.' });
  if (!req.file) return res.status(400).json({ error: 'Please attach your payment receipt.' });

  let sha = null;
  try { sha = await sha256File(req.file.path); } catch { /* ignore */ }

  paymentsSvc.attachReceipt(p.id, {
    stored_name: req.file.filename,
    original_name: req.file.originalname,
    mime: req.file.mimetype,
    size: req.file.size,
    sha256: sha,
  });

  const updated = participantsSvc.byId(p.id);

  // Notify the admin by email that a receipt is ready to verify
  // (background, logged + retried).
  fireAndForget(() => email.sendReceiptAdminEmail(updated), 'receipt-admin-email');

  res.json({
    ok: true,
    message: 'Receipt uploaded. Your payment is now pending verification.',
    participant: publicParticipant(updated),
  });
});

module.exports = router;
