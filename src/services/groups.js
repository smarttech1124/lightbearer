'use strict';

const crypto = require('crypto');
const config = require('../config');
const { db } = require('../db');

/**
 * Choose the next group for a new participant.
 *
 * Strategy: pick the group(s) with the SMALLEST current membership (keeps all
 * groups balanced as registrations grow — capacity scales automatically), then
 * break ties RANDOMLY so allocation is not deterministic/predictable.
 *
 * Must be called INSIDE the same transaction as the participant insert so the
 * membership counts it reads cannot be changed by a concurrent registration.
 */
function pickGroup() {
  const groups = config.event.groups;

  // Current counts per configured group (missing groups => 0)
  const rows = db
    .prepare('SELECT group_name, COUNT(*) AS n FROM participants GROUP BY group_name')
    .all();
  const counts = new Map(groups.map((g) => [g, 0]));
  for (const r of rows) {
    if (counts.has(r.group_name)) counts.set(r.group_name, r.n);
  }

  let min = Infinity;
  for (const g of groups) min = Math.min(min, counts.get(g));

  const candidates = groups.filter((g) => counts.get(g) === min);
  // cryptographically-random tie break
  const idx = crypto.randomInt(0, candidates.length);
  return candidates[idx];
}

function groupStats() {
  const groups = config.event.groups;
  const rows = db
    .prepare(
      `SELECT group_name,
              COUNT(*) AS total,
              SUM(CASE WHEN payment_status='confirmed' THEN 1 ELSE 0 END) AS confirmed,
              SUM(CASE WHEN checked_in=1 THEN 1 ELSE 0 END) AS checked_in,
              SUM(CASE WHEN gender='Male' THEN 1 ELSE 0 END) AS male,
              SUM(CASE WHEN gender='Female' THEN 1 ELSE 0 END) AS female
         FROM participants GROUP BY group_name`
    )
    .all();
  const byName = new Map(rows.map((r) => [r.group_name, r]));
  return groups.map((g) => {
    const r = byName.get(g) || {};
    return {
      group: g,
      total: r.total || 0,
      confirmed: r.confirmed || 0,
      checked_in: r.checked_in || 0,
      male: r.male || 0,
      female: r.female || 0,
    };
  });
}

module.exports = { pickGroup, groupStats };
