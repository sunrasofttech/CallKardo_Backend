/**
 * Normalizes a mobile number to a single canonical E.164-style format
 * so the same real-world number can never be stored twice under different
 * formats (e.g. "9876543210", "09876543210", "919876543210", "+919876543210").
 * Defaults to India (+91) country code when none is present.
 */
function normalizeMobile(raw) {
  if (!raw) return raw;

  let digits = String(raw).trim().replace(/[^\d+]/g, '').replace(/\+/g, '');
  digits = digits.replace(/^0+/, '');

  if (digits.length === 10) {
    digits = `91${digits}`;
  }

  return `+${digits}`;
}

module.exports = { normalizeMobile };
