'use strict';

const config = require('../config');
const { prisma, Prisma, IS_SQLITE } = require('../db');
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

function isWriteConflict(err) {
  // Prisma: P2034 = transaction write conflict / deadlock (serialization failure)
  return err && err.code === 'P2034';
}
function isUniqueOn(err, field) {
  return err && err.code === 'P2002' && Array.isArray(err.meta?.target) && err.meta.target.includes(field);
}

/**
 * Atomically register a participant:
 *  - early-bird vs regular fee by registration order
 *  - balanced, random group
 *  - unique reference + verification token
 * Runs in a Serializable transaction (on Postgres) so concurrent registrations
 * can't over-allocate early-bird slots or unbalance groups. Retries on write
 * conflicts and on the (astronomically rare) reference/token collision.
 */
async function register(data) {
  const txOpts = IS_SQLITE ? {} : { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

  for (let attempt = 0; attempt < 6; attempt++) {
    const reference = makeReference();
    const verify_token = randomToken(24);
    try {
      return await prisma.$transaction(async (tx) => {
        const open = await tx.setting.findUnique({ where: { key: 'registration_open' } });
        if (open && open.value === 'false') {
          throw new RegistrationError('Registration is currently closed.', 'CLOSED', 403);
        }

        const dup = await tx.participant.findUnique({ where: { email: data.email } });
        if (dup) {
          throw new RegistrationError(
            'This email address is already registered. Each person can register once.',
            'DUPLICATE_EMAIL',
            409
          );
        }

        const existing = await tx.participant.count();
        const isEarly = existing < config.event.earlyBirdLimit;

        const group_name = await pickGroup(tx);

        return tx.participant.create({
          data: {
            reference,
            verify_token,
            first_name: data.first_name,
            last_name: data.last_name,
            email: data.email,
            phone: data.phone,
            gender: data.gender,
            is_worker: !!data.is_worker,
            department: data.is_worker ? data.department : null,
            group_name,
            fee_tier: isEarly ? 'early_bird' : 'regular',
            fee_amount: isEarly ? config.event.earlyBirdFee : config.event.regularFee,
            payment_status: 'awaiting_payment',
          },
        });
      }, txOpts);
    } catch (err) {
      if (err instanceof RegistrationError) throw err;
      if (isUniqueOn(err, 'email')) {
        throw new RegistrationError('This email address is already registered.', 'DUPLICATE_EMAIL', 409);
      }
      if (isWriteConflict(err) || isUniqueOn(err, 'reference') || isUniqueOn(err, 'verify_token')) {
        continue; // retry with a fresh reference/token / re-read counts
      }
      throw err;
    }
  }
  throw new RegistrationError('Could not complete registration, please try again.', 'RETRY_FAIL', 503);
}

module.exports = { register, RegistrationError, makeReference };
