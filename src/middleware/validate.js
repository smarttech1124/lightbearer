'use strict';

const { cleanString, titleCase, isEmail, normalisePhone, isPhone } = require('../utils/helpers');

const DEPARTMENTS = ['Media', 'Choir', 'Ushering Unit', 'Technical Unit', 'Protocol', 'Welfare', 'Other'];
const GENDERS = ['Male', 'Female'];

/**
 * Validate & normalise a registration payload (server-side; never trust the client).
 * @returns {{ok:boolean, data?:object, errors?:object}}
 */
function validateRegistration(body = {}) {
  const errors = {};
  const first_name = titleCase(cleanString(body.first_name, 60));
  const last_name = titleCase(cleanString(body.last_name, 60));
  const email = cleanString(body.email, 160).toLowerCase();
  const phoneRaw = cleanString(body.phone, 30);
  const phone = normalisePhone(phoneRaw);
  const gender = cleanString(body.gender, 10);

  // worker flag accepts boolean, "yes"/"no", "true"/"false"
  const workerVal = body.is_worker;
  const is_worker =
    workerVal === true ||
    workerVal === 1 ||
    ['yes', 'true', '1'].includes(String(workerVal).toLowerCase());

  let department = null;

  if (!first_name || first_name.length < 2) errors.first_name = 'Please enter your first name.';
  if (!last_name || last_name.length < 2) errors.last_name = 'Please enter your last name.';
  if (!email || !isEmail(email)) errors.email = 'Please enter a valid email address.';
  if (!phone || !isPhone(phone)) errors.phone = 'Please enter a valid WhatsApp phone number.';
  if (!GENDERS.includes(gender)) errors.gender = 'Please select your gender.';

  if (is_worker) {
    const dept = cleanString(body.department, 60);
    if (dept === 'Other') {
      const other = cleanString(body.department_other, 60);
      if (!other || other.length < 2) {
        errors.department = 'Please specify your department.';
      } else {
        department = titleCase(other);
      }
    } else if (DEPARTMENTS.includes(dept)) {
      department = dept;
    } else {
      errors.department = 'Please select your department or unit.';
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    data: { first_name, last_name, email, phone, gender, is_worker, department },
  };
}

module.exports = { validateRegistration, DEPARTMENTS, GENDERS };
