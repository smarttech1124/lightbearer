'use strict';

const crypto = require('crypto');
const config = require('../config');
const { prisma } = require('../db');

/**
 * Pick the next group for a new participant: the least-full group, random
 * tie-break. Call inside the registration transaction (pass `tx`) so the counts
 * cannot shift under a concurrent registration.
 */
async function pickGroup(client = prisma) {
  const groups = config.event.groups;
  const rows = await client.participant.groupBy({ by: ['group_name'], _count: { _all: true } });
  const counts = new Map(groups.map((g) => [g, 0]));
  for (const r of rows) if (counts.has(r.group_name)) counts.set(r.group_name, r._count._all);

  let min = Infinity;
  for (const g of groups) min = Math.min(min, counts.get(g));
  const candidates = groups.filter((g) => counts.get(g) === min);
  return candidates[crypto.randomInt(0, candidates.length)];
}

async function groupStats() {
  const groups = config.event.groups;
  const [rows, confirmed, checkedIn, male, female] = await Promise.all([
    prisma.participant.groupBy({ by: ['group_name'], _count: { _all: true } }),
    prisma.participant.groupBy({ by: ['group_name'], where: { payment_status: 'confirmed' }, _count: { _all: true } }),
    prisma.participant.groupBy({ by: ['group_name'], where: { checked_in: true }, _count: { _all: true } }),
    prisma.participant.groupBy({ by: ['group_name'], where: { gender: 'Male' }, _count: { _all: true } }),
    prisma.participant.groupBy({ by: ['group_name'], where: { gender: 'Female' }, _count: { _all: true } }),
  ]);
  const map = (arr) => new Map(arr.map((r) => [r.group_name, r._count._all]));
  const total = map(rows), conf = map(confirmed), chk = map(checkedIn), m = map(male), f = map(female);

  return groups.map((g) => ({
    group: g,
    total: total.get(g) || 0,
    confirmed: conf.get(g) || 0,
    checked_in: chk.get(g) || 0,
    male: m.get(g) || 0,
    female: f.get(g) || 0,
  }));
}

module.exports = { pickGroup, groupStats };
