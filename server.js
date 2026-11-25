'use strict';

const config = require('./src/config');
const { prisma, ensureDefaults } = require('./src/db');
const admins = require('./src/services/admins');
const { createApp } = require('./src/app');

function banner() {
  const lines = [
    '',
    '  ✦  LIGHT BEARERS — Picnic Registration Portal',
    '  ' + '─'.repeat(46),
    `     Event        : ${config.event.name}`,
    `     URL          : ${config.publicBaseUrl}`,
    `     Admin portal : ${config.publicBaseUrl}/admin`,
    `     Early bird    : ${config.event.currencySymbol}${config.event.earlyBirdFee} (first ${config.event.earlyBirdLimit})  →  Regular ${config.event.currencySymbol}${config.event.regularFee}`,
    `     Database     : PostgreSQL (Prisma)`,
    `     Email         : ${config.mail.provider === 'resend' ? 'Resend' : 'console mode (not delivering)'}`,
    `     Notify admin  : ${config.notifyEmailDefault || '(unset)'} (email)`,
    '',
  ];
  console.log(lines.join('\n'));
}

async function main() {
  // Verify the database connection early with a clear message if it fails.
  try {
    await prisma.$connect();
  } catch (err) {
    console.error('\n  [fatal] Could not connect to the database (DATABASE_URL).');
    console.error('  ' + err.message + '\n');
    process.exit(1);
  }

  await ensureDefaults();

  const boot = await admins.ensureBootstrapAdmin();
  if (boot.created) {
    console.log(`  [setup] Bootstrap admin created: ${boot.admin.email}`);
    console.log('  [setup] Log in and change the password immediately.');
  }

  if (config.security.jwtSecretIsEphemeral) {
    console.warn('  [warn] JWT_SECRET is not set — using an ephemeral secret. Admin sessions reset on restart. Set JWT_SECRET for production.');
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    banner();
    console.log(`  Server listening on port ${config.port}\n`);
  });

  const shutdown = async (sig) => {
    console.log(`\n  ${sig} received — shutting down gracefully...`);
    server.close(async () => {
      await prisma.$disconnect().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[startup] fatal', err);
  process.exit(1);
});
