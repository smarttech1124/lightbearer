'use strict';

const { prisma } = require('../db');
const config = require('../config');
const { groupStats } = require('./groups');
const notifications = require('./notifications');

const P = prisma.participant;

async function dashboard() {
  const [
    total, confirmed, pending, rejected, awaiting,
    earlyBird, regular, checkedIn, male, female, workers,
    revenueAgg, byDeptRaw, groups, notifStats,
  ] = await Promise.all([
    P.count(),
    P.count({ where: { payment_status: 'confirmed' } }),
    P.count({ where: { payment_status: 'pending_verification' } }),
    P.count({ where: { payment_status: 'rejected' } }),
    P.count({ where: { payment_status: 'awaiting_payment' } }),
    P.count({ where: { fee_tier: 'early_bird' } }),
    P.count({ where: { fee_tier: 'regular' } }),
    P.count({ where: { checked_in: true } }),
    P.count({ where: { gender: 'Male' } }),
    P.count({ where: { gender: 'Female' } }),
    P.count({ where: { is_worker: true } }),
    P.aggregate({ _sum: { amount_paid: true }, where: { payment_status: 'confirmed' } }),
    P.groupBy({ by: ['department'], where: { is_worker: true }, _count: { _all: true } }),
    groupStats(),
    notifications.stats(),
  ]);

  const departments = byDeptRaw
    .map((d) => ({ department: d.department || '(none)', n: d._count._all }))
    .sort((a, b) => b.n - a.n);

  return {
    total, confirmed, pending, rejected, awaiting,
    earlyBird, regular, checkedIn, male, female, workers,
    revenue: revenueAgg._sum.amount_paid || 0,
    groups,
    departments,
    notifications: notifStats,
    earlyBirdLimit: config.event.earlyBirdLimit,
    earlyBirdRemaining: Math.max(0, config.event.earlyBirdLimit - total),
  };
}

async function publicCounters() {
  const total = await P.count();
  const remaining = Math.max(0, config.event.earlyBirdLimit - total);
  return {
    registered: total,
    earlyBirdLimit: config.event.earlyBirdLimit,
    earlyBirdRemaining: remaining,
    earlyBirdActive: remaining > 0,
    currentFee: remaining > 0 ? config.event.earlyBirdFee : config.event.regularFee,
    earlyBirdFee: config.event.earlyBirdFee,
    regularFee: config.event.regularFee,
  };
}

module.exports = { dashboard, publicCounters };
