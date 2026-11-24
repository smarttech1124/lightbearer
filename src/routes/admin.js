'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { requireAuth, requireRole } = require('../middleware/auth');
const participantsSvc = require('../services/participants');
const paymentsSvc = require('../services/payments');
const statsSvc = require('../services/stats');
const { groupStats } = require('../services/groups');
const notifications = require('../services/notifications');
const audit = require('../services/audit');
const exporter = require('../services/export');
const admins = require('../services/admins');
const email = require('../services/email');
const settingsSvc = require('../services/settings');
const { getSetting, setSetting } = require('../db');
const { isEmail } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

function fireAndForget(fn, label) {
  Promise.resolve().then(fn).catch((e) => console.error(`[async:${label}] ${e && e.message}`));
}

// ---------- Dashboard ----------
router.get('/stats', (req, res) => {
  res.json(statsSvc.dashboard());
});

// ---------- Participants ----------
router.get('/participants', (req, res) => {
  const result = participantsSvc.search({
    q: req.query.q,
    gender: req.query.gender,
    worker: req.query.worker,
    department: req.query.department,
    group: req.query.group,
    status: req.query.status,
    tier: req.query.tier,
    checkedIn: req.query.checkedIn,
    sort: req.query.sort,
    dir: req.query.dir,
    page: req.query.page,
    pageSize: req.query.pageSize,
  });
  res.json(result);
});

router.get('/participants/:id', (req, res) => {
  const p = participantsSvc.byId(req.params.id);
  if (!p) return res.status(404).json({ error: 'Participant not found.' });
  const receipts = paymentsSvc.allReceipts(p.id).map((r) => ({
    id: r.id,
    original_name: r.original_name,
    mime: r.mime,
    size: r.size,
    is_current: !!r.is_current,
    uploaded_at: r.uploaded_at,
    url: `/api/admin/receipts/${r.id}/file`,
  }));
  const verifier = p.verified_by ? admins.publicView(admins.byId(p.verified_by)) : null;
  const checker = p.checked_in_by ? admins.publicView(admins.byId(p.checked_in_by)) : null;
  res.json({ participant: p, receipts, verifier, checker });
});

router.patch('/participants/:id', requireRole('admin', 'superadmin'), (req, res) => {
  const p = participantsSvc.byId(req.params.id);
  if (!p) return res.status(404).json({ error: 'Participant not found.' });
  const fields = req.body || {};
  if (fields.group_name && !config.event.groups.includes(fields.group_name)) {
    return res.status(422).json({ error: 'Invalid group.' });
  }
  if (fields.gender && !['Male', 'Female'].includes(fields.gender)) {
    return res.status(422).json({ error: 'Invalid gender.' });
  }
  const updated = participantsSvc.update(p.id, fields);
  audit.log({ admin: req.admin, action: 'edit_participant', entity: 'participant', entityId: p.id, details: fields, ip: req.ip });
  res.json({ participant: updated });
});

router.post('/participants/:id/confirm', (req, res) => {
  const p = participantsSvc.byId(req.params.id);
  if (!p) return res.status(404).json({ error: 'Participant not found.' });
  const amount = req.body.amount_paid != null && req.body.amount_paid !== ''
    ? parseInt(req.body.amount_paid, 10)
    : p.fee_amount;
  const remark = req.body.remark || null;
  const updated = paymentsSvc.confirmPayment(p.id, req.admin.id, amount, remark);
  audit.log({ admin: req.admin, action: 'confirm_payment', entity: 'participant', entityId: p.id, details: { amount, remark }, ip: req.ip });
  fireAndForget(() => email.sendPaymentConfirmedEmail(updated), 'confirm-email');
  res.json({ participant: updated });
});

router.post('/participants/:id/reject', (req, res) => {
  const p = participantsSvc.byId(req.params.id);
  if (!p) return res.status(404).json({ error: 'Participant not found.' });
  const reason = req.body.reason || req.body.remark || null;
  const updated = paymentsSvc.rejectPayment(p.id, req.admin.id, reason);
  audit.log({ admin: req.admin, action: 'reject_payment', entity: 'participant', entityId: p.id, details: { reason }, ip: req.ip });
  fireAndForget(() => email.sendPaymentRejectedEmail(updated, reason), 'reject-email');
  res.json({ participant: updated });
});

router.post('/participants/:id/checkin', (req, res) => {
  const result = participantsSvc.checkIn(req.params.id, req.admin.id);
  if (!result.ok) {
    const msg = {
      not_found: 'Participant not found.',
      not_confirmed: 'Cannot check in: payment is not confirmed.',
      already: 'Already checked in.',
    }[result.reason] || 'Check-in failed.';
    return res.status(result.reason === 'not_found' ? 404 : 409).json({ error: msg, participant: result.participant });
  }
  audit.log({ admin: req.admin, action: 'check_in', entity: 'participant', entityId: req.params.id, ip: req.ip });
  res.json({ ok: true, participant: result.participant });
});

router.post('/participants/:id/undo-checkin', requireRole('admin', 'superadmin'), (req, res) => {
  const updated = participantsSvc.undoCheckIn(req.params.id);
  audit.log({ admin: req.admin, action: 'undo_check_in', entity: 'participant', entityId: req.params.id, ip: req.ip });
  res.json({ participant: updated });
});

// ---------- Receipts ----------
function serveReceipt(res, receipt) {
  const safe = path.basename(receipt.stored_name);
  const full = path.join(config.paths.uploads, safe);
  if (!full.startsWith(config.paths.uploads) || !fs.existsSync(full)) {
    return res.status(404).json({ error: 'Receipt file missing.' });
  }
  res.set('Content-Type', receipt.mime || 'application/octet-stream');
  res.set('Content-Disposition', `inline; filename="${(receipt.original_name || safe).replace(/"/g, '')}"`);
  fs.createReadStream(full).pipe(res);
}

router.get('/receipts/:receiptId/file', (req, res) => {
  const { db } = require('../db');
  const r = db.prepare('SELECT * FROM receipts WHERE id = ?').get(req.params.receiptId);
  if (!r) return res.status(404).json({ error: 'Receipt not found.' });
  serveReceipt(res, r);
});

// ---------- Verify / check-in by QR token ----------
router.get('/verify/:token', (req, res) => {
  const p = participantsSvc.byToken(req.params.token);
  if (!p) return res.status(404).json({ error: 'Invalid or unknown code.' });
  res.json({
    participant: p,
    eligible: p.payment_status === 'confirmed',
    alreadyCheckedIn: !!p.checked_in,
  });
});

router.post('/verify/:token/checkin', (req, res) => {
  const p = participantsSvc.byToken(req.params.token);
  if (!p) return res.status(404).json({ error: 'Invalid or unknown code.' });
  const result = participantsSvc.checkIn(p.id, req.admin.id);
  if (!result.ok) {
    const msg = {
      not_confirmed: 'Payment not confirmed — cannot check in.',
      already: 'This participant is already checked in.',
    }[result.reason] || 'Check-in failed.';
    return res.status(409).json({ error: msg, participant: result.participant });
  }
  audit.log({ admin: req.admin, action: 'check_in_qr', entity: 'participant', entityId: p.id, ip: req.ip });
  res.json({ ok: true, participant: result.participant });
});

// ---------- Groups ----------
router.get('/groups', (req, res) => {
  const stats = groupStats();
  const detail = req.query.group;
  let members = null;
  if (detail && config.event.groups.includes(detail)) {
    members = participantsSvc.search({ group: detail, pageSize: 200, sort: 'name', dir: 'asc' }).rows;
  }
  res.json({ groups: stats, members });
});

// ---------- Notifications ----------
router.get('/notifications', (req, res) => {
  res.json({ recent: notifications.recent(150), stats: notifications.stats() });
});

router.post('/notifications/:id/retry', requireRole('admin', 'superadmin'), (req, res) => {
  const { db } = require('../db');
  const n = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  if (!n) return res.status(404).json({ error: 'Notification not found.' });
  const p = n.participant_id ? participantsSvc.byId(n.participant_id) : null;
  if (!p) return res.status(400).json({ error: 'Cannot retry: participant missing.' });

  let job;
  if (n.kind === 'registration') job = () => email.sendRegistrationEmail(p);
  else if (n.kind === 'payment_confirmed') job = () => email.sendPaymentConfirmedEmail(p);
  else if (n.kind === 'payment_rejected') job = () => email.sendPaymentRejectedEmail(p, p.admin_remark);
  else if (n.kind === 'receipt_admin') job = () => email.sendReceiptAdminEmail(p);
  else return res.status(400).json({ error: 'This notification type cannot be retried.' });

  fireAndForget(job, 'notif-retry');
  audit.log({ admin: req.admin, action: 'retry_notification', entity: 'notification', entityId: n.id, ip: req.ip });
  res.json({ ok: true, message: 'Retry triggered.' });
});

// ---------- Audit ----------
router.get('/audit', requireRole('superadmin'), (req, res) => {
  res.json({ logs: audit.recent(300) });
});

// ---------- Exports ----------
router.get('/export', requireRole('admin', 'superadmin'), async (req, res) => {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  // Respect current filters; export up to everything matching (cap large)
  const result = participantsSvc.search({
    q: req.query.q,
    gender: req.query.gender,
    worker: req.query.worker,
    department: req.query.department,
    group: req.query.group,
    status: req.query.status,
    tier: req.query.tier,
    checkedIn: req.query.checkedIn,
    sort: req.query.sort || 'created_at',
    dir: req.query.dir || 'asc',
    page: 1,
    pageSize: 200,
  });
  // If more than one page matched, gather all pages.
  let rows = result.rows;
  if (result.pages > 1) {
    rows = [];
    for (let pg = 1; pg <= result.pages; pg++) {
      rows.push(...participantsSvc.search({
        q: req.query.q, gender: req.query.gender, worker: req.query.worker,
        department: req.query.department, group: req.query.group, status: req.query.status,
        tier: req.query.tier, checkedIn: req.query.checkedIn,
        sort: req.query.sort || 'created_at', dir: req.query.dir || 'asc',
        page: pg, pageSize: 200,
      }).rows);
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const base = `light-bearers-registrations-${stamp}`;
  audit.log({ admin: req.admin, action: 'export', details: { format, count: rows.length }, ip: req.ip });

  try {
    if (format === 'csv') {
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="${base}.csv"`);
      return res.send(exporter.toCsv(rows));
    }
    if (format === 'pdf') {
      const buf = await exporter.toPdf(rows, { title: req.query.group ? `Group: ${req.query.group}` : 'All participants' });
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `attachment; filename="${base}.pdf"`);
      return res.send(buf);
    }
    const buf = await exporter.toXlsx(rows);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="${base}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (e) {
    console.error('[export]', e);
    res.status(500).json({ error: 'Export failed.' });
  }
});

// ---------- Settings ----------
router.get('/settings', (req, res) => {
  res.json({
    registrationOpen: settingsSvc.registrationOpen(),
    event: config.event,
    bank: settingsSvc.bank(),
    notifyEmail: settingsSvc.notifyEmail(),
    mailProvider: config.mail.provider,
    mailEnabled: config.mail.enabled,
  });
});

router.post('/settings', requireRole('superadmin'), (req, res) => {
  const changed = [];
  if ('registrationOpen' in req.body) {
    settingsSvc.setRegistrationOpen(!!req.body.registrationOpen);
    changed.push('registration');
  }
  if (req.body.bank && typeof req.body.bank === 'object') {
    const b = req.body.bank;
    if ((b.name && String(b.name).trim().length < 2) || (b.accountNumber && !/^[0-9]{6,}$/.test(String(b.accountNumber).trim()))) {
      return res.status(422).json({ error: 'Enter a valid bank name and a numeric account number (6+ digits).' });
    }
    settingsSvc.setBank({ name: b.name, accountName: b.accountName, accountNumber: b.accountNumber });
    changed.push('bank');
  }
  if ('notifyEmail' in req.body) {
    const em = String(req.body.notifyEmail || '').trim();
    if (em && !isEmail(em)) return res.status(422).json({ error: 'Enter a valid notification email.' });
    settingsSvc.setNotifyEmail(em);
    changed.push('notifyEmail');
  }
  if (changed.length) audit.log({ admin: req.admin, action: 'update_settings', details: changed, ip: req.ip });
  res.json({
    registrationOpen: settingsSvc.registrationOpen(),
    bank: settingsSvc.bank(),
    notifyEmail: settingsSvc.notifyEmail(),
  });
});

// ---------- Admin management (superadmin) ----------
router.get('/admins', requireRole('superadmin'), (req, res) => {
  res.json({ admins: admins.list() });
});

router.post('/admins', requireRole('superadmin'), (req, res) => {
  const email_ = String(req.body.email || '').toLowerCase().trim();
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '');
  const role = req.body.role || 'admin';
  if (!isEmail(email_) || !name || password.length < 8) {
    return res.status(422).json({ error: 'Provide a valid email, name, and a password of at least 8 characters.' });
  }
  if (admins.byEmail(email_)) return res.status(409).json({ error: 'An admin with that email already exists.' });
  const a = admins.create({ email: email_, name, password, role });
  audit.log({ admin: req.admin, action: 'create_admin', entity: 'admin', entityId: a.id, details: { email: email_, role }, ip: req.ip });
  res.status(201).json({ admin: admins.publicView(a) });
});

router.post('/admins/:id/active', requireRole('superadmin'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.admin.id) return res.status(400).json({ error: 'You cannot deactivate your own account.' });
  const updated = admins.setActive(id, !!req.body.active);
  audit.log({ admin: req.admin, action: 'set_admin_active', entity: 'admin', entityId: id, details: { active: !!req.body.active }, ip: req.ip });
  res.json({ admin: updated });
});

module.exports = router;
