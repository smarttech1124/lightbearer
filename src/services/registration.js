'use strict';

const config = require('../config');
const { db, getSetting } = require('../db');
const { pickGroup } = require('./groups');
const { randomRefSegment, randomToken } = require('../utils/helpers');

class RegistrationError extends Error {
  constructor(message, code = 'INVALID', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function makeReference() {
  const yy = new Date().getFullYear().toString().slice(-2);
  return `LB${yy}-${randomRefSegment(5)}`;
}

const findByEmail = db.prepare('SELECT id FROM participants WHERE email = ?');
const countAll = db.prepare('SELECT COUNT(*) AS n FROM participants');
const insertParticipant = db.prepare(`
  INSERT INTO participants
    (reference, verify_token, first_name, last_name, email, phone, gender,
     is_worker, department, group_name, fee_tier, fee_amount, payment_status)
  VALUES
    (@reference, @verify_token, @first_name, @last_name, @email, @phone, @gender,
     @is_worker, @department, @group_name, @fee_tier, @fee_amount, 'awaiting_payment')
`);

/**
 * Atomically register a participant.
 *  - decides early-bird vs regular fee based on registration order
 *  - allocates a balanced, random group
 *  - generates a unique reference + verification token
 * All within a single IMMEDIATE transaction so concurrent registrations cannot
 * over-allocate early-bird slots, duplicate references, or unbalance groups.
 *
 * @param {object} data  already-validated & normalised participant fields
 * @returns {object} the inserted participant row
 */
const registerTx = db.transaction((data) => {
  if (getSetting('registration_open', 'true') !== 'true') {
    throw new RegistrationError('Registration is currently closed.', 'CLOSED', 403);
  }

  if (findByEmail.get(data.email)) {
    throw new RegistrationError(
      'This email address is already registered. Each person can register once.',
      'DUPLICATE_EMAIL',
      409
    );
  }

  const existing = countAll.get().n;
  const isEarly = existing < config.event.earlyBirdLimit;
  const fee_tier = isEarly ? 'early_bird' : 'regular';
  const fee_amount = isEarly ? config.event.earlyBirdFee : config.event.regularFee;

  const group_name = pickGroup();

  // Insert with unique reference/token; retry on the (astronomically rare) collision.
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    const reference = makeReference();
    const verify_token = randomToken(24);
    try {
      const info = insertParticipant.run({
        reference,
        verify_token,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone,
        gender: data.gender,
        is_worker: data.is_worker ? 1 : 0,
        department: data.is_worker ? data.department : null,
        group_name,
        fee_tier,
        fee_amount,
      });
      return db.prepare('SELECT * FROM participants WHERE id = ?').get(info.lastInsertRowid);
    } catch (err) {
      // Unique collision on reference/verify_token -> regenerate and retry.
      if (String(err.message).includes('UNIQUE') &&
          /reference|verify_token/.test(String(err.message))) {
        lastErr = err;
        continue;
      }
      // Email race (two simultaneous inserts of same email)
      if (String(err.message).includes('UNIQUE') && /email/.test(String(err.message))) {
        throw new RegistrationError(
          'This email address is already registered.',
          'DUPLICATE_EMAIL',
          409
        );
      }
      throw err;
    }
  }
  throw lastErr || new RegistrationError('Could not generate a unique reference, please retry.', 'REF_FAIL', 500);
});

function register(data) {
  // Use IMMEDIATE so the write lock is taken up-front (multi-process safe).
  return registerTx.immediate(data);
}

module.exports = { register, RegistrationError, makeReference };
