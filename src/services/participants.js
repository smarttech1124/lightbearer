'use strict';

const { db } = require('../db');
const config = require('../config');

function byId(id) {
  return db.prepare('SELECT * FROM participants WHERE id = ?').get(id);
}
function byReference(ref) {
  return db.prepare('SELECT * FROM participants WHERE reference = ?').get(String(ref || '').trim().toUpperCase());
}
function byToken(token) {
  return db.prepare('SELECT * FROM participants WHERE verify_token = ?').get(token);
}

const ALLOWED_SORT = {
  created_at: 'created_at',
  name: 'last_name',
  reference: 'reference',
  group: 'group_name',
  status: 'payment_status',
};

/**
 * Search + filter + paginate participants for the admin dashboard.
 */
function search(opts = {}) {
  const where = [];
  const params = {};

  if (opts.q) {
    where.push(`(
      first_name LIKE @q OR last_name LIKE @q OR email LIKE @q
      OR phone LIKE @q OR reference LIKE @q
      OR (first_name || ' ' || last_name) LIKE @q
    )`);
    params.q = `%${String(opts.q).trim()}%`;
  }
  if (opts.gender && ['Male', 'Female'].includes(opts.gender)) {
    where.push('gender = @gender');
    params.gender = opts.gender;
  }
  if (opts.worker === 'yes' || opts.worker === 'no') {
    where.push('is_worker = @worker');
    params.worker = opts.worker === 'yes' ? 1 : 0;
  }
  if (opts.department) {
    where.push('department = @department');
    params.department = opts.department;
  }
  if (opts.group && config.event.groups.includes(opts.group)) {
    where.push('group_name = @group');
    params.group = opts.group;
  }
  if (opts.status) {
    where.push('payment_status = @status');
    params.status = opts.status;
  }
  if (opts.tier && ['early_bird', 'regular'].includes(opts.tier)) {
    where.push('fee_tier = @tier');
    params.tier = opts.tier;
  }
  if (opts.checkedIn === 'yes' || opts.checkedIn === 'no') {
    where.push('checked_in = @checkedIn');
    params.checkedIn = opts.checkedIn === 'yes' ? 1 : 0;
  }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const sortCol = ALLOWED_SORT[opts.sort] || 'created_at';
  const dir = String(opts.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(opts.pageSize, 10) || 25));
  const offset = (page - 1) * pageSize;

  const total = db.prepare(`SELECT COUNT(*) AS n FROM participants ${whereSql}`).get(params).n;
  const rows = db
    .prepare(
      `SELECT * FROM participants ${whereSql} ORDER BY ${sortCol} ${dir}, id ${dir} LIMIT @_limit OFFSET @_offset`
    )
    .all({ ...params, _limit: pageSize, _offset: offset });

  return { rows, total, page, pageSize, pages: Math.ceil(total / pageSize) || 1 };
}

function all() {
  return db.prepare('SELECT * FROM participants ORDER BY created_at ASC, id ASC').all();
}

const EDITABLE = ['first_name', 'last_name', 'phone', 'gender', 'is_worker', 'department', 'group_name', 'admin_remark'];

function update(id, fields) {
  const sets = [];
  const params = { id };
  for (const key of EDITABLE) {
    if (key in fields && fields[key] !== undefined) {
      sets.push(`${key} = @${key}`);
      params[key] = key === 'is_worker' ? (fields[key] ? 1 : 0) : fields[key];
    }
  }
  if (!sets.length) return byId(id);
  // keep department consistent with worker flag
  if ('is_worker' in fields && !fields.is_worker) {
    sets.push('department = NULL');
  }
  db.prepare(
    `UPDATE participants SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = @id`
  ).run(params);
  return byId(id);
}

function checkIn(id, adminId) {
  const p = byId(id);
  if (!p) return { ok: false, reason: 'not_found' };
  if (p.payment_status !== 'confirmed') {
    return { ok: false, reason: 'not_confirmed', participant: p };
  }
  if (p.checked_in) {
    return { ok: false, reason: 'already', participant: p };
  }
  db.prepare(
    `UPDATE participants SET checked_in = 1, checked_in_at = datetime('now'), checked_in_by = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(adminId, id);
  return { ok: true, participant: byId(id) };
}

function undoCheckIn(id) {
  db.prepare(
    `UPDATE participants SET checked_in = 0, checked_in_at = NULL, checked_in_by = NULL, updated_at = datetime('now') WHERE id = ?`
  ).run(id);
  return byId(id);
}

module.exports = {
  byId,
  byReference,
  byToken,
  search,
  all,
  update,
  checkIn,
  undoCheckIn,
};
