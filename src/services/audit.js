'use strict';

const { prisma } = require('../db');

async function log({ admin, action, entity = null, entityId = null, details = null, ip = null }) {
  try {
    await prisma.auditLog.create({
      data: {
        admin_id: admin ? admin.id : null,
        admin_email: admin ? admin.email : null,
        action,
        entity,
        entity_id: entityId != null ? String(entityId) : null,
        details: details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
        ip,
      },
    });
  } catch (e) {
    console.error('[audit] failed to log:', e.message);
  }
}

function recent(limit = 200) {
  return prisma.auditLog.findMany({ orderBy: { id: 'desc' }, take: limit });
}

module.exports = { log, recent };
