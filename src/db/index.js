'use strict';

const { PrismaClient, Prisma } = require('@prisma/client');

// Single shared Prisma client (avoids exhausting connections on hot reload).
const globalForPrisma = globalThis;
const prisma =
  globalForPrisma.__lbPrisma ||
  new PrismaClient({ log: process.env.PRISMA_LOG ? ['query', 'warn', 'error'] : ['warn', 'error'] });
if (!globalForPrisma.__lbPrisma) globalForPrisma.__lbPrisma = prisma;

// SQLite does not support explicit isolation levels; Postgres does and we rely
// on Serializable for the atomic early-bird/group allocation.
const IS_SQLITE = String(process.env.DATABASE_URL || '').startsWith('file:');

async function getSetting(key, def = null) {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? row.value : def;
}

async function setSetting(key, value) {
  const v = value == null ? null : String(value);
  await prisma.setting.upsert({
    where: { key },
    update: { value: v },
    create: { key, value: v },
  });
  return v;
}

// Seed defaults that must exist at runtime.
async function ensureDefaults() {
  const existing = await prisma.setting.findUnique({ where: { key: 'registration_open' } });
  if (!existing) await prisma.setting.create({ data: { key: 'registration_open', value: 'true' } });
}

module.exports = { prisma, Prisma, IS_SQLITE, getSetting, setSetting, ensureDefaults };
