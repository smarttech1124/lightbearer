'use strict';

const { getSetting, setSetting } = require('../db');
const config = require('../config');

/**
 * Runtime settings. Values are stored in the `settings` table and fall back to
 * the .env-provided defaults when not set. This lets admins edit bank details
 * and the notification email from the portal without touching the server.
 */

function bank() {
  return {
    name: getSetting('bank_name') || config.bank.name,
    accountName: getSetting('bank_account_name') || config.bank.accountName,
    accountNumber: getSetting('bank_account_number') || config.bank.accountNumber,
  };
}

function setBank({ name, accountName, accountNumber }) {
  if (name != null) setSetting('bank_name', String(name).trim());
  if (accountName != null) setSetting('bank_account_name', String(accountName).trim());
  if (accountNumber != null) setSetting('bank_account_number', String(accountNumber).trim());
  return bank();
}

function notifyEmail() {
  return (getSetting('notify_email') || config.notifyEmailDefault || '').toLowerCase().trim();
}

function setNotifyEmail(email) {
  setSetting('notify_email', String(email || '').toLowerCase().trim());
  return notifyEmail();
}

function registrationOpen() {
  return getSetting('registration_open', 'true') === 'true';
}

function setRegistrationOpen(open) {
  setSetting('registration_open', open ? 'true' : 'false');
  return registrationOpen();
}

module.exports = {
  bank,
  setBank,
  notifyEmail,
  setNotifyEmail,
  registrationOpen,
  setRegistrationOpen,
};
