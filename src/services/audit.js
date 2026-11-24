'use strict';

const { db } = require('../db');

const insert = db.prepare(`
  INSERT INTO audit_logs (admin_id, admin_email, action, entity, entity_id, details, ip)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function log({ admin, action, entity = null, entityId = null, details = null, ip = null }) {
  insert.run(
    admin ? admin.id : null,
    admin ? admin.email : null,
    action,
    entity,
    entityId != null ? String(entityId) : null,
    details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
    ip
  );
}

function recent(limit = 200) {
  return db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit);
}

module.exports = { log, recent };
