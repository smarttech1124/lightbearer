'use strict';

const { db } = require('../db');
const config = require('../config');
const { groupStats } = require('./groups');
const notifications = require('./notifications');

function dashboard() {
  const base = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN payment_status='confirmed' THEN 1 ELSE 0 END) AS confirmed,
         SUM(CASE WHEN payment_status='pending_verification' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN payment_status='rejected' THEN 1 ELSE 0 END) AS rejected,
         SUM(CASE WHEN payment_status='awaiting_payment' THEN 1 ELSE 0 END) AS awaiting,
         SUM(CASE WHEN fee_tier='early_bird' THEN 1 ELSE 0 END) AS early_bird,
         SUM(CASE WHEN fee_tier='regular' THEN 1 ELSE 0 END) AS regular,
         SUM(CASE WHEN checked_in=1 THEN 1 ELSE 0 END) AS checked_in,
         SUM(CASE WHEN gender='Male' THEN 1 ELSE 0 END) AS male,
         SUM(CASE WHEN gender='Female' THEN 1 ELSE 0 END) AS female,
         SUM(CASE WHEN is_worker=1 THEN 1 ELSE 0 END) AS workers,
         SUM(CASE WHEN payment_status='confirmed' THEN amount_paid ELSE 0 END) AS revenue
       FROM participants`
    )
    .get();

  const byDept = db
    .prepare(
      `SELECT COALESCE(department,'(none)') AS department, COUNT(*) AS n
         FROM participants WHERE is_worker=1 GROUP BY department ORDER BY n DESC`
    )
    .all();

  return {
    total: base.total || 0,
    confirmed: base.confirmed || 0,
    pending: base.pending || 0,
    rejected: base.rejected || 0,
    awaiting: base.awaiting || 0,
    earlyBird: base.early_bird || 0,
    regular: base.regular || 0,
    checkedIn: base.checked_in || 0,
    male: base.male || 0,
    female: base.female || 0,
    workers: base.workers || 0,
    revenue: base.revenue || 0,
    groups: groupStats(),
    departments: byDept,
    notifications: notifications.stats(),
    earlyBirdLimit: config.event.earlyBirdLimit,
    earlyBirdRemaining: Math.max(0, config.event.earlyBirdLimit - (base.total || 0)),
  };
}

// Lightweight public figures for the landing page (no PII).
function publicCounters() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM participants').get();
  const total = row.n || 0;
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
