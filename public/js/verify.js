/* QR check-in / verification page (staff) */
(function () {
  'use strict';
  const { api, toast, money } = window.LB;
  const $ = (id) => document.getElementById(id);

  const parts = location.pathname.split('/').filter(Boolean);
  const token = parts[1] || '';
  let info = null;

  function card(kind, title, subtitle, extra) {
    const colors = {
      ok: { bg: 'var(--success-bg)', fg: 'var(--success)', icon: '✓' },
      warn: { bg: 'var(--warning-bg)', fg: 'var(--warning)', icon: '!' },
      bad: { bg: 'var(--danger-bg)', fg: 'var(--danger)', icon: '✕' },
    }[kind];
    return `
      <div class="card" style="overflow:hidden">
        <div style="background:${colors.bg};color:${colors.fg};padding:2rem;text-align:center">
          <div style="width:72px;height:72px;border-radius:50%;background:${colors.fg};color:#fff;display:flex;align-items:center;justify-content:center;font-size:2.2rem;margin:0 auto 1rem">${colors.icon}</div>
          <h2 style="color:${colors.fg};font-size:1.6rem">${title}</h2>
          <p style="margin:.4rem 0 0;color:${colors.fg};opacity:.85">${subtitle}</p>
        </div>
        ${extra || ''}
      </div>`;
  }

  function personRows(p) {
    return `
      <div class="ticket-body">
        <div class="detail-list">
          <div class="detail-row"><span class="k">Name</span><span class="v">${window.LB.escapeHtml(p.first_name + ' ' + p.last_name)}</span></div>
          <div class="detail-row"><span class="k">Reference</span><span class="v">${window.LB.escapeHtml(p.reference)}</span></div>
          <div class="detail-row"><span class="k">Group</span><span class="v text-gold">${window.LB.escapeHtml(p.group_name)}</span></div>
          <div class="detail-row"><span class="k">Payment</span><span class="v">${window.LB.statusMeta(p.payment_status).label}</span></div>
        </div>
      </div>`;
  }

  function renderEligible(p) {
    const extra = personRows(p) + `<div style="padding:0 1.8rem 1.8rem"><button class="btn btn-success btn-block btn-lg" id="checkin-btn"><span class="btn-label">✓ Check in &amp; Admit</span></button></div>`;
    $('result').innerHTML = card('ok', 'Valid ticket', 'Payment confirmed — ready to admit.', extra);
    $('checkin-btn').addEventListener('click', doCheckIn);
  }

  function renderAlready(p) {
    $('result').innerHTML = card('warn', 'Already checked in', `Admitted at ${p.checked_in_at || 'earlier'}.`, personRows(p));
  }
  function renderNotConfirmed(p) {
    $('result').innerHTML = card('bad', 'Not admitted', 'Payment is not confirmed for this participant.', personRows(p));
  }
  function renderAdmitted(p) {
    $('result').innerHTML = card('ok', 'Admitted ✓', `${p.first_name} ${p.last_name} — ${p.group_name}`, personRows(p));
    toast('Checked in successfully!', 'success');
  }

  async function doCheckIn() {
    const btn = $('checkin-btn');
    btn.disabled = true;
    btn.querySelector('.btn-label').innerHTML = '<span class="spinner"></span> Checking in…';
    const { ok, data } = await api(`/api/admin/verify/${token}/checkin`, { method: 'POST' });
    if (ok) { renderAdmitted(data.participant); }
    else {
      if (data.participant && data.participant.checked_in) renderAlready(data.participant);
      else { toast(data.error || 'Check-in failed.', 'error'); btn.disabled = false; btn.querySelector('.btn-label').textContent = '✓ Check in & Admit'; }
    }
  }

  async function init() {
    if (!token) { $('loading').classList.add('util-hidden'); toast('Invalid code.', 'error'); return; }

    // Check auth
    const me = await api('/api/auth/me');
    if (!me.ok) {
      $('loading').classList.add('util-hidden');
      $('login-link').href = `/admin?return=${encodeURIComponent(location.pathname)}`;
      $('need-login').classList.remove('util-hidden');
      return;
    }

    const { ok, data } = await api(`/api/admin/verify/${token}`);
    $('loading').classList.add('util-hidden');
    if (!ok) { $('result').classList.remove('util-hidden'); $('result').innerHTML = card('bad', 'Unknown code', data.error || 'This code is not recognised.'); return; }

    info = data;
    $('result').classList.remove('util-hidden');
    if (data.alreadyCheckedIn) renderAlready(data.participant);
    else if (data.eligible) renderEligible(data.participant);
    else renderNotConfirmed(data.participant);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
