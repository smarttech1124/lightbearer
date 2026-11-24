'use strict';

const QRCode = require('qrcode');
const config = require('../config');

/**
 * The QR / barcode encodes a verification URL carrying a unique opaque token
 * — NOT the participant's personal data. Scanning it opens the secure check-in
 * lookup, so sensitive info is never exposed on the printed/encoded code itself.
 */
function verifyUrl(token) {
  return `${config.publicBaseUrl}/verify/${token}`;
}

const QR_OPTS = {
  errorCorrectionLevel: 'M',
  margin: 2,
  width: 420,
  color: { dark: '#0b1437', light: '#ffffff' },
};

async function qrDataUrl(participant) {
  return QRCode.toDataURL(verifyUrl(participant.verify_token), QR_OPTS);
}

async function qrPngBuffer(participant) {
  return QRCode.toBuffer(verifyUrl(participant.verify_token), { ...QR_OPTS, type: 'png' });
}

// SVG string (crisp, scalable — used on the confirmation page / print)
async function qrSvg(participant) {
  return QRCode.toString(verifyUrl(participant.verify_token), { ...QR_OPTS, type: 'svg' });
}

module.exports = { verifyUrl, qrDataUrl, qrPngBuffer, qrSvg };
