/* Find my ticket page */
(function () {
  'use strict';
  const { api, toast } = window.LB;
  const $ = (id) => document.getElementById(id);

  async function onSubmit(e) {
    e.preventDefault();
    const reference = $('reference').value.trim().toUpperCase();
    const email = $('email').value.trim().toLowerCase();
    if (!reference || !email) { toast('Enter both your reference and email.', 'error'); return; }

    const btn = $('find-btn');
    const label = btn.querySelector('.btn-label');
    const orig = label.textContent;
    btn.disabled = true;
    label.innerHTML = '<span class="spinner"></span> Searching…';

    const { ok, data } = await api('/api/lookup', { method: 'POST', body: { reference, email } });
    if (ok && data.token) {
      window.location.href = `/ticket/${data.token}`;
      return;
    }
    btn.disabled = false;
    label.textContent = orig;
    toast(data.error || 'No matching registration found.', 'error');
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('find-form').addEventListener('submit', onSubmit);
  });
})();
