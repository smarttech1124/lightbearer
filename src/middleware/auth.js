'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const admins = require('../services/admins');

const COOKIE = 'lb_admin';

function issueToken(admin) {
  return jwt.sign(
    { sub: admin.id, email: admin.email, role: admin.role },
    config.security.jwtSecret,
    { expiresIn: `${config.security.sessionHours}h` }
  );
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProd,
    maxAge: config.security.sessionHours * 3600 * 1000,
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function readAdmin(req) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.security.jwtSecret);
    const admin = admins.byId(payload.sub);
    if (!admin || !admin.active) return null;
    return admin;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const admin = readAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Authentication required.' });
  req.admin = admin;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ error: 'Authentication required.' });
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = {
  COOKIE,
  issueToken,
  setAuthCookie,
  clearAuthCookie,
  readAdmin,
  requireAuth,
  requireRole,
};
