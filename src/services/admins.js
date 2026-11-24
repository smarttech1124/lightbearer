'use strict';

const bcrypt = require('bcryptjs');
const { db } = require('../db');
const config = require('../config');

const ROLES = ['superadmin', 'admin', 'verifier'];

function byEmail(email) {
  return db.prepare('SELECT * FROM admins WHERE email = ?').get(String(email || '').toLowerCase().trim());
}
function byId(id) {
  return db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
}

function publicView(a) {
  if (!a) return null;
  return { id: a.id, email: a.email, name: a.name, role: a.role, active: !!a.active, last_login_at: a.last_login_at };
}

function create({ email, name, password, role = 'admin' }) {
  if (!ROLES.includes(role)) role = 'admin';
  const hash = bcrypt.hashSync(password, 12);
  const info = db
    .prepare('INSERT INTO admins (email, name, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(String(email).toLowerCase().trim(), name, hash, role);
  return byId(info.lastInsertRowid);
}

function verify(email, password) {
  const a = byEmail(email);
  if (!a || !a.active) return null;
  if (!bcrypt.compareSync(password, a.password_hash)) return null;
  db.prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?").run(a.id);
  return a;
}

function changePassword(id, newPassword) {
  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare("UPDATE admins SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hash, id);
}

function list() {
  return db.prepare('SELECT * FROM admins ORDER BY id ASC').all().map(publicView);
}

function setActive(id, active) {
  db.prepare("UPDATE admins SET active = ?, updated_at = datetime('now') WHERE id = ?").run(active ? 1 : 0, id);
  return publicView(byId(id));
}

/** Create the bootstrap admin from env on first run (idempotent). */
function ensureBootstrapAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  if (count > 0) return { created: false };
  const a = create({
    email: config.bootstrapAdmin.email,
    name: config.bootstrapAdmin.name,
    password: config.bootstrapAdmin.password,
    role: 'superadmin',
  });
  return { created: true, admin: publicView(a) };
}

module.exports = {
  ROLES,
  byEmail,
  byId,
  publicView,
  create,
  verify,
  changePassword,
  list,
  setActive,
  ensureBootstrapAdmin,
};
