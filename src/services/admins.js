'use strict';

const bcrypt = require('bcryptjs');
const { prisma } = require('../db');
const config = require('../config');

const ROLES = ['superadmin', 'admin', 'verifier'];

function byEmail(email) {
  return prisma.admin.findUnique({ where: { email: String(email || '').toLowerCase().trim() } });
}
function byId(id) {
  return prisma.admin.findUnique({ where: { id: Number(id) } });
}

function publicView(a) {
  if (!a) return null;
  return { id: a.id, email: a.email, name: a.name, role: a.role, active: !!a.active, last_login_at: a.last_login_at };
}

function create({ email, name, password, role = 'admin' }) {
  if (!ROLES.includes(role)) role = 'admin';
  return prisma.admin.create({
    data: {
      email: String(email).toLowerCase().trim(),
      name,
      password_hash: bcrypt.hashSync(password, 12),
      role,
    },
  });
}

async function verify(email, password) {
  const a = await byEmail(email);
  if (!a || !a.active) return null;
  if (!bcrypt.compareSync(password, a.password_hash)) return null;
  await prisma.admin.update({ where: { id: a.id }, data: { last_login_at: new Date() } });
  return a;
}

function changePassword(id, newPassword) {
  return prisma.admin.update({
    where: { id: Number(id) },
    data: { password_hash: bcrypt.hashSync(newPassword, 12) },
  });
}

async function list() {
  const rows = await prisma.admin.findMany({ orderBy: { id: 'asc' } });
  return rows.map(publicView);
}

async function setActive(id, active) {
  const a = await prisma.admin.update({ where: { id: Number(id) }, data: { active: !!active } });
  return publicView(a);
}

/** Create the bootstrap admin from env on first run (idempotent). */
async function ensureBootstrapAdmin() {
  const count = await prisma.admin.count();
  if (count > 0) return { created: false };
  const a = await create({
    email: config.bootstrapAdmin.email,
    name: config.bootstrapAdmin.name,
    password: config.bootstrapAdmin.password,
    role: 'superadmin',
  });
  return { created: true, admin: publicView(a) };
}

module.exports = { ROLES, byEmail, byId, publicView, create, verify, changePassword, list, setActive, ensureBootstrapAdmin };
