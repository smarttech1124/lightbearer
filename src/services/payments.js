'use strict';

const { db } = require('../db');

const markOldReceipts = db.prepare(
  'UPDATE receipts SET is_current = 0 WHERE participant_id = ?'
);
const insertReceipt = db.prepare(`
  INSERT INTO receipts (participant_id, stored_name, original_name, mime, size, sha256, is_current)
  VALUES (@participant_id, @stored_name, @original_name, @mime, @size, @sha256, 1)
`);
const setPending = db.prepare(`
  UPDATE participants
     SET payment_status = 'pending_verification',
         updated_at = datetime('now')
   WHERE id = ?
`);

/**
 * Attach an uploaded receipt and move the participant into 'pending_verification'.
 * Atomic so the receipt row and the status flip are always consistent.
 */
const attachReceiptTx = db.transaction((participantId, fileMeta) => {
  markOldReceipts.run(participantId);
  const info = insertReceipt.run({
    participant_id: participantId,
    stored_name: fileMeta.stored_name,
    original_name: fileMeta.original_name || null,
    mime: fileMeta.mime || null,
    size: fileMeta.size || null,
    sha256: fileMeta.sha256 || null,
  });
  setPending.run(participantId);
  return db.prepare('SELECT * FROM receipts WHERE id = ?').get(info.lastInsertRowid);
});

function attachReceipt(participantId, fileMeta) {
  return attachReceiptTx.immediate(participantId, fileMeta);
}

function currentReceipt(participantId) {
  return db
    .prepare(
      'SELECT * FROM receipts WHERE participant_id = ? AND is_current = 1 ORDER BY id DESC LIMIT 1'
    )
    .get(participantId);
}

function allReceipts(participantId) {
  return db
    .prepare('SELECT * FROM receipts WHERE participant_id = ? ORDER BY id DESC')
    .all(participantId);
}

function confirmPayment(participantId, adminId, amountPaid, remark) {
  db.prepare(`
    UPDATE participants
       SET payment_status = 'confirmed',
           amount_paid = ?,
           verified_by = ?,
           verified_at = datetime('now'),
           admin_remark = COALESCE(?, admin_remark),
           updated_at = datetime('now')
     WHERE id = ?
  `).run(amountPaid != null ? amountPaid : null, adminId, remark || null, participantId);
  return db.prepare('SELECT * FROM participants WHERE id = ?').get(participantId);
}

function rejectPayment(participantId, adminId, reason) {
  db.prepare(`
    UPDATE participants
       SET payment_status = 'rejected',
           verified_by = ?,
           verified_at = datetime('now'),
           admin_remark = ?,
           updated_at = datetime('now')
     WHERE id = ?
  `).run(adminId, reason || null, participantId);
  return db.prepare('SELECT * FROM participants WHERE id = ?').get(participantId);
}

module.exports = {
  attachReceipt,
  currentReceipt,
  allReceipts,
  confirmPayment,
  rejectPayment,
};
