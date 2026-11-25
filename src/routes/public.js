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
const settingsSvc = require('../services/settings');
const barcode = require('../services/barcode');
const email = require('../services/email');
const { getSetting } = require('../db');

const router = express.Router();

function fireAndForget(promiseFactory, label) {
  Promise.resolve().then(promiseFactory).catch((err) => console.error(`[async:${label}] ${err && err.message}`));
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

// --- Public configuration ---
router.get('/config', async (req, res) => {
  const [bank, counters, open] = await Promise.all([
    settingsSvc.bank(),
    statsSvc.publicCounters(),
    getSetting('registration_open', 'true'),
  ]);
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
    bank,
    departments: DEPARTMENTS,
    genders: GENDERS,
    registrationOpen: open === 'true',
    counters,
  });
});

router.get('/counters', async (req, res) => {
  res.json(await statsSvc.publicCounters());
});

// --- Registration ---
router.post('/register', registerLimiter, async (req, res) => {
  const v = validateRegistration(req.body);
  if (!v.ok) return res.status(422).json({ error: 'Please correct the highlighted fields.', fields: v.errors });

  let participant;
  try {
    participant = await register(v.data);
  } catch (err) {
    if (err instanceof RegistrationError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('[register] unexpected', err);
    return res.status(500).json({ error: 'Something went wrong creating your registration. Please try again.' });
  }

  let qr = null;
  try { qr = await barcode.qrDataUrl(participant); } catch (e) { console.error('[register] qr', e.message); }

  fireAndForget(() => email.sendRegistrationEmail(participant), 'registration-email');

  res.status(201).json({
    participant: publicParticipant(participant),
    qr,
    ticketUrl: `${config.publicBaseUrl}/ticket/${participant.verify_token}`,
    bank: await settingsSvc.bank(),
    currencySymbol: config.event.currencySymbol,
  });
});

// --- Find my ticket ---
router.post('/lookup', async (req, res) => {
  const ref = String(req.body.reference || '').trim().toUpperCase();
  const mail = String(req.body.email || '').trim().toLowerCase();
  if (!ref || !mail) return res.status(400).json({ error: 'Enter both your reference and email.' });
  const p = await participantsSvc.byReference(ref);
  if (!p || p.email.toLowerCase() !== mail) {
    return res.status(404).json({ error: 'No matching registration found. Check your reference and email.' });
  }
  res.json({ token: p.verify_token, ticketUrl: `${config.publicBaseUrl}/ticket/${p.verify_token}` });
});

// --- Ticket / status data ---
router.get('/ticket/:token', async (req, res) => {
  const p = await participantsSvc.byToken(req.params.token);
  if (!p) return res.status(404).json({ error: 'Ticket not found.' });
  const [receipt, qr, bank] = await Promise.all([
    paymentsSvc.currentReceipt(p.id),
    barcode.qrDataUrl(p).catch(() => null),
    settingsSvc.bank(),
  ]);
  res.json({
    participant: publicParticipant(p),
    hasReceipt: !!receipt,
    receiptUploadedAt: receipt ? receipt.uploaded_at : null,
    qr,
    bank,
    currencySymbol: config.event.currencySymbol,
    event: { name: config.event.name },
  });
});

// --- QR image by token ---
router.get('/qr/:token.png', async (req, res) => {
  const p = await participantsSvc.byToken(req.params.token);
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
  const p = await participantsSvc.byToken(req.params.token);
  if (!p) return res.status(404).json({ error: 'Ticket not found.' });
  if (!req.file) return res.status(400).json({ error: 'Please attach your payment receipt.' });

  let sha = null;
  try { sha = await sha256File(req.file.path); } catch { /* ignore */ }

  await paymentsSvc.attachReceipt(p.id, {
    stored_name: req.file.filename,
    original_name: req.file.originalname,
    mime: req.file.mimetype,
    size: req.file.size,
    sha256: sha,
  });

  const updated = await participantsSvc.byId(p.id);
  fireAndForget(() => email.sendReceiptAdminEmail(updated), 'receipt-admin-email');

  res.json({
    ok: true,
    message: 'Receipt uploaded. Your payment is now pending verification.',
    participant: publicParticipant(updated),
  });
});

module.exports = router;
