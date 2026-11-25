'use strict';

const { prisma } = require('../db');

async function create({ participantId = null, channel, kind, recipient = null, payload = null }) {
  const n = await prisma.notification.create({
    data: {
      participant_id: participantId,
      channel,
      kind,
      recipient,
      status: 'pending',
      payload: payload ? JSON.stringify(payload) : null,
    },
  });
  return n.id;
}

function markSent(id) {
  return prisma.notification.update({
    where: { id: Number(id) },
    data: { status: 'sent', attempts: { increment: 1 }, last_error: null },
  });
}

function markFailed(id, error) {
  const msg = String(error && error.message ? error.message : error).slice(0, 500);
  return prisma.notification.update({
    where: { id: Number(id) },
    data: { status: 'failed', attempts: { increment: 1 }, last_error: msg },
  });
}

async function recent(limit = 100) {
  const rows = await prisma.notification.findMany({
    orderBy: { id: 'desc' },
    take: limit,
    include: { participant: { select: { reference: true, first_name: true, last_name: true } } },
  });
  return rows.map((n) => ({
    ...n,
    reference: n.participant ? n.participant.reference : null,
    first_name: n.participant ? n.participant.first_name : null,
    last_name: n.participant ? n.participant.last_name : null,
  }));
}

function failed(limit = 100) {
  return prisma.notification.findMany({ where: { status: 'failed' }, orderBy: { id: 'desc' }, take: limit });
}

async function stats() {
  const [sent, pending, failedCount] = await Promise.all([
    prisma.notification.count({ where: { status: 'sent' } }),
    prisma.notification.count({ where: { status: 'pending' } }),
    prisma.notification.count({ where: { status: 'failed' } }),
  ]);
  return { sent, pending, failed: failedCount };
}

module.exports = { create, markSent, markFailed, recent, failed, stats };
