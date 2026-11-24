/* Light Bearers — Admin dashboard SPA */
(function () {
  'use strict';
  const { api, toast, money, escapeHtml, statusMeta } = window.LB;
  const $ = (id) => document.getElementById(id);
  const sym = '₦';

  let me = null;
  let cfg = null;
  let pState = { q: '', gender: '', worker: '', department: '', group: '', status: '', tier: '', checkedIn: '', sort: 'created_at', dir: 'desc', page: 1, pageSize: 25 };

  const SYM = () => (cfg && cfg.event.currencySymbol) || sym;

  /* ---------------- Auth / bootstrap ---------------- */
  async function boot() {
    const res = await api('/api/auth/me');
    if (res.ok) { me = res.data.admin; await afterLogin(); }
    else showLogin();
  }

  function showLogin() {
    $('app-view').classList.add('util-hidden');
    $('login-view').classList.remove('util-hidden');
  }

  async function afterLogin() {
    $('login-view').classList.add('util-hidden');
    $('app-view').classList.remove('util-hidden');
    $('who-name').textContent = me.name;
    $('who-role').textContent = me.role;
    $('who-avatar').textContent = (me.name || me.email)[0].toUpperCase();
    if (me.role === 'superadmin') $('nav-audit').classList.remove('util-hidden');
    const cf = await api('/api/config');
    if (cf.ok) cfg = cf.data;
    // honour ?return= deep link after login (e.g. from QR verify page)
    const ret = new URLSearchParams(location.search).get('return');
    if (ret && ret.startsWith('/')) { location.href = ret; return; }
    switchView('dashboard');
    refreshNotifBadge();
  }

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('login-btn'); const label = btn.querySelector('.btn-label');
    btn.disabled = true; const o = label.textContent; label.innerHTML = '<span class="spinner"></span> Signing in…';
    const { ok, data } = await api('/api/auth/login', { method: 'POST', body: { email: $('login-email').value.trim(), password: $('login-password').value } });
    if (ok) { me = data.admin; await afterLogin(); }
    else { btn.disabled = false; label.textContent = o; toast(data.error || 'Login failed.', 'error'); }
  });

  $('logout-btn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    me = null; location.href = '/admin';
  });

  /* ---------------- Nav ---------------- */
  function switchView(view) {
    document.querySelectorAll('.nav-item[data-view]').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
    closeSidebar();
    const render = { dashboard: viewDashboard, participants: viewParticipants, groups: viewGroups, checkin: viewCheckin, notifications: viewNotifications, settings: viewSettings, audit: viewAudit }[view];
    if (render) render();
  }
  document.querySelectorAll('.nav-item[data-view]').forEach((n) => n.addEventListener('click', () => switchView(n.dataset.view)));

  $('menu-toggle').addEventListener('click', () => { $('sidebar').classList.add('open'); $('sidebar-backdrop').classList.add('show'); });
  function closeSidebar() { $('sidebar').classList.remove('open'); $('sidebar-backdrop').classList.remove('show'); }
  $('sidebar-backdrop').addEventListener('click', closeSidebar);

  /* ---------------- Modal ---------------- */
  function openModal(html) { $('modal').innerHTML = html; $('modal-overlay').classList.add('open'); }
  function closeModal() { $('modal-overlay').classList.remove('open'); }
  $('modal-overlay').addEventListener('click', (e) => { if (e.target === $('modal-overlay')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  /* ---------------- Dashboard ---------------- */
  async function viewDashboard() {
    const page = $('page');
    page.innerHTML = `<div class="page-head"><div><h1>Dashboard</h1><p>Live overview of registrations and payments</p></div>
      <div class="filters"><button class="btn btn-light btn-sm" data-exp="xlsx">⬇ Excel</button><button class="btn btn-light btn-sm" data-exp="csv">⬇ CSV</button><button class="btn btn-light btn-sm" data-exp="pdf">⬇ PDF</button></div></div>
      <div id="dash-body"><div style="text-align:center;padding:3rem"><span class="spinner spinner-navy" style="width:26px;height:26px;margin:auto"></span></div></div>`;
    page.querySelectorAll('[data-exp]').forEach((b) => b.addEventListener('click', () => doExport(b.dataset.exp)));

    const { ok, data: s } = await api('/api/admin/stats');
    if (!ok) { $('dash-body').innerHTML = '<p>Failed to load stats.</p>'; return; }

    const ico = (p) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${p}</svg>`;
    const stat = (cls, icon, val, lbl) => `<div class="stat accent-${cls}"><div class="ico">${ico(icon)}</div><div class="val">${val}</div><div class="lbl">${lbl}</div></div>`;

    const ebPct = Math.min(100, Math.round((s.earlyBird / s.earlyBirdLimit) * 100));
    const maxGroup = Math.max(1, ...s.groups.map((g) => g.total));

    $('dash-body').innerHTML = `
      <div class="stat-grid">
        ${stat('navy', '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>', s.total, 'Total Registrants')}
        ${stat('green', '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>', s.confirmed, 'Confirmed Payments')}
        ${stat('amber', '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', s.pending, 'Pending Verification')}
        ${stat('red', '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>', s.rejected, 'Rejected')}
        ${stat('gold', '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', money(s.revenue, SYM()), 'Revenue Collected')}
        ${stat('blue', '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', s.checkedIn, 'Checked In')}
      </div>

      <div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        ${stat('gold', '<path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21 8 14 2 9.4h7.6z"/>', s.earlyBird + ' / ' + s.earlyBirdLimit, 'Early Bird')}
        ${stat('navy', '<path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/>', s.regular, 'Regular')}
        ${stat('blue', '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/>', s.male, 'Male')}
        ${stat('red', '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/>', s.female, 'Female')}
        ${stat('green', '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>', s.workers, 'Workers')}
        ${stat('amber', '<path d="M4 4h16v16H4z"/><path d="M4 9h16M9 4v16"/>', s.awaiting, 'Awaiting Payment')}
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Early Bird slots</h3><span class="chip chip-gold">${s.earlyBirdRemaining} remaining</span></div>
        <div class="panel-body">
          <div class="group-card" style="cursor:default;box-shadow:none;border:none;padding:0">
            <div class="gc-bar" style="height:12px"><span style="width:${ebPct}%"></span></div>
            <div class="gc-meta"><span>${s.earlyBird} claimed</span><span>${ebPct}% of ${s.earlyBirdLimit}</span></div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Group distribution</h3></div>
        <div class="panel-body"><div class="group-grid">
          ${s.groups.map((g) => `
            <div class="group-card" data-group="${escapeHtml(g.group)}">
              <div class="gc-top"><h4 class="grp-dot grp-${escapeHtml(g.group)}">${escapeHtml(g.group)}</h4><div class="gc-count">${g.total}</div></div>
              <div class="gc-bar"><span style="width:${Math.round((g.total / maxGroup) * 100)}%"></span></div>
              <div class="gc-meta"><span>✓ ${g.confirmed} paid</span><span>${g.checked_in} in</span></div>
            </div>`).join('')}
        </div></div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Notifications</h3></div>
        <div class="panel-body"><div class="filters">
          <span class="chip chip-navy">✉ ${s.notifications.sent} sent</span>
          <span class="chip chip-gold">${s.notifications.pending} pending</span>
          <span class="chip" style="background:var(--danger-bg);color:var(--danger)">${s.notifications.failed} failed</span>
        </div></div>
      </div>`;

    $('dash-body').querySelectorAll('.group-card[data-group]').forEach((c) => c.addEventListener('click', () => { pState = { ...pState, group: c.dataset.group, page: 1 }; switchView('participants'); }));
  }

  /* ---------------- Participants ---------------- */
  async function viewParticipants() {
    const page = $('page');
    page.innerHTML = `<div class="page-head"><div><h1>Participants</h1><p>Search, filter, verify and manage registrations</p></div>
      <div class="filters"><button class="btn btn-light btn-sm" data-exp="xlsx">⬇ Excel</button><button class="btn btn-light btn-sm" data-exp="csv">⬇ CSV</button><button class="btn btn-light btn-sm" data-exp="pdf">⬇ PDF</button></div></div>
      <div class="panel">
        <div class="panel-head" style="flex-direction:column;align-items:stretch;gap:.7rem">
          <div class="filters">
            <div class="search-box"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><input class="input" id="f-q" placeholder="Search name, email, phone or reference…"></div>
          </div>
          <div class="filters">
            <select class="select" id="f-status"><option value="">All statuses</option><option value="awaiting_payment">Awaiting payment</option><option value="pending_verification">Pending verification</option><option value="confirmed">Confirmed</option><option value="rejected">Rejected</option></select>
            <select class="select" id="f-group"><option value="">All groups</option>${(cfg ? cfg.event.groups : []).map((g) => `<option>${escapeHtml(g)}</option>`).join('')}</select>
            <select class="select" id="f-gender"><option value="">All genders</option><option>Male</option><option>Female</option></select>
            <select class="select" id="f-worker"><option value="">Workers &amp; non</option><option value="yes">Workers only</option><option value="no">Non-workers</option></select>
            <select class="select" id="f-tier"><option value="">All tiers</option><option value="early_bird">Early Bird</option><option value="regular">Regular</option></select>
            <select class="select" id="f-checked"><option value="">Any check-in</option><option value="yes">Checked in</option><option value="no">Not checked in</option></select>
            <button class="btn btn-ghost btn-sm" id="f-reset">Reset</button>
          </div>
        </div>
        <div class="table-wrap"><table class="data" id="p-table">
          <thead><tr>
            <th data-sort="reference">Reference</th><th data-sort="name">Name</th><th class="nosort">Contact</th>
            <th data-sort="group">Group</th><th class="nosort">Worker</th><th class="nosort">Tier</th>
            <th class="nosort">Fee</th><th data-sort="status">Status</th><th class="nosort">In</th>
          </tr></thead>
          <tbody id="p-rows"><tr><td colspan="9" style="text-align:center;padding:2rem"><span class="spinner spinner-navy" style="width:22px;height:22px;margin:auto"></span></td></tr></tbody>
        </table></div>
        <div class="pagination"><div class="pg-info" id="pg-info">—</div><div class="pg-btns"><button class="btn btn-light btn-sm" id="pg-prev">← Prev</button><button class="btn btn-light btn-sm" id="pg-next">Next →</button></div></div>
      </div>`;

    page.querySelectorAll('[data-exp]').forEach((b) => b.addEventListener('click', () => doExport(b.dataset.exp)));

    // hydrate filter controls from state
    $('f-q').value = pState.q; $('f-status').value = pState.status; $('f-group').value = pState.group;
    $('f-gender').value = pState.gender; $('f-worker').value = pState.worker; $('f-tier').value = pState.tier; $('f-checked').value = pState.checkedIn;

    let timer;
    $('f-q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { pState.q = $('f-q').value; pState.page = 1; loadParticipants(); }, 300); });
    ['status', 'group', 'gender', 'worker', 'tier'].forEach((k) => $('f-' + k).addEventListener('change', () => { pState[k === 'worker' ? 'worker' : k] = $('f-' + k).value; pState.page = 1; loadParticipants(); }));
    $('f-checked').addEventListener('change', () => { pState.checkedIn = $('f-checked').value; pState.page = 1; loadParticipants(); });
    $('f-reset').addEventListener('click', () => { pState = { ...pState, q: '', gender: '', worker: '', department: '', group: '', status: '', tier: '', checkedIn: '', page: 1 }; viewParticipants(); });
    $('pg-prev').addEventListener('click', () => { if (pState.page > 1) { pState.page--; loadParticipants(); } });
    $('pg-next').addEventListener('click', () => { pState.page++; loadParticipants(); });
    page.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (pState.sort === col) pState.dir = pState.dir === 'asc' ? 'desc' : 'asc'; else { pState.sort = col; pState.dir = 'asc'; }
      loadParticipants();
    }));

    loadParticipants();
  }

  function qs() {
    const p = new URLSearchParams();
    Object.entries({ q: pState.q, status: pState.status, group: pState.group, gender: pState.gender, worker: pState.worker, tier: pState.tier, checkedIn: pState.checkedIn, sort: pState.sort, dir: pState.dir, page: pState.page, pageSize: pState.pageSize }).forEach(([k, v]) => { if (v) p.set(k, v); });
    return p.toString();
  }

  async function loadParticipants() {
    const { ok, data } = await api('/api/admin/participants?' + qs());
    const tb = $('p-rows'); if (!tb) return;
    if (!ok) { tb.innerHTML = '<tr><td colspan="9">Failed to load.</td></tr>'; return; }
    if (!data.rows.length) { tb.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2.5rem;color:var(--muted)">No participants match your filters.</td></tr>'; }
    else tb.innerHTML = data.rows.map(rowHtml).join('');
    tb.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openParticipant(tr.dataset.id)));
    $('pg-info').textContent = `Showing ${data.rows.length} of ${data.total} · page ${data.page} of ${data.pages}`;
    $('pg-prev').disabled = data.page <= 1; $('pg-next').disabled = data.page >= data.pages;
  }

  function rowHtml(p) {
    const sm = statusMeta(p.payment_status);
    return `<tr data-id="${p.id}">
      <td><span class="ref-pill">${escapeHtml(p.reference)}</span></td>
      <td><strong>${escapeHtml(p.first_name + ' ' + p.last_name)}</strong><br><span class="muted-cell" style="font-size:.8rem">${escapeHtml(p.gender)}</span></td>
      <td class="muted-cell" style="font-size:.82rem">${escapeHtml(p.email)}<br>${escapeHtml(p.phone)}</td>
      <td><span class="grp-dot grp-${escapeHtml(p.group_name)}">${escapeHtml(p.group_name)}</span></td>
      <td>${p.is_worker ? escapeHtml(p.department || 'Yes') : '<span class="muted-cell">—</span>'}</td>
      <td>${p.fee_tier === 'early_bird' ? '<span class="chip chip-gold">Early</span>' : 'Regular'}</td>
      <td class="mono">${money(p.fee_amount, SYM())}</td>
      <td><span class="status ${sm.cls}">${sm.label}</span></td>
      <td style="text-align:center">${p.checked_in ? '✅' : '—'}</td>
    </tr>`;
  }

  /* ---------------- Participant modal ---------------- */
  async function openParticipant(id) {
    openModal('<div class="modal-body" style="text-align:center;padding:3rem"><span class="spinner spinner-navy" style="width:26px;height:26px;margin:auto"></span></div>');
    const { ok, data } = await api('/api/admin/participants/' + id);
    if (!ok) { closeModal(); toast('Could not load participant.', 'error'); return; }
    renderParticipantModal(data);
  }

  function renderParticipantModal(data) {
    const p = data.participant;
    const sm = statusMeta(p.payment_status);
    const canEdit = me.role === 'admin' || me.role === 'superadmin';
    const cur = data.receipts.find((r) => r.is_current);

    let receiptHtml = '<p class="text-muted" style="font-size:.88rem;margin-top:1rem">No receipt uploaded yet.</p>';
    if (cur) {
      const isImg = (cur.mime || '').startsWith('image/');
      receiptHtml = `<div class="receipt-view">
        <div class="rv-head"><span>Receipt · ${escapeHtml(cur.original_name || 'file')} · ${(cur.size / 1024).toFixed(0)}KB</span><a href="${cur.url}" target="_blank" rel="noopener" class="text-gold">Open ↗</a></div>
        ${isImg ? `<img src="${cur.url}" alt="receipt">` : `<div style="padding:1.5rem;text-align:center"><a class="btn btn-navy btn-sm" href="${cur.url}" target="_blank" rel="noopener">Open PDF receipt ↗</a></div>`}
      </div>`;
    }

    const actions = [];
    if (p.payment_status !== 'confirmed') actions.push('<button class="btn btn-success" id="m-confirm">✓ Confirm payment</button>');
    if (p.payment_status !== 'rejected') actions.push('<button class="btn btn-danger" id="m-reject">✕ Reject</button>');
    if (p.payment_status === 'confirmed' && !p.checked_in) actions.push('<button class="btn btn-navy" id="m-checkin">Check in</button>');
    if (p.checked_in && canEdit) actions.push('<button class="btn btn-ghost" id="m-undo-checkin">Undo check-in</button>');
    if (canEdit) actions.push('<button class="btn btn-light" id="m-edit">✎ Edit</button>');

    openModal(`
      <div class="modal-head">
        <div><h3>${escapeHtml(p.first_name + ' ' + p.last_name)}</h3><div style="margin-top:.4rem"><span class="ref-pill">${escapeHtml(p.reference)}</span> &nbsp; <span class="status ${sm.cls}">${sm.label}</span></div></div>
        <button class="modal-close" id="m-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="kv">
          <div><div class="k">Email</div><div class="v">${escapeHtml(p.email)}</div></div>
          <div><div class="k">WhatsApp</div><div class="v">${escapeHtml(p.phone)}</div></div>
          <div><div class="k">Gender</div><div class="v">${escapeHtml(p.gender)}</div></div>
          <div><div class="k">Group</div><div class="v grp-dot grp-${escapeHtml(p.group_name)}">${escapeHtml(p.group_name)}</div></div>
          <div><div class="k">Worker</div><div class="v">${p.is_worker ? 'Yes — ' + escapeHtml(p.department || '') : 'No'}</div></div>
          <div><div class="k">Fee tier</div><div class="v">${p.fee_tier === 'early_bird' ? 'Early Bird' : 'Regular'}</div></div>
          <div><div class="k">Expected</div><div class="v">${money(p.fee_amount, SYM())}</div></div>
          <div><div class="k">Amount paid</div><div class="v">${p.amount_paid != null ? money(p.amount_paid, SYM()) : '—'}</div></div>
          <div class="full"><div class="k">Registered</div><div class="v">${escapeHtml(p.created_at)}</div></div>
          ${p.verified_at ? `<div class="full"><div class="k">Verified</div><div class="v">${escapeHtml(p.verified_at)}${data.verifier ? ' · by ' + escapeHtml(data.verifier.name) : ''}</div></div>` : ''}
          ${p.checked_in ? `<div class="full"><div class="k">Checked in</div><div class="v">${escapeHtml(p.checked_in_at || '')}${data.checker ? ' · by ' + escapeHtml(data.checker.name) : ''}</div></div>` : ''}
          ${p.admin_remark ? `<div class="full"><div class="k">Admin remark</div><div class="v">${escapeHtml(p.admin_remark)}</div></div>` : ''}
        </div>
        <h4 style="margin:1.4rem 0 .2rem;font-size:1rem">Payment receipt</h4>
        ${receiptHtml}
      </div>
      <div class="modal-foot">${actions.join('')}</div>`);

    $('m-close').addEventListener('click', closeModal);
    const reload = () => openParticipant(p.id);
    if ($('m-confirm')) $('m-confirm').addEventListener('click', () => confirmDialog(p));
    if ($('m-reject')) $('m-reject').addEventListener('click', () => rejectDialog(p));
    if ($('m-checkin')) $('m-checkin').addEventListener('click', async () => { const r = await api(`/api/admin/participants/${p.id}/checkin`, { method: 'POST' }); if (r.ok) { toast('Checked in.', 'success'); reload(); } else toast(r.data.error || 'Failed.', 'error'); });
    if ($('m-undo-checkin')) $('m-undo-checkin').addEventListener('click', async () => { const r = await api(`/api/admin/participants/${p.id}/undo-checkin`, { method: 'POST' }); if (r.ok) { toast('Check-in undone.'); reload(); } else toast(r.data.error || 'Failed.', 'error'); });
    if ($('m-edit')) $('m-edit').addEventListener('click', () => editDialog(p));
  }

  function confirmDialog(p) {
    openModal(`<div class="modal-head"><h3>Confirm payment</h3><button class="modal-close" id="c-close">✕</button></div>
      <div class="modal-body">
        <p class="text-muted" style="font-size:.9rem">Confirm the payment for <strong>${escapeHtml(p.reference)}</strong>.</p>
        <div class="field"><label>Amount received (${SYM()})</label><input class="input" type="number" id="c-amount" value="${p.fee_amount}"></div>
        <div class="field"><label>Remark (optional)</label><input class="input" id="c-remark" placeholder="e.g. Verified GTB transfer at 2:14pm"></div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" id="c-cancel">Cancel</button><button class="btn btn-success" id="c-go"><span class="btn-label">Confirm payment</span></button></div>`);
    $('c-close').addEventListener('click', () => openParticipant(p.id));
    $('c-cancel').addEventListener('click', () => openParticipant(p.id));
    $('c-go').addEventListener('click', async () => {
      const btn = $('c-go'); btn.disabled = true; btn.querySelector('.btn-label').innerHTML = '<span class="spinner"></span> Saving…';
      const r = await api(`/api/admin/participants/${p.id}/confirm`, { method: 'POST', body: { amount_paid: $('c-amount').value, remark: $('c-remark').value } });
      if (r.ok) { toast('Payment confirmed ✓', 'success'); openParticipant(p.id); } else { toast(r.data.error || 'Failed.', 'error'); btn.disabled = false; }
    });
  }

  function rejectDialog(p) {
    openModal(`<div class="modal-head"><h3>Reject payment</h3><button class="modal-close" id="r-close">✕</button></div>
      <div class="modal-body">
        <p class="text-muted" style="font-size:.9rem">The participant will be asked to re-upload a valid receipt.</p>
        <div class="field"><label>Reason</label><textarea class="input" id="r-reason" rows="3" placeholder="e.g. Amount does not match, or receipt unclear"></textarea></div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" id="r-cancel">Cancel</button><button class="btn btn-danger" id="r-go"><span class="btn-label">Reject payment</span></button></div>`);
    $('r-close').addEventListener('click', () => openParticipant(p.id));
    $('r-cancel').addEventListener('click', () => openParticipant(p.id));
    $('r-go').addEventListener('click', async () => {
      const btn = $('r-go'); btn.disabled = true; btn.querySelector('.btn-label').innerHTML = '<span class="spinner"></span> Saving…';
      const r = await api(`/api/admin/participants/${p.id}/reject`, { method: 'POST', body: { reason: $('r-reason').value } });
      if (r.ok) { toast('Payment rejected.', 'success'); openParticipant(p.id); } else { toast(r.data.error || 'Failed.', 'error'); btn.disabled = false; }
    });
  }

  function editDialog(p) {
    const groups = cfg ? cfg.event.groups : [];
    const depts = cfg ? cfg.departments : [];
    openModal(`<div class="modal-head"><h3>Edit participant</h3><button class="modal-close" id="e-close">✕</button></div>
      <div class="modal-body">
        <div class="grid-2">
          <div class="field"><label>First name</label><input class="input" id="e-first" value="${escapeHtml(p.first_name)}"></div>
          <div class="field"><label>Last name</label><input class="input" id="e-last" value="${escapeHtml(p.last_name)}"></div>
        </div>
        <div class="field"><label>WhatsApp phone</label><input class="input" id="e-phone" value="${escapeHtml(p.phone)}"></div>
        <div class="grid-2">
          <div class="field"><label>Gender</label><select class="select" id="e-gender"><option ${p.gender === 'Male' ? 'selected' : ''}>Male</option><option ${p.gender === 'Female' ? 'selected' : ''}>Female</option></select></div>
          <div class="field"><label>Group</label><select class="select" id="e-group">${groups.map((g) => `<option ${g === p.group_name ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Worker</label><select class="select" id="e-worker"><option value="yes" ${p.is_worker ? 'selected' : ''}>Yes</option><option value="no" ${!p.is_worker ? 'selected' : ''}>No</option></select></div>
        <div class="field" id="e-dept-f" ${p.is_worker ? '' : 'style="display:none"'}><label>Department</label><input class="input" id="e-dept" value="${escapeHtml(p.department || '')}" list="dept-list"><datalist id="dept-list">${depts.map((d) => `<option value="${escapeHtml(d)}">`).join('')}</datalist></div>
        <div class="field"><label>Admin remark</label><input class="input" id="e-remark" value="${escapeHtml(p.admin_remark || '')}"></div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" id="e-cancel">Cancel</button><button class="btn btn-gold" id="e-save"><span class="btn-label">Save changes</span></button></div>`);
    $('e-close').addEventListener('click', () => openParticipant(p.id));
    $('e-cancel').addEventListener('click', () => openParticipant(p.id));
    $('e-worker').addEventListener('change', () => { $('e-dept-f').style.display = $('e-worker').value === 'yes' ? '' : 'none'; });
    $('e-save').addEventListener('click', async () => {
      const btn = $('e-save'); btn.disabled = true; btn.querySelector('.btn-label').innerHTML = '<span class="spinner"></span> Saving…';
      const body = { first_name: $('e-first').value, last_name: $('e-last').value, phone: $('e-phone').value, gender: $('e-gender').value, group_name: $('e-group').value, is_worker: $('e-worker').value === 'yes', department: $('e-dept') ? $('e-dept').value : null, admin_remark: $('e-remark').value };
      const r = await api(`/api/admin/participants/${p.id}`, { method: 'PATCH', body });
      if (r.ok) { toast('Saved.', 'success'); openParticipant(p.id); } else { toast(r.data.error || 'Failed.', 'error'); btn.disabled = false; }
    });
  }

  /* ---------------- Groups ---------------- */
  async function viewGroups() {
    const page = $('page');
    page.innerHTML = `<div class="page-head"><div><h1>Groups</h1><p>Allocation across the four picnic groups</p></div></div><div id="g-body"><div style="text-align:center;padding:3rem"><span class="spinner spinner-navy" style="width:26px;height:26px;margin:auto"></span></div></div>`;
    const { ok, data } = await api('/api/admin/groups');
    if (!ok) { $('g-body').innerHTML = 'Failed.'; return; }
    const max = Math.max(1, ...data.groups.map((g) => g.total));
    $('g-body').innerHTML = `<div class="group-grid">${data.groups.map((g) => `
      <div class="group-card" data-group="${escapeHtml(g.group)}">
        <div class="gc-top"><h4 class="grp-dot grp-${escapeHtml(g.group)}">${escapeHtml(g.group)}</h4><div class="gc-count">${g.total}</div></div>
        <div class="gc-bar"><span style="width:${Math.round((g.total / max) * 100)}%"></span></div>
        <div class="gc-meta"><span>✓ ${g.confirmed} confirmed</span><span>${g.checked_in} checked in</span></div>
        <div class="gc-meta" style="margin-top:.3rem"><span>♂ ${g.male}</span><span>♀ ${g.female}</span></div>
        <div style="margin-top:.9rem;display:flex;gap:.4rem"><button class="btn btn-light btn-sm" data-view-group="${escapeHtml(g.group)}">View members</button><button class="btn btn-ghost btn-sm" data-exp-group="${escapeHtml(g.group)}">Export</button></div>
      </div>`).join('')}</div>`;
    $('g-body').querySelectorAll('[data-view-group]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); pState = { ...pState, group: b.dataset.viewGroup, page: 1 }; switchView('participants'); }));
    $('g-body').querySelectorAll('[data-exp-group]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); doExport('xlsx', { group: b.dataset.expGroup }); }));
  }

  /* ---------------- Check-in ---------------- */
  async function viewCheckin() {
    const page = $('page');
    page.innerHTML = `<div class="page-head"><div><h1>Check-in</h1><p>Admit confirmed participants at the venue</p></div></div>
      <div class="panel"><div class="panel-body">
        <p style="margin-top:0">📱 <strong>Fastest way:</strong> scan a participant's QR code with any phone camera — it opens their check-in page directly. Or look them up by reference below.</p>
        <div class="filters" style="margin-top:1rem">
          <div class="search-box"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><input class="input" id="ci-ref" placeholder="Enter reference e.g. LB26-ABCDE" style="text-transform:uppercase"></div>
          <button class="btn btn-navy" id="ci-go">Look up</button>
          <button class="btn btn-light" id="ci-scan">📷 Scan QR</button>
        </div>
        <div id="ci-scanner" class="util-hidden" style="margin-top:1rem"></div>
        <div id="ci-result" style="margin-top:1.2rem"></div>
      </div></div>`;
    $('ci-go').addEventListener('click', ciLookup);
    $('ci-ref').addEventListener('keydown', (e) => { if (e.key === 'Enter') ciLookup(); });
    $('ci-scan').addEventListener('click', startScanner);
  }

  async function ciLookup() {
    const ref = $('ci-ref').value.trim().toUpperCase();
    if (!ref) return;
    const box = $('ci-result');
    box.innerHTML = '<span class="spinner spinner-navy" style="width:22px;height:22px"></span>';
    // find participant id via search, then use admin verify-by-token flow through participant endpoint
    const { ok, data } = await api('/api/admin/participants?q=' + encodeURIComponent(ref) + '&pageSize=5');
    if (!ok || !data.rows.length) { box.innerHTML = '<p style="color:var(--danger)">No participant found for that reference.</p>'; return; }
    const p = data.rows.find((r) => r.reference.toUpperCase() === ref) || data.rows[0];
    renderCiCard(box, p);
  }

  function renderCiCard(box, p) {
    const sm = statusMeta(p.payment_status);
    const eligible = p.payment_status === 'confirmed' && !p.checked_in;
    box.innerHTML = `<div class="card card-pad">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem">
        <div><h3 style="font-size:1.2rem">${escapeHtml(p.first_name + ' ' + p.last_name)}</h3>
          <div style="margin-top:.4rem"><span class="ref-pill">${escapeHtml(p.reference)}</span> · <span class="grp-dot grp-${escapeHtml(p.group_name)}">${escapeHtml(p.group_name)}</span> · <span class="status ${sm.cls}">${sm.label}</span></div></div>
        ${p.checked_in ? '<span class="status status-confirmed">Already checked in</span>'
          : eligible ? '<button class="btn btn-success btn-lg" id="ci-admit">✓ Check in &amp; Admit</button>'
          : '<span class="status status-rejected">Not eligible</span>'}
      </div></div>`;
    if ($('ci-admit')) $('ci-admit').addEventListener('click', async () => {
      const r = await api(`/api/admin/participants/${p.id}/checkin`, { method: 'POST' });
      if (r.ok) { toast('Admitted ✓', 'success'); renderCiCard(box, r.data.participant); }
      else toast(r.data.error || 'Failed.', 'error');
    });
  }

  async function startScanner() {
    const host = $('ci-scanner');
    if (!('BarcodeDetector' in window)) {
      host.classList.remove('util-hidden');
      host.innerHTML = '<p class="text-muted" style="font-size:.88rem">In-browser scanning isn\'t supported on this browser. Please scan the QR with your phone camera (it opens the check-in page), or type the reference above.</p>';
      return;
    }
    host.classList.remove('util-hidden');
    host.innerHTML = '<video id="ci-video" playsinline style="width:100%;max-width:360px;border-radius:14px;background:#000"></video><p class="text-muted" style="font-size:.82rem;margin-top:.5rem">Point the camera at a participant\'s QR code.</p>';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = $('ci-video'); video.srcObject = stream; await video.play();
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!document.body.contains(video)) { stream.getTracks().forEach((t) => t.stop()); return; }
        try {
          const codes = await detector.detect(video);
          if (codes.length) {
            const raw = codes[0].rawValue || '';
            const m = raw.match(/\/verify\/([a-f0-9]+)/i);
            stream.getTracks().forEach((t) => t.stop());
            if (m) { location.href = '/verify/' + m[1]; return; }
            host.innerHTML = '<p style="color:var(--danger)">Unrecognised QR code.</p>'; return;
          }
        } catch { /* ignore frame */ }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) {
      host.innerHTML = '<p class="text-muted" style="font-size:.88rem">Camera unavailable. Use your phone camera to scan, or type the reference above.</p>';
    }
  }

  /* ---------------- Notifications ---------------- */
  async function viewNotifications() {
    const page = $('page');
    page.innerHTML = `<div class="page-head"><div><h1>Notifications</h1><p>Email &amp; WhatsApp delivery log</p></div></div><div id="n-body"><div style="text-align:center;padding:3rem"><span class="spinner spinner-navy" style="width:26px;height:26px;margin:auto"></span></div></div>`;
    const { ok, data } = await api('/api/admin/notifications');
    if (!ok) { $('n-body').innerHTML = 'Failed.'; return; }
    const canRetry = me.role === 'admin' || me.role === 'superadmin';
    const kindLabel = { registration: 'Registration email', receipt_admin: 'Receipt → admin', payment_confirmed: 'Payment confirmed', payment_rejected: 'Payment rejected' };
    $('n-body').innerHTML = `
      <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);max-width:520px">
        <div class="stat accent-green"><div class="val">${data.stats.sent}</div><div class="lbl">Sent</div></div>
        <div class="stat accent-amber"><div class="val">${data.stats.pending}</div><div class="lbl">Pending</div></div>
        <div class="stat accent-red"><div class="val">${data.stats.failed}</div><div class="lbl">Failed</div></div>
      </div>
      <div class="panel"><div class="panel-head"><h3>Recent activity</h3></div><div class="panel-body">
        ${data.recent.length ? data.recent.map((n) => {
          const stCls = n.status === 'sent' ? 'status-confirmed' : n.status === 'failed' ? 'status-rejected' : 'status-pending';
          return `<div class="notif-row">
            <div class="notif-ico notif-ch-${n.channel === 'whatsapp' ? 'whatsapp' : 'email'}">${n.channel === 'whatsapp' ? '🟢' : '✉'}</div>
            <div class="notif-main"><div class="nm-t">${kindLabel[n.kind] || n.kind} ${n.reference ? '· ' + escapeHtml(n.reference) : ''}</div>
              <div class="nm-s">${escapeHtml(n.recipient || '')} · ${escapeHtml(n.created_at)}${n.last_error ? ' · ' + escapeHtml(n.last_error) : ''}</div></div>
            <span class="status ${stCls}">${n.status}</span>
            ${n.status === 'failed' && canRetry ? `<button class="btn btn-ghost btn-sm" data-retry="${n.id}">Retry</button>` : ''}
          </div>`;
        }).join('') : '<p class="text-muted">No notifications yet.</p>'}
      </div></div>`;
    $('n-body').querySelectorAll('[data-retry]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true; const r = await api(`/api/admin/notifications/${b.dataset.retry}/retry`, { method: 'POST' });
      if (r.ok) { toast('Retry triggered.', 'success'); setTimeout(viewNotifications, 900); } else toast(r.data.error || 'Failed.', 'error');
    }));
    refreshNotifBadge();
  }

  async function refreshNotifBadge() {
    const { ok, data } = await api('/api/admin/notifications');
    if (!ok) return;
    const badge = $('notif-badge');
    if (data.stats.failed > 0) { badge.textContent = data.stats.failed; badge.classList.remove('util-hidden'); }
    else badge.classList.add('util-hidden');
  }

  /* ---------------- Settings ---------------- */
  async function viewSettings() {
    const page = $('page');
    const { ok, data } = await api('/api/admin/settings');
    const s = ok ? data : {};
    const isSuper = me.role === 'superadmin';
    const mailLabel = s.mailProvider === 'resend' ? 'Resend' : s.mailProvider === 'smtp' ? 'SMTP' : 'Console (not sending)';
    const bk = s.bank || {};
    page.innerHTML = `<div class="page-head"><div><h1>Settings</h1><p>Event controls, bank details, your account &amp; administrators</p></div></div>
      <div class="panel"><div class="panel-head"><h3>Registration</h3></div><div class="panel-body">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
          <div><strong>Registration is ${s.registrationOpen ? 'OPEN' : 'CLOSED'}</strong><p class="text-muted" style="font-size:.85rem;margin:.2rem 0 0">${s.registrationOpen ? 'Participants can currently register.' : 'New registrations are blocked.'}</p></div>
          ${isSuper ? `<button class="btn ${s.registrationOpen ? 'btn-danger' : 'btn-success'}" id="toggle-reg">${s.registrationOpen ? 'Close registration' : 'Open registration'}</button>` : '<span class="chip chip-navy">Superadmin only</span>'}
        </div>
        <div class="kv" style="margin-top:1.4rem">
          <div><div class="k">Early bird fee</div><div class="v">${s.event ? money(s.event.earlyBirdFee, SYM()) : '—'} · first ${s.event ? s.event.earlyBirdLimit : ''}</div></div>
          <div><div class="k">Regular fee</div><div class="v">${s.event ? money(s.event.regularFee, SYM()) : '—'}</div></div>
          <div><div class="k">Email delivery</div><div class="v">${mailLabel}</div></div>
        </div>
        <p class="hint">Event fees are configured via the server's .env file.</p>
      </div></div>

      <div class="panel"><div class="panel-head"><h3>Bank details &amp; notifications</h3>${isSuper ? '' : '<span class="chip chip-navy">Superadmin only</span>'}</div><div class="panel-body">
        <p class="text-muted" style="font-size:.85rem;margin-top:0">Shown to participants for payment and used in all emails. Changes apply immediately.</p>
        <div class="grid-2">
          <div class="field"><label>Bank name</label><input class="input" id="set-bank-name" value="${escapeHtml(bk.name || '')}" ${isSuper ? '' : 'disabled'}></div>
          <div class="field"><label>Account name</label><input class="input" id="set-bank-acctname" value="${escapeHtml(bk.accountName || '')}" ${isSuper ? '' : 'disabled'}></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Account number</label><input class="input" id="set-bank-acctnum" value="${escapeHtml(bk.accountNumber || '')}" inputmode="numeric" ${isSuper ? '' : 'disabled'}></div>
          <div class="field"><label>Admin notification email</label><input class="input" type="email" id="set-notify" value="${escapeHtml(s.notifyEmail || '')}" ${isSuper ? '' : 'disabled'}><div class="hint">Where receipt-uploaded alerts are sent.</div></div>
        </div>
        ${isSuper ? '<button class="btn btn-gold" id="save-bank"><span class="btn-label">Save bank &amp; notifications</span></button>' : ''}
      </div></div>

      <div class="panel"><div class="panel-head"><h3>Your account</h3></div><div class="panel-body">
        <div class="kv"><div><div class="k">Name</div><div class="v">${escapeHtml(me.name)}</div></div><div><div class="k">Email</div><div class="v">${escapeHtml(me.email)}</div></div><div><div class="k">Role</div><div class="v" style="text-transform:capitalize">${escapeHtml(me.role)}</div></div></div>
        <button class="btn btn-light" id="chg-pass" style="margin-top:1rem">Change password</button>
      </div></div>
      ${isSuper ? '<div class="panel" id="admins-panel"><div class="panel-head"><h3>Administrators</h3><button class="btn btn-gold btn-sm" id="add-admin">+ Add admin</button></div><div class="panel-body" id="admins-body"><span class="spinner spinner-navy" style="width:22px;height:22px"></span></div></div>' : ''}`;

    if ($('toggle-reg')) $('toggle-reg').addEventListener('click', async () => {
      const r = await api('/api/admin/settings', { method: 'POST', body: { registrationOpen: !s.registrationOpen } });
      if (r.ok) { toast('Updated.', 'success'); viewSettings(); } else toast(r.data.error || 'Failed.', 'error');
    });
    if ($('save-bank')) $('save-bank').addEventListener('click', async () => {
      const btn = $('save-bank'); const label = btn.querySelector('.btn-label');
      btn.disabled = true; const o = label.textContent; label.innerHTML = '<span class="spinner"></span> Saving…';
      const r = await api('/api/admin/settings', { method: 'POST', body: {
        bank: { name: $('set-bank-name').value, accountName: $('set-bank-acctname').value, accountNumber: $('set-bank-acctnum').value },
        notifyEmail: $('set-notify').value,
      } });
      if (r.ok) { toast('Bank details saved.', 'success'); viewSettings(); }
      else { toast(r.data.error || 'Failed.', 'error'); btn.disabled = false; label.textContent = o; }
    });
    $('chg-pass').addEventListener('click', changePasswordDialog);
    if (isSuper) { loadAdmins(); $('add-admin').addEventListener('click', addAdminDialog); }
  }

  function changePasswordDialog() {
    openModal(`<div class="modal-head"><h3>Change password</h3><button class="modal-close" id="p-close">✕</button></div>
      <div class="modal-body">
        <div class="field"><label>Current password</label><input class="input" type="password" id="p-cur"></div>
        <div class="field"><label>New password (min 8 chars)</label><input class="input" type="password" id="p-new"></div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" id="p-cancel">Cancel</button><button class="btn btn-gold" id="p-save"><span class="btn-label">Update password</span></button></div>`);
    $('p-close').addEventListener('click', closeModal); $('p-cancel').addEventListener('click', closeModal);
    $('p-save').addEventListener('click', async () => {
      const r = await api('/api/auth/change-password', { method: 'POST', body: { current_password: $('p-cur').value, new_password: $('p-new').value } });
      if (r.ok) { toast('Password updated.', 'success'); closeModal(); } else toast(r.data.error || 'Failed.', 'error');
    });
  }

  async function loadAdmins() {
    const { ok, data } = await api('/api/admin/admins');
    if (!ok) { $('admins-body').innerHTML = 'Failed.'; return; }
    $('admins-body').innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th class="nosort">Name</th><th class="nosort">Email</th><th class="nosort">Role</th><th class="nosort">Status</th><th class="nosort"></th></tr></thead><tbody>
      ${data.admins.map((a) => `<tr><td><strong>${escapeHtml(a.name)}</strong></td><td class="muted-cell">${escapeHtml(a.email)}</td><td style="text-transform:capitalize">${escapeHtml(a.role)}</td>
        <td>${a.active ? '<span class="status status-confirmed">Active</span>' : '<span class="status status-rejected">Inactive</span>'}</td>
        <td>${a.id === me.id ? '<span class="muted-cell">You</span>' : `<button class="btn btn-ghost btn-sm" data-toggle-admin="${a.id}" data-active="${a.active ? 1 : 0}">${a.active ? 'Deactivate' : 'Activate'}</button>`}</td></tr>`).join('')}
    </tbody></table></div>`;
    $('admins-body').querySelectorAll('[data-toggle-admin]').forEach((b) => b.addEventListener('click', async () => {
      const r = await api(`/api/admin/admins/${b.dataset.toggleAdmin}/active`, { method: 'POST', body: { active: b.dataset.active !== '1' } });
      if (r.ok) { toast('Updated.', 'success'); loadAdmins(); } else toast(r.data.error || 'Failed.', 'error');
    }));
  }

  function addAdminDialog() {
    openModal(`<div class="modal-head"><h3>Add administrator</h3><button class="modal-close" id="a-close">✕</button></div>
      <div class="modal-body">
        <div class="field"><label>Full name</label><input class="input" id="a-name"></div>
        <div class="field"><label>Email</label><input class="input" type="email" id="a-email"></div>
        <div class="field"><label>Role</label><select class="select" id="a-role"><option value="verifier">Verifier (confirm payments &amp; check-in)</option><option value="admin" selected>Admin (manage + export)</option><option value="superadmin">Superadmin (full access)</option></select></div>
        <div class="field"><label>Temporary password (min 8)</label><input class="input" type="text" id="a-pass" value=""></div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" id="a-cancel">Cancel</button><button class="btn btn-gold" id="a-save"><span class="btn-label">Create admin</span></button></div>`);
    $('a-close').addEventListener('click', closeModal); $('a-cancel').addEventListener('click', closeModal);
    $('a-save').addEventListener('click', async () => {
      const r = await api('/api/admin/admins', { method: 'POST', body: { name: $('a-name').value, email: $('a-email').value, role: $('a-role').value, password: $('a-pass').value } });
      if (r.ok) { toast('Admin created.', 'success'); closeModal(); loadAdmins(); } else toast(r.data.error || 'Failed.', 'error');
    });
  }

  /* ---------------- Audit ---------------- */
  async function viewAudit() {
    const page = $('page');
    page.innerHTML = `<div class="page-head"><div><h1>Audit Log</h1><p>Record of administrative actions</p></div></div><div class="panel"><div class="table-wrap"><table class="data"><thead><tr><th class="nosort">When</th><th class="nosort">Admin</th><th class="nosort">Action</th><th class="nosort">Entity</th><th class="nosort">Details</th></tr></thead><tbody id="a-rows"><tr><td colspan="5" style="text-align:center;padding:2rem"><span class="spinner spinner-navy" style="width:22px;height:22px;margin:auto"></span></td></tr></tbody></table></div></div>`;
    const { ok, data } = await api('/api/admin/audit');
    const tb = $('a-rows');
    if (!ok) { tb.innerHTML = '<tr><td colspan="5">Failed.</td></tr>'; return; }
    tb.innerHTML = data.logs.length ? data.logs.map((l) => `<tr><td class="muted-cell" style="font-size:.82rem">${escapeHtml(l.created_at)}</td><td>${escapeHtml(l.admin_email || '—')}</td><td><span class="chip chip-navy">${escapeHtml(l.action)}</span></td><td class="muted-cell">${escapeHtml((l.entity || '') + (l.entity_id ? ' #' + l.entity_id : ''))}</td><td class="muted-cell" style="font-size:.82rem;max-width:260px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(l.details || '')}</td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--muted)">No activity yet.</td></tr>';
  }

  /* ---------------- Export ---------------- */
  function doExport(format, extra) {
    const p = new URLSearchParams();
    const src = extra || { q: pState.q, status: pState.status, group: pState.group, gender: pState.gender, worker: pState.worker, tier: pState.tier, checkedIn: pState.checkedIn };
    Object.entries(src).forEach(([k, v]) => { if (v) p.set(k, v); });
    p.set('format', format);
    window.open('/api/admin/export?' + p.toString(), '_blank');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
