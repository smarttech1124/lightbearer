'use strict';

/**
 * Create or reset an admin account:
 *   node src/scripts/seedAdmin.js <email> <name> <password> [role]
 */
const { prisma } = require('../db');
const admins = require('../services/admins');

(async () => {
  const [, , email, name, password, role = 'admin'] = process.argv;
  if (!email || !name || !password) {
    console.log('Usage: node src/scripts/seedAdmin.js <email> <name> <password> [superadmin|admin|verifier]');
    process.exit(1);
  }
  const existing = await admins.byEmail(email);
  if (existing) {
    await admins.changePassword(existing.id, password);
    await prisma.admin.update({ where: { id: existing.id }, data: { name, role, active: true } });
    console.log(`Updated admin: ${email} (role=${role})`);
  } else {
    const a = await admins.create({ email, name, password, role });
    console.log(`Created admin: ${a.email} (role=${a.role})`);
  }
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
