'use strict';

const express = require('express');
const { loginLimiter } = require('../middleware/security');
const { issueToken, setAuthCookie, clearAuthCookie, requireAuth } = require('../middleware/auth');
const admins = require('../services/admins');
const audit = require('../services/audit');
const { isEmail } = require('../utils/helpers');

const router = express.Router();

router.post('/login', loginLimiter, (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const password = String(req.body.password || '');
  if (!isEmail(email) || !password) {
    return res.status(400).json({ error: 'Enter your email and password.' });
  }
  const admin = admins.verify(email, password);
  if (!admin) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const token = issueToken(admin);
  setAuthCookie(res, token);
  audit.log({ admin, action: 'login', ip: req.ip });
  res.json({ admin: admins.publicView(admin) });
});

router.post('/logout', requireAuth, (req, res) => {
  audit.log({ admin: req.admin, action: 'logout', ip: req.ip });
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ admin: admins.publicView(req.admin) });
});

router.post('/change-password', requireAuth, (req, res) => {
  const current = String(req.body.current_password || '');
  const next = String(req.body.new_password || '');
  if (!admins.verify(req.admin.email, current)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  if (next.length < 8) {
    return res.status(422).json({ error: 'New password must be at least 8 characters.' });
  }
  admins.changePassword(req.admin.id, next);
  audit.log({ admin: req.admin, action: 'change_password', ip: req.ip });
  res.json({ ok: true });
});

module.exports = router;
