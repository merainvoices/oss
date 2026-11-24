// @merainvoices/gstin — GSTIN and PAN checks for Indian GST.
//
// A GSTIN is 15 characters:
//   [0-9]{2}     state code
//   [A-Z]{5}     PAN letters 1–5
//   [0-9]{4}     PAN digits 6–9
//   [A-Z]        PAN letter 10
//   [1-9A-Z]     registration number for this PAN in this state
//   Z            fixed
//   [0-9A-Z]     check digit (mod-36)
//
// Zero dependencies. Works in Node, browsers, React Native and edge runtimes.

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/

// GST state codes. 28 is the pre-2014 Andhra Pradesh code, still seen on old
// registrations; 97 and 99 are not states but are valid GSTIN prefixes.
const STATE_TABLE = [
  ['01', 'Jammu & Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'],
  ['04', 'Chandigarh'], ['05', 'Uttarakhand'], ['06', 'Haryana'],
  ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'],
  ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'],
  ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'],
  ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'],
  ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'],
  ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'],
  ['25', 'Daman & Diu'], ['26', 'Dadra & Nagar Haveli and Daman & Diu'],
  ['27', 'Maharashtra'], ['28', 'Andhra Pradesh (old)'], ['29', 'Karnataka'],
  ['30', 'Goa'], ['31', 'Lakshadweep'], ['32', 'Kerala'],
  ['33', 'Tamil Nadu'], ['34', 'Puducherry'], ['35', 'Andaman & Nicobar Islands'],
  ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'],
  ['97', 'Other Territory'], ['99', 'Centre Jurisdiction'],
]
const STATE_NAMES = new Map(STATE_TABLE)

/** Every code a GSTIN may start with, with its name. */
export const STATE_CODES = Object.freeze(STATE_TABLE.map(([code, name]) => Object.freeze({ code, name })))

/**
 * States and union territories for a place-of-supply picker, sorted by name.
 * Leaves out the old Andhra Pradesh code (28) and the non-state codes 97/99.
 */
export const STATES = Object.freeze(
  STATE_CODES
    .filter((s) => !['28', '97', '99'].includes(s.code))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name)),
)

/** Name for a 2-digit GST state code, or null. */
export function stateName(code) {
  if (code == null) return null
  return STATE_NAMES.get(String(code).trim().padStart(2, '0')) ?? null
}

/** Trim and uppercase. Returns '' for null/undefined. */
export function normalizeGSTIN(input) {
  return input == null ? '' : String(input).trim().toUpperCase()
}

/**
 * The check digit for the first 14 characters of a GSTIN.
 * Throws if any character is outside 0-9/A-Z.
 */
export function gstinCheckDigit(first14) {
  const s = normalizeGSTIN(first14).slice(0, 14)
  if (s.length !== 14) throw new RangeError('gstinCheckDigit needs the first 14 characters of a GSTIN')
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(s[i])
    if (v === -1) throw new RangeError(`Invalid GSTIN character: ${s[i]}`)
    const product = v * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(product / 36) + (product % 36)
  }
  return CHARS[(36 - (sum % 36)) % 36]
}

/**
 * Validate a GSTIN.
 * @returns {{ valid: boolean, gstin: string, code: null|'EMPTY'|'LENGTH'|'FORMAT'|'STATE'|'CHECKSUM', error: string|null }}
 *   `gstin` is the trimmed, uppercased input. `code` is stable for
 *   translations; `error` is an English message.
 */
export function validateGSTIN(input) {
  const g = normalizeGSTIN(input)
  const fail = (code, error) => ({ valid: false, gstin: g, code, error })
  if (!g) return fail('EMPTY', 'Enter a GSTIN')
  if (g.length !== 15) return fail('LENGTH', 'A GSTIN has exactly 15 characters')
  if (!GSTIN_REGEX.test(g)) return fail('FORMAT', 'This is not in GSTIN format (for example 27AAPFU0939F1ZV)')
  if (!STATE_NAMES.has(g.slice(0, 2))) return fail('STATE', `${g.slice(0, 2)} is not a GST state code`)
  if (gstinCheckDigit(g) !== g[14]) return fail('CHECKSUM', 'The last character does not match — check the GSTIN for a typo')
  return { valid: true, gstin: g, code: null, error: null }
}

/** True when validateGSTIN would pass. */
export function isValidGSTIN(input) {
  return validateGSTIN(input).valid
}

/**
 * The 2-digit state code at the start of a GSTIN, or null when the prefix is
 * not a GST state code. Works on a partly typed GSTIN (only the first two
 * characters are read), so a form can fill the state as soon as they appear.
 */
export function stateCodeFromGSTIN(gstin) {
  const g = normalizeGSTIN(gstin)
  if (g.length < 2) return null
  const code = g.slice(0, 2)
  return STATE_NAMES.has(code) ? code : null
}

/** State name for a GSTIN's prefix, or null. */
export function stateFromGSTIN(gstin) {
  const code = stateCodeFromGSTIN(gstin)
  return code ? STATE_NAMES.get(code) : null
}

/** The PAN inside a GSTIN (characters 3–12), or null if too short. */
export function panFromGSTIN(gstin) {
  const g = normalizeGSTIN(gstin)
  return g.length >= 12 ? g.slice(2, 12) : null
}

/** True for a well-formed PAN (format only — there is no public PAN checksum). */
export function isValidPAN(pan) {
  return PAN_REGEX.test(normalizeGSTIN(pan))
}

const PAN_HOLDER_TYPES = {
  P: 'Individual',
  C: 'Company',
  H: 'Hindu Undivided Family (HUF)',
  F: 'Firm / LLP',
  A: 'Association of Persons (AOP)',
  T: 'Trust',
  B: 'Body of Individuals (BOI)',
  L: 'Local Authority',
  J: 'Artificial Juridical Person',
  G: 'Government',
}

/** Holder type from a PAN's 4th character (e.g. 'C' → 'Company'), or null. */
export function panHolderType(pan) {
  const p = normalizeGSTIN(pan)
  return p.length >= 4 ? PAN_HOLDER_TYPES[p[3]] ?? null : null
}

/**
 * A party's effective state code for the CGST+SGST vs IGST decision.
 * The GSTIN prefix wins over a separately stored state code (a registered
 * party's state is fixed by its registration; stored codes go stale). The
 * stored code is used only when there is no usable GSTIN, e.g. an
 * unregistered buyer.
 * @param {{ gstin?: string|null, stateCode?: string|number|null }} party
 */
export function resolveStateCode({ gstin, stateCode } = {}) {
  const fromGstin = stateCodeFromGSTIN(gstin)
  if (fromGstin) return fromGstin
  const sc = stateCode != null ? String(stateCode).trim() : ''
  return sc ? sc.padStart(2, '0') : null
}

/**
 * Is this an inter-state supply (IGST) rather than intra-state (CGST+SGST)?
 *
 *   1. No buyer → false.
 *   2. SEZ buyer → true, wherever it is (s. 7(5)(b) IGST Act).
 *   3. Otherwise compare state codes from resolveStateCode. A ship-to state
 *      code, when given, replaces the buyer's (place of supply follows the
 *      goods).
 *   4. If either side's state is unknown → false.
 *
 * Exports and other document-level cases are the caller's to add.
 *
 * @param {{ seller?: Party, buyer?: Party|null, shipToStateCode?: string|null }} args
 * @typedef {{ gstin?: string|null, stateCode?: string|number|null, sez?: boolean }} Party
 */
export function isInterStateSupply({ seller = {}, buyer = null, shipToStateCode = null } = {}) {
  if (!buyer) return false
  if (buyer.sez) return true
  const sellerCode = resolveStateCode(seller ?? {})
  const buyerCode = shipToStateCode
    ? String(shipToStateCode).trim().padStart(2, '0')
    : resolveStateCode(buyer)
  return Boolean(sellerCode && buyerCode && sellerCode !== buyerCode)
}
