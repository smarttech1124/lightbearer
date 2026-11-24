'use strict';

const { db } = require('../db');

const insert = db.prepare(`
  INSERT INTO notifications (participant_id, channel, kind, recipient, status, payload)
  VALUES (?, ?, ?, ?, 'pending', ?)
`);

function create({ participantId = null, channel, kind, recipient = null, payload = null }) {
  const info = insert.run(
    participantId,
    channel,
    kind,
    recipient,
    payload ? JSON.stringify(payload) : null
  );
  return info.lastInsertRowid;
}

function markSent(id) {
  db.prepare(
    `UPDATE notifications
        SET status='sent', attempts = attempts + 1, last_error = NULL, updated_at = datetime('now')
      WHERE id = ?`
  ).run(id);
}

function markFailed(id, error) {
  db.prepare(
    `UPDATE notifications
        SET status='failed', attempts = attempts + 1, last_error = ?, updated_at = datetime('now')
      WHERE id = ?`
  ).run(String(error && error.message ? error.message : error).slice(0, 500), id);
}

function recent(limit = 100) {
  return db
    .prepare(
      `SELECT n.*, p.reference, p.first_name, p.last_name
         FROM notifications n
         LEFT JOIN participants p ON p.id = n.participant_id
        ORDER BY n.id DESC LIMIT ?`
    )
    .all(limit);
}

function failed(limit = 100) {
  return db
    .prepare(`SELECT * FROM notifications WHERE status='failed' ORDER BY id DESC LIMIT ?`)
    .all(limit);
}

function stats() {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS sent,
         SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
       FROM notifications`
    )
    .get();
  return { sent: row.sent || 0, pending: row.pending || 0, failed: row.failed || 0 };
}

module.exports = { create, markSent, markFailed, recent, failed, stats };
