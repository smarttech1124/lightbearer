'use strict';

const { getSetting, setSetting } = require('../db');
const config = require('../config');

/**
 * Runtime settings stored in the DB, falling back to .env defaults. Lets admins
 * edit bank details and the notification email from the portal.
 */

async function bank() {
  const [name, accountName, accountNumber] = await Promise.all([
    getSetting('bank_name'),
    getSetting('bank_account_name'),
    getSetting('bank_account_number'),
  ]);
  return {
    name: name || config.bank.name,
    accountName: accountName || config.bank.accountName,
    accountNumber: accountNumber || config.bank.accountNumber,
  };
}

async function setBank({ name, accountName, accountNumber }) {
  if (name != null) await setSetting('bank_name', String(name).trim());
  if (accountName != null) await setSetting('bank_account_name', String(accountName).trim());
  if (accountNumber != null) await setSetting('bank_account_number', String(accountNumber).trim());
  return bank();
}

async function notifyEmail() {
  const v = await getSetting('notify_email');
  return (v || config.notifyEmailDefault || '').toLowerCase().trim();
}

async function setNotifyEmail(email) {
  await setSetting('notify_email', String(email || '').toLowerCase().trim());
  return notifyEmail();
}

async function registrationOpen() {
  return (await getSetting('registration_open', 'true')) === 'true';
}

async function setRegistrationOpen(open) {
  await setSetting('registration_open', open ? 'true' : 'false');
  return registrationOpen();
}

module.exports = { bank, setBank, notifyEmail, setNotifyEmail, registrationOpen, setRegistrationOpen };
