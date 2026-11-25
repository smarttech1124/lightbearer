'use strict';

const { prisma } = require('../db');

/**
 * Attach an uploaded receipt and move the participant into 'pending_verification'
 * — atomic so the receipt row and status flip stay consistent.
 */
async function attachReceipt(participantId, fileMeta) {
  const id = Number(participantId);
  const [, receipt] = await prisma.$transaction([
    prisma.receipt.updateMany({ where: { participant_id: id }, data: { is_current: false } }),
    prisma.receipt.create({
      data: {
        participant_id: id,
        stored_name: fileMeta.stored_name,
        original_name: fileMeta.original_name || null,
        mime: fileMeta.mime || null,
        size: fileMeta.size || null,
        sha256: fileMeta.sha256 || null,
        is_current: true,
      },
    }),
    prisma.participant.update({ where: { id }, data: { payment_status: 'pending_verification' } }),
  ]);
  return receipt;
}

function currentReceipt(participantId) {
  return prisma.receipt.findFirst({
    where: { participant_id: Number(participantId), is_current: true },
    orderBy: { id: 'desc' },
  });
}

function allReceipts(participantId) {
  return prisma.receipt.findMany({ where: { participant_id: Number(participantId) }, orderBy: { id: 'desc' } });
}

function confirmPayment(participantId, adminId, amountPaid, remark) {
  const data = {
    payment_status: 'confirmed',
    amount_paid: amountPaid != null ? amountPaid : null,
    verified_by: adminId,
    verified_at: new Date(),
  };
  if (remark) data.admin_remark = remark;
  return prisma.participant.update({ where: { id: Number(participantId) }, data });
}

function rejectPayment(participantId, adminId, reason) {
  return prisma.participant.update({
    where: { id: Number(participantId) },
    data: {
      payment_status: 'rejected',
      verified_by: adminId,
      verified_at: new Date(),
      admin_remark: reason || null,
    },
  });
}

module.exports = { attachReceipt, currentReceipt, allReceipts, confirmPayment, rejectPayment };
