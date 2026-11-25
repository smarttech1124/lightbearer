'use strict';

const { prisma, IS_SQLITE } = require('../db');
const config = require('../config');

function byId(id) {
  return prisma.participant.findUnique({ where: { id: Number(id) } });
}
function byReference(ref) {
  return prisma.participant.findUnique({ where: { reference: String(ref || '').trim().toUpperCase() } });
}
function byToken(token) {
  return prisma.participant.findUnique({ where: { verify_token: String(token || '') } });
}

const ALLOWED_SORT = {
  created_at: 'created_at',
  name: 'last_name',
  reference: 'reference',
  group: 'group_name',
  status: 'payment_status',
};

// case-insensitive contains (mode is Postgres-only; sqlite LIKE is already CI for ASCII)
function ci(value) {
  return IS_SQLITE ? { contains: value } : { contains: value, mode: 'insensitive' };
}

async function search(opts = {}) {
  const AND = [];

  if (opts.q) {
    const q = String(opts.q).trim();
    AND.push({
      OR: [
        { first_name: ci(q) },
        { last_name: ci(q) },
        { email: ci(q) },
        { phone: { contains: q } },
        { reference: ci(q) },
      ],
    });
  }
  if (opts.gender && ['Male', 'Female'].includes(opts.gender)) AND.push({ gender: opts.gender });
  if (opts.worker === 'yes' || opts.worker === 'no') AND.push({ is_worker: opts.worker === 'yes' });
  if (opts.department) AND.push({ department: opts.department });
  if (opts.group && config.event.groups.includes(opts.group)) AND.push({ group_name: opts.group });
  if (opts.status) AND.push({ payment_status: opts.status });
  if (opts.tier && ['early_bird', 'regular'].includes(opts.tier)) AND.push({ fee_tier: opts.tier });
  if (opts.checkedIn === 'yes' || opts.checkedIn === 'no') AND.push({ checked_in: opts.checkedIn === 'yes' });

  const where = AND.length ? { AND } : {};
  const sortCol = ALLOWED_SORT[opts.sort] || 'created_at';
  const dir = String(opts.dir).toLowerCase() === 'asc' ? 'asc' : 'desc';

  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(opts.pageSize, 10) || 25));

  const [total, rows] = await Promise.all([
    prisma.participant.count({ where }),
    prisma.participant.findMany({
      where,
      orderBy: [{ [sortCol]: dir }, { id: dir }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { rows, total, page, pageSize, pages: Math.ceil(total / pageSize) || 1 };
}

function all() {
  return prisma.participant.findMany({ orderBy: [{ created_at: 'asc' }, { id: 'asc' }] });
}

const EDITABLE = ['first_name', 'last_name', 'phone', 'gender', 'is_worker', 'department', 'group_name', 'admin_remark'];

async function update(id, fields) {
  const data = {};
  for (const key of EDITABLE) {
    if (key in fields && fields[key] !== undefined) {
      data[key] = key === 'is_worker' ? !!fields[key] : fields[key];
    }
  }
  if ('is_worker' in fields && !fields.is_worker) data.department = null;
  if (!Object.keys(data).length) return byId(id);
  return prisma.participant.update({ where: { id: Number(id) }, data });
}

async function checkIn(id, adminId) {
  const p = await byId(id);
  if (!p) return { ok: false, reason: 'not_found' };
  if (p.payment_status !== 'confirmed') return { ok: false, reason: 'not_confirmed', participant: p };
  if (p.checked_in) return { ok: false, reason: 'already', participant: p };
  const updated = await prisma.participant.update({
    where: { id: p.id },
    data: { checked_in: true, checked_in_at: new Date(), checked_in_by: adminId },
  });
  return { ok: true, participant: updated };
}

function undoCheckIn(id) {
  return prisma.participant.update({
    where: { id: Number(id) },
    data: { checked_in: false, checked_in_at: null, checked_in_by: null },
  });
}

module.exports = { byId, byReference, byToken, search, all, update, checkIn, undoCheckIn };
