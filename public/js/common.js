/* Shared front-end helpers for the Light Bearers portal */
(function () {
  'use strict';

  async function api(path, opts = {}) {
    const options = {
      method: opts.method || 'GET',
      headers: {},
      credentials: 'include',
    };
    if (opts.body !== undefined) {
      if (opts.body instanceof FormData) {
        options.body = opts.body;
      } else {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(opts.body);
      }
    }
    let res, data;
    try {
      res = await fetch(path, options);
    } catch (e) {
      return { ok: false, status: 0, data: { error: 'Network error. Please check your connection.' } };
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      data = await res.json().catch(() => ({}));
    } else {
      data = await res.text().catch(() => '');
    }
    return { ok: res.ok, status: res.status, data };
  }

  function toast(message, type = '') {
    const wrap = document.getElementById('toast-wrap');
    if (!wrap) { console.log('[toast]', message); return; }
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), 300);
    }, type === 'error' ? 6000 : 4000);
  }

  function money(amount, symbol = '₦') {
    return symbol + Number(amount || 0).toLocaleString('en-NG');
  }

  function initReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach((e) => e.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en, i) => {
        if (en.isIntersecting) {
          const el = en.target;
          setTimeout(() => el.classList.add('in'), (i % 4) * 80);
          io.unobserve(el);
        }
      });
    }, { threshold: 0.12 });
    els.forEach((e) => io.observe(e));
  }

  async function copy(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      if (btn) { const t = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => (btn.textContent = t), 1400); }
      else toast('Copied to clipboard', 'success');
    } catch {
      toast('Could not copy. Please copy manually.', 'error');
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function statusMeta(status) {
    return ({
      awaiting_payment: { cls: 'status-awaiting', label: 'Awaiting Payment' },
      pending_verification: { cls: 'status-pending', label: 'Pending Verification' },
      confirmed: { cls: 'status-confirmed', label: 'Confirmed' },
      rejected: { cls: 'status-rejected', label: 'Rejected' },
    })[status] || { cls: 'status-awaiting', label: status };
  }

  document.addEventListener('DOMContentLoaded', () => {
    initReveal();
    const y = document.getElementById('year');
    if (y) y.textContent = new Date().getFullYear();
  });

  window.LB = { api, toast, money, copy, escapeHtml, statusMeta };
})();
