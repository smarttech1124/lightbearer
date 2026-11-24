/* Landing + registration page logic */
(function () {
  'use strict';
  const { api, toast, money } = window.LB;

  let cfg = null;
  const $ = (id) => document.getElementById(id);

  async function loadConfig() {
    const { ok, data } = await api('/api/config');
    if (!ok) { toast('Could not load event details. Please refresh.', 'error'); return; }
    cfg = data;
    const sym = data.event.currencySymbol;

    // Pricing cards
    $('price-early-amount').textContent = money(data.event.earlyBirdFee, sym);
    $('price-regular-amount').textContent = money(data.event.regularFee, sym);
    document.querySelectorAll('[data-eb-limit]').forEach((e) => (e.textContent = data.event.earlyBirdLimit));

    // Hero stats
    $('stat-groups').textContent = data.event.groups.length;
    $('stat-registered').textContent = data.counters.registered;
    $('stat-fee').textContent = money(data.counters.currentFee, sym);

    // Early bird banner
    const banner = $('earlybird-banner');
    if (data.counters.earlyBirdActive) {
      banner.hidden = false;
      $('earlybird-text').textContent = `Early Bird live — only ${data.counters.earlyBirdRemaining} of ${data.event.earlyBirdLimit} discounted slots left!`;
    } else {
      banner.hidden = true;
    }

    // Fee callout in the form
    renderFee();

    // Registration open/closed
    if (!data.registrationOpen) {
      $('closed-notice').classList.remove('util-hidden');
      $('register-form').querySelectorAll('input,select,button').forEach((el) => (el.disabled = true));
    }
  }

  function renderFee() {
    if (!cfg) return;
    const sym = cfg.event.currencySymbol;
    const c = cfg.counters;
    $('fee-amount').textContent = money(c.currentFee, sym);
    if (c.earlyBirdActive) {
      $('fee-label').textContent = 'Early Bird fee (limited)';
      $('fee-note').textContent = `${c.earlyBirdRemaining} discounted slot${c.earlyBirdRemaining === 1 ? '' : 's'} remaining`;
    } else {
      $('fee-label').textContent = 'Registration fee';
      $('fee-note').textContent = 'Standard rate';
    }
  }

  // Worker / department conditional fields
  function wireConditionals() {
    const deptField = $('dept-field');
    const deptOtherField = $('dept-other-field');
    const deptSelect = $('department');

    document.querySelectorAll('input[name="is_worker"]').forEach((r) => {
      r.addEventListener('change', () => {
        const isWorker = document.querySelector('input[name="is_worker"]:checked')?.value === 'yes';
        deptField.classList.toggle('util-hidden', !isWorker);
        if (!isWorker) {
          deptSelect.value = '';
          deptOtherField.classList.add('util-hidden');
          $('department_other').value = '';
        }
      });
    });

    deptSelect.addEventListener('change', () => {
      deptOtherField.classList.toggle('util-hidden', deptSelect.value !== 'Other');
    });
  }

  function clearErrors() {
    document.querySelectorAll('.field.has-error').forEach((f) => f.classList.remove('has-error'));
    document.querySelectorAll('.input.invalid, .select.invalid').forEach((i) => i.classList.remove('invalid'));
  }

  function showErrors(fields) {
    Object.entries(fields || {}).forEach(([name, msg]) => {
      const box = document.querySelector(`[data-error="${name}"]`);
      if (box) {
        box.textContent = msg;
        box.closest('.field').classList.add('has-error');
      }
      const input = document.getElementById(name);
      if (input) input.classList.add('invalid');
    });
    const firstError = document.querySelector('.field.has-error');
    if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function collect() {
    const workerChecked = document.querySelector('input[name="is_worker"]:checked');
    const genderChecked = document.querySelector('input[name="gender"]:checked');
    return {
      first_name: $('first_name').value,
      last_name: $('last_name').value,
      email: $('email').value,
      phone: $('phone').value,
      gender: genderChecked ? genderChecked.value : '',
      is_worker: workerChecked ? workerChecked.value === 'yes' : false,
      department: $('department').value,
      department_other: $('department_other').value,
    };
  }

  function clientValidate(d) {
    const errors = {};
    if (!d.first_name.trim()) errors.first_name = 'Please enter your first name.';
    if (!d.last_name.trim()) errors.last_name = 'Please enter your last name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim())) errors.email = 'Enter a valid email address.';
    if (d.phone.replace(/\D/g, '').length < 7) errors.phone = 'Enter a valid phone number.';
    if (!document.querySelector('input[name="gender"]:checked')) errors.gender = 'Select your gender.';
    if (!document.querySelector('input[name="is_worker"]:checked')) errors.is_worker = 'Let us know your worker status.';
    if (d.is_worker) {
      if (!d.department) errors.department = 'Select your department.';
      else if (d.department === 'Other' && !d.department_other.trim()) errors.department = 'Please specify your department.';
    }
    return errors;
  }

  async function onSubmit(e) {
    e.preventDefault();
    clearErrors();
    const btn = $('submit-btn');
    const label = btn.querySelector('.btn-label');

    const data = collect();
    const errs = clientValidate(data);
    if (Object.keys(errs).length) { showErrors(errs); return; }

    btn.disabled = true;
    const original = label.textContent;
    label.innerHTML = '<span class="spinner"></span> Processing…';

    const { ok, status, data: res } = await api('/api/register', { method: 'POST', body: data });

    if (ok) {
      label.textContent = 'Success! Redirecting…';
      toast('Registration successful! 🎉', 'success');
      const token = res.participant.verify_token;
      setTimeout(() => { window.location.href = `/ticket/${token}?new=1`; }, 700);
      return;
    }

    btn.disabled = false;
    label.textContent = original;
    if (status === 422 && res.fields) {
      showErrors(res.fields);
      toast('Please correct the highlighted fields.', 'error');
    } else {
      toast(res.error || 'Registration failed. Please try again.', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    wireConditionals();
    $('register-form').addEventListener('submit', onSubmit);
  });
})();
