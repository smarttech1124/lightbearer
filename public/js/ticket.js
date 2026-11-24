/* Ticket / confirmation / receipt-upload page */
(function () {
  'use strict';
  const { api, toast, money, copy, statusMeta } = window.LB;
  const $ = (id) => document.getElementById(id);

  const parts = location.pathname.split('/').filter(Boolean);
  const token = parts[1] || '';
  const isNew = new URLSearchParams(location.search).has('new');
  let selectedFile = null;
  let data = null;

  function render() {
    const p = data.participant;
    const sym = data.currencySymbol;
    $('t-ref').textContent = p.reference;
    $('t-name').textContent = p.first_name + ' ' + p.last_name;
    $('t-group').textContent = p.group_name;
    $('t-tier').textContent = p.fee_tier === 'early_bird' ? 'Early Bird' : 'Regular';
    $('t-fee').textContent = money(p.fee_amount, sym);

    const sm = statusMeta(p.payment_status);
    const st = $('t-status');
    st.className = 'status ' + sm.cls;
    st.textContent = sm.label;

    if (data.qr) $('t-qr').src = data.qr;

    // Bank details
    $('b-bank').textContent = data.bank.name;
    $('b-name').textContent = data.bank.accountName;
    $('b-acct').textContent = data.bank.accountNumber;
    $('b-amount').textContent = money(p.fee_amount, sym);
    $('b-ref').textContent = p.reference;

    if (isNew) $('new-banner').classList.remove('util-hidden');

    applyState(p);
  }

  function applyState(p) {
    const pay = $('pay-section');
    const box = $('state-box');
    box.classList.add('util-hidden');
    pay.classList.remove('util-hidden');

    if (p.payment_status === 'confirmed') {
      pay.classList.add('util-hidden');
      box.classList.remove('util-hidden');
      box.innerHTML = `
        <div class="success-badge" style="margin-bottom:1rem"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg></div>
        <h3 style="font-size:1.3rem">Payment confirmed ✓</h3>
        <p class="text-muted">You're all set. Present your QR code at the venue for check-in.</p>
        ${p.checked_in ? '<p style="margin-top:.6rem"><span class="status status-confirmed">Checked in</span></p>' : ''}`;
    } else if (p.payment_status === 'pending_verification') {
      box.classList.remove('util-hidden');
      box.innerHTML = `
        <div style="font-size:2rem">⏳</div>
        <h3 style="font-size:1.2rem">Payment pending verification</h3>
        <p class="text-muted">We've received your receipt and an administrator is reviewing it. You'll get an email once confirmed.</p>
        <button class="btn btn-ghost btn-sm" id="reupload" style="margin-top:1rem">Upload a different receipt</button>`;
      pay.classList.add('util-hidden');
      $('reupload').addEventListener('click', () => { box.classList.add('util-hidden'); pay.classList.remove('util-hidden'); });
    } else if (p.payment_status === 'rejected') {
      box.classList.remove('util-hidden');
      box.innerHTML = `
        <div style="font-size:2rem">⚠️</div>
        <h3 style="font-size:1.2rem;color:var(--danger)">Payment could not be verified</h3>
        <p class="text-muted">${p.admin_remark ? 'Reason: ' + window.LB.escapeHtml(p.admin_remark) + '. ' : ''}Please re-check your transfer and upload a valid receipt below.</p>`;
      // keep pay-section visible for re-upload
    }
  }

  // ---------- File upload ----------
  function wireUpload() {
    const zone = $('drop-zone');
    const input = $('file-input');

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); }));
    zone.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });
    input.addEventListener('change', () => { if (input.files[0]) setFile(input.files[0]); });
    $('fp-remove').addEventListener('click', clearFile);
    $('upload-btn').addEventListener('click', doUpload);
  }

  function setFile(file) {
    const okTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!okTypes.includes(file.type)) { toast('Please choose a JPG, PNG, WEBP or PDF file.', 'error'); return; }
    if (file.size > 8 * 1024 * 1024) { toast('File is too large (max 8MB).', 'error'); return; }
    selectedFile = file;
    $('fp-name').textContent = file.name;
    $('fp-size').textContent = (file.size / 1024).toFixed(0) + ' KB';
    $('file-preview').classList.remove('util-hidden');
    $('upload-btn').disabled = false;
  }

  function clearFile() {
    selectedFile = null;
    $('file-input').value = '';
    $('file-preview').classList.add('util-hidden');
    $('upload-btn').disabled = true;
  }

  async function doUpload() {
    if (!selectedFile) return;
    const btn = $('upload-btn');
    const label = btn.querySelector('.btn-label');
    const orig = label.textContent;
    btn.disabled = true;
    label.innerHTML = '<span class="spinner"></span> Uploading…';

    const fd = new FormData();
    fd.append('receipt', selectedFile);
    const { ok, data: res } = await api(`/api/ticket/${token}/receipt`, { method: 'POST', body: fd });

    if (ok) {
      toast('Receipt uploaded successfully!', 'success');
      data.participant = res.participant;
      clearFile();
      applyState(res.participant);
      $('t-status').className = 'status ' + statusMeta(res.participant.payment_status).cls;
      $('t-status').textContent = statusMeta(res.participant.payment_status).label;
    } else {
      btn.disabled = false;
      label.textContent = orig;
      toast(res.error || 'Upload failed. Please try again.', 'error');
    }
  }

  function wireActions() {
    $('copy-acct').addEventListener('click', (e) => copy(data.bank.accountNumber, e.target));
    $('copy-ref').addEventListener('click', (e) => copy(data.participant.reference, e.target));
    $('print-btn').addEventListener('click', () => window.print());
    $('qr-download').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = data.qr || `/api/qr/${token}.png`;
      a.download = `light-bearers-${data.participant.reference}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    });
  }

  async function init() {
    if (!token) { $('loading').classList.add('util-hidden'); $('notfound').classList.remove('util-hidden'); return; }
    const { ok, data: res } = await api(`/api/ticket/${token}`);
    $('loading').classList.add('util-hidden');
    if (!ok) { $('notfound').classList.remove('util-hidden'); return; }
    data = res;
    $('content').classList.remove('util-hidden');
    render();
    wireUpload();
    wireActions();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
