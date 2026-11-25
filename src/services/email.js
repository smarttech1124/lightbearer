'use strict';

const config = require('../config');
const notifications = require('./notifications');
const settings = require('./settings');
const barcode = require('./barcode');
const { formatMoney, escapeHtml } = require('../utils/helpers');

/* ------------------------------------------------------------------ *
 *  Transport: Resend (preferred) → console (dev fallback)
 * ------------------------------------------------------------------ */
async function deliverResend({ from, to, subject, html, attachments }) {
  const body = { from, to: [to], subject, html };
  if (attachments && attachments.length) {
    body.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: a.buffer.toString('base64'),
    }));
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.mail.resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

async function deliver(msg) {
  if (config.mail.provider === 'resend') return deliverResend(msg);
  console.log(`[email:console] -> ${msg.to} :: ${msg.subject} (not sent; set RESEND_API_KEY to deliver)`);
  return { id: 'console' };
}

/* ------------------------------------------------------------------ *
 *  Templates
 * ------------------------------------------------------------------ */
const BRAND = { navy: '#0b1437', navy2: '#16205a', gold: '#e7b43b', gold2: '#f7dc93', cream: '#f7f3ea', ink: '#1c2340', muted: '#6b7280' };

function shell(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${BRAND.cream};">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:${BRAND.ink};">
    <div style="background:linear-gradient(135deg,${BRAND.navy},${BRAND.navy2});border-radius:18px 18px 0 0;padding:28px 28px 22px;text-align:center;">
      <div style="display:inline-block;width:46px;height:46px;border-radius:50%;background:${BRAND.gold};line-height:46px;font-size:22px;color:${BRAND.navy};font-weight:800;">&#10022;</div>
      <h1 style="color:#fff;font-size:20px;margin:14px 0 2px;letter-spacing:.3px;">${escapeHtml(config.event.name)}</h1>
      <p style="color:${BRAND.gold};font-size:12px;margin:0;letter-spacing:2px;text-transform:uppercase;">Light Bearers</p>
    </div>
    <div style="background:#ffffff;border:1px solid #eadfbf;border-top:none;border-radius:0 0 18px 18px;padding:28px;">
      <h2 style="font-size:18px;margin:0 0 12px;color:${BRAND.navy};">${escapeHtml(title)}</h2>
      ${bodyHtml}
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0 14px;">
      <p style="font-size:12px;color:${BRAND.muted};margin:0;">Automated message from the ${escapeHtml(config.event.name)} portal.</p>
    </div>
  </div></body></html>`;
}

function detailRow(label, value) {
  return `<tr><td style="padding:8px 0;color:${BRAND.muted};font-size:13px;width:45%;">${escapeHtml(label)}</td><td style="padding:8px 0;color:${BRAND.ink};font-size:14px;font-weight:600;">${value}</td></tr>`;
}

function qrUrl(participant) {
  return `${config.publicBaseUrl}/api/qr/${participant.verify_token}.png`;
}

/* ------------------------------------------------------------------ *
 *  Sender (logs + retries every message)
 * ------------------------------------------------------------------ */
async function send({ participant, to, subject, kind, html, attachQr = false }) {
  const notifId = await notifications.create({
    participantId: participant ? participant.id : null,
    channel: 'email',
    kind,
    recipient: to,
    payload: { subject, provider: config.mail.provider },
  });

  let attachments = [];
  if (attachQr && participant) {
    try {
      const png = await barcode.qrPngBuffer(participant);
      attachments.push({ filename: `ticket-${participant.reference}.png`, buffer: png, contentType: 'image/png' });
    } catch (e) { /* non-fatal */ }
  }

  const maxAttempts = 3;
  let lastErr;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const info = await deliver({ from: config.mail.from, to, subject, html, attachments });
      await notifications.markSent(notifId);
      console.log(`[email:${config.mail.provider}] sent -> ${to} :: ${subject} (${(info && (info.id || info.messageId)) || 'ok'})`);
      return { ok: true, notifId };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  await notifications.markFailed(notifId, lastErr);
  console.error(`[email] FAILED -> ${to} :: ${subject} :: ${lastErr && lastErr.message}`);
  return { ok: false, notifId, error: lastErr };
}

/* ------------------------------------------------------------------ *
 *  Participant emails
 * ------------------------------------------------------------------ */
async function sendRegistrationEmail(participant) {
  const sym = config.event.currencySymbol;
  const bank = await settings.bank();
  const fee = formatMoney(participant.fee_amount, sym);
  const ticketUrl = `${config.publicBaseUrl}/ticket/${participant.verify_token}`;
  const tierLabel = participant.fee_tier === 'early_bird' ? 'Early Bird &#127881;' : 'Regular';

  const body = `
    <p style="font-size:14px;line-height:1.6;">Dear ${escapeHtml(participant.first_name)}, your registration is received. Please complete your payment to confirm your spot.</p>
    <div style="background:${BRAND.cream};border:1px solid #eadfbf;border-radius:12px;padding:16px 18px;margin:16px 0;">
      <p style="margin:0 0 6px;color:${BRAND.muted};font-size:12px;text-transform:uppercase;letter-spacing:1px;">Your registration reference</p>
      <p style="margin:0;font-size:26px;font-weight:800;letter-spacing:2px;color:${BRAND.navy};">${escapeHtml(participant.reference)}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      ${detailRow('Name', escapeHtml(participant.first_name + ' ' + participant.last_name))}
      ${detailRow('Assigned Group', `<span style="color:${BRAND.gold};">${escapeHtml(participant.group_name)}</span>`)}
      ${detailRow('Fee Category', tierLabel)}
      ${detailRow('Amount to Pay', `<span style="font-size:16px;">${fee}</span>`)}
    </table>
    <h3 style="margin:22px 0 8px;color:${BRAND.navy};font-size:15px;">Bank Transfer Details</h3>
    <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:10px;">
      ${detailRow('Bank', escapeHtml(bank.name))}
      ${detailRow('Account Name', escapeHtml(bank.accountName))}
      ${detailRow('Account Number', escapeHtml(bank.accountNumber))}
      ${detailRow('Use as Narration / Remark', `<span style="color:${BRAND.navy};font-weight:800;">${escapeHtml(participant.reference)}</span>`)}
    </table>
    <p style="font-size:13px;line-height:1.6;color:${BRAND.muted};margin:16px 0;">&#9888;&#65039; Important: enter your reference <strong>${escapeHtml(participant.reference)}</strong> as the transfer narration so we can match your payment.</p>
    <div style="text-align:center;margin:20px 0 8px;">
      <p style="margin:0 0 10px;color:${BRAND.muted};font-size:13px;">Your event check-in code</p>
      <img src="${qrUrl(participant)}" alt="Check-in QR code" width="200" height="200" style="border:8px solid #fff;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.08);"/>
      <p style="margin:8px 0 0;color:${BRAND.muted};font-size:11px;">(also attached to this email)</p>
    </div>
    <div style="text-align:center;margin:18px 0 4px;">
      <a href="${escapeHtml(ticketUrl)}" style="display:inline-block;background:${BRAND.navy};color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:600;font-size:14px;">Upload Payment Receipt &#8594;</a>
    </div>`;

  return send({
    participant,
    to: participant.email,
    subject: `✦ Registration received — ${participant.reference}`,
    kind: 'registration',
    html: shell('Registration Received', body),
    attachQr: true,
  });
}

async function sendPaymentConfirmedEmail(participant) {
  const ticketUrl = `${config.publicBaseUrl}/ticket/${participant.verify_token}`;
  const body = `
    <p style="font-size:14px;line-height:1.6;">Great news, ${escapeHtml(participant.first_name)}! Your payment has been <strong style="color:#128a4a;">confirmed</strong>. You are all set for the picnic. &#127882;</p>
    <table style="width:100%;border-collapse:collapse;">
      ${detailRow('Reference', escapeHtml(participant.reference))}
      ${detailRow('Group', `<span style="color:${BRAND.gold};">${escapeHtml(participant.group_name)}</span>`)}
      ${detailRow('Status', '<span style="color:#128a4a;font-weight:700;">Confirmed &#10003;</span>')}
    </table>
    <div style="text-align:center;margin:18px 0 8px;">
      <p style="margin:0 0 10px;color:${BRAND.muted};font-size:13px;">Present this code at the venue</p>
      <img src="${qrUrl(participant)}" alt="Check-in QR code" width="200" height="200" style="border:8px solid #fff;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.08);"/>
    </div>
    <div style="text-align:center;margin:14px 0 4px;">
      <a href="${escapeHtml(ticketUrl)}" style="display:inline-block;background:${BRAND.navy};color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:600;font-size:14px;">View My Ticket &#8594;</a>
    </div>`;
  return send({
    participant,
    to: participant.email,
    subject: `✅ Payment confirmed — ${participant.reference}`,
    kind: 'payment_confirmed',
    html: shell('Payment Confirmed', body),
    attachQr: true,
  });
}

async function sendPaymentRejectedEmail(participant, reason) {
  const ticketUrl = `${config.publicBaseUrl}/ticket/${participant.verify_token}`;
  const body = `
    <p style="font-size:14px;line-height:1.6;">Hi ${escapeHtml(participant.first_name)}, we were unable to verify the payment for reference <strong>${escapeHtml(participant.reference)}</strong>.</p>
    ${reason ? `<div style="background:#fff6f6;border:1px solid #f3c9c9;border-radius:10px;padding:12px 14px;margin:12px 0;color:#9b2c2c;font-size:13px;">Reason: ${escapeHtml(reason)}</div>` : ''}
    <p style="font-size:14px;line-height:1.6;">Please re-check your transfer and upload a valid receipt again using the button below.</p>
    <div style="text-align:center;margin:18px 0 4px;">
      <a href="${escapeHtml(ticketUrl)}" style="display:inline-block;background:${BRAND.navy};color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:600;font-size:14px;">Re-upload Receipt &#8594;</a>
    </div>`;
  return send({
    participant,
    to: participant.email,
    subject: `⚠️ Payment needs attention — ${participant.reference}`,
    kind: 'payment_rejected',
    html: shell('Payment Could Not Be Verified', body),
  });
}

/* ------------------------------------------------------------------ *
 *  Admin notification (replaces WhatsApp): a receipt was uploaded
 * ------------------------------------------------------------------ */
async function sendReceiptAdminEmail(participant) {
  const to = await settings.notifyEmail();
  const sym = config.event.currencySymbol;
  const dash = `${config.publicBaseUrl}/admin`;
  const body = `
    <p style="font-size:14px;line-height:1.6;">A participant has uploaded a payment receipt and is awaiting verification.</p>
    <table style="width:100%;border-collapse:collapse;">
      ${detailRow('Name', escapeHtml(participant.first_name + ' ' + participant.last_name))}
      ${detailRow('Email', escapeHtml(participant.email))}
      ${detailRow('WhatsApp', escapeHtml(participant.phone))}
      ${detailRow('Reference', `<strong>${escapeHtml(participant.reference)}</strong>`)}
      ${detailRow('Group', escapeHtml(participant.group_name))}
      ${detailRow('Expected Amount', formatMoney(participant.fee_amount, sym))}
    </table>
    <div style="text-align:center;margin:20px 0 4px;">
      <a href="${escapeHtml(dash)}" style="display:inline-block;background:${BRAND.navy};color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:600;font-size:14px;">Review &amp; Verify in Dashboard &#8594;</a>
    </div>`;
  return send({
    participant,
    to,
    subject: `🧾 Receipt to verify — ${participant.reference}`,
    kind: 'receipt_admin',
    html: shell('New Payment Receipt Uploaded', body),
  });
}

module.exports = {
  sendRegistrationEmail,
  sendPaymentConfirmedEmail,
  sendPaymentRejectedEmail,
  sendReceiptAdminEmail,
};
