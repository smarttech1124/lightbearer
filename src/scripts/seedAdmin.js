'use strict';

/**
 * Create or reset an admin account from the command line.
 *   node src/scripts/seedAdmin.js <email> <name> <password> [role]
 * If the admin exists, the password/name/role are updated.
 */
const { migrate, db } = require('../db');
const admins = require('../services/admins');

migrate();

const [, , email, name, password, role = 'admin'] = process.argv;

if (!email || !name || !password) {
  console.log('Usage: node src/scripts/seedAdmin.js <email> <name> <password> [superadmin|admin|verifier]');
  process.exit(1);
}

const existing = admins.byEmail(email);
if (existing) {
  admins.changePassword(existing.id, password);
  db.prepare('UPDATE admins SET name = ?, role = ?, active = 1 WHERE id = ?').run(name, role, existing.id);
  console.log(`Updated admin: ${email} (role=${role})`);
} else {
  const a = admins.create({ email, name, password, role });
  console.log(`Created admin: ${a.email} (role=${a.role})`);
}
process.exit(0);
