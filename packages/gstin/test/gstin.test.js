import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateGSTIN, isValidGSTIN, gstinCheckDigit, normalizeGSTIN,
  stateCodeFromGSTIN, stateFromGSTIN, stateName, STATES, STATE_CODES,
  panFromGSTIN, isValidPAN, panHolderType,
  resolveStateCode, isInterStateSupply,
} from '../src/index.js'

// Check digits below were computed with the published mod-36 algorithm.
const VALID = ['27AAPFU0939F1ZV', '29AAGCB7383J1Z4', '36AABCM1234F1ZY', '07AAACP0165G1ZR', '33AABCR1234Q1ZC']

test('valid GSTINs pass', () => {
  for (const g of VALID) {
    assert.deepEqual(validateGSTIN(g), { valid: true, gstin: g, code: null, error: null }, g)
    assert.equal(isValidGSTIN(g), true)
  }
})

test('input is trimmed and uppercased', () => {
  const r = validateGSTIN('  27aapfu0939f1zv ')
  assert.equal(r.valid, true)
  assert.equal(r.gstin, '27AAPFU0939F1ZV')
})

test('each failure has its own code', () => {
  assert.equal(validateGSTIN('').code, 'EMPTY')
  assert.equal(validateGSTIN(null).code, 'EMPTY')
  assert.equal(validateGSTIN('27AAPFU0939F1Z').code, 'LENGTH')
  assert.equal(validateGSTIN('27AAPFU0939F1AV').code, 'FORMAT') // 14th char must be Z
  assert.equal(validateGSTIN('27AAPFU0939F0ZV').code, 'FORMAT') // 13th char cannot be 0
  assert.equal(validateGSTIN('50AAPFU0939F1ZV').code, 'STATE')
  assert.equal(validateGSTIN('27AAPFU0939F1ZW').code, 'CHECKSUM')
  for (const bad of ['', '27AAPFU0939F1Z', '50AAPFU0939F1ZV', '27AAPFU0939F1ZW']) {
    assert.equal(typeof validateGSTIN(bad).error, 'string')
  }
})

test('a one-character typo is caught by the check digit', () => {
  // Swap two adjacent PAN letters; the regex still passes.
  assert.equal(validateGSTIN('27APAFU0939F1ZV').code, 'CHECKSUM')
})

test('gstinCheckDigit', () => {
  assert.equal(gstinCheckDigit('27AAPFU0939F1Z'), 'V')
  assert.equal(gstinCheckDigit('27aapfu0939f1z'), 'V')
  assert.throws(() => gstinCheckDigit('27AAPF'), RangeError)
  assert.throws(() => gstinCheckDigit('27AAPFU0939F1#'), RangeError)
})

test('normalizeGSTIN', () => {
  assert.equal(normalizeGSTIN(undefined), '')
  assert.equal(normalizeGSTIN(' ab '), 'AB')
})

test('state code and name from the prefix', () => {
  assert.equal(stateCodeFromGSTIN('29ABCDE1234F1Z5'), '29')
  assert.equal(stateFromGSTIN('29ABCDE1234F1Z5'), 'Karnataka')
  assert.equal(stateCodeFromGSTIN('97AAAAA0000A1Z5'), '97')
  assert.equal(stateCodeFromGSTIN('99AAAAA0000A1Z5'), '99')
  // A partly typed GSTIN is enough
  assert.equal(stateCodeFromGSTIN('36'), '36')
  for (const bad of ['00ABCDE1234F1Z5', '50ABCDE1234F1Z5', '98ABCDE1234F1Z5', '2', '', null, undefined]) {
    assert.equal(stateCodeFromGSTIN(bad), null, String(bad))
  }
})

test('stateName', () => {
  assert.equal(stateName('36'), 'Telangana')
  assert.equal(stateName(7), 'Delhi')
  assert.equal(stateName(' 38 '), 'Ladakh')
  assert.equal(stateName('00'), null)
  assert.equal(stateName(null), null)
})

test('STATES is a picker list: sorted, no 28/97/99', () => {
  const codes = STATES.map((s) => s.code)
  assert.ok(!codes.includes('28') && !codes.includes('97') && !codes.includes('99'))
  assert.equal(STATES.length, STATE_CODES.length - 3)
  const names = STATES.map((s) => s.name)
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)))
  assert.ok(Object.isFrozen(STATES) && Object.isFrozen(STATES[0]))
})

test('PAN helpers', () => {
  assert.equal(panFromGSTIN('27AAPFU0939F1ZV'), 'AAPFU0939F')
  assert.equal(panFromGSTIN('27AAPF'), null)
  assert.equal(isValidPAN('AAPFU0939F'), true)
  assert.equal(isValidPAN('aapfu0939f'), true)
  assert.equal(isValidPAN('AAPF10939F'), false)
  assert.equal(panHolderType('AAPFU0939F'), 'Firm / LLP')
  assert.equal(panHolderType('ABCPE1234F'), 'Individual')
  assert.equal(panHolderType('ABCXE1234F'), null)
  assert.equal(panHolderType('AB'), null)
})

test('resolveStateCode: the GSTIN prefix wins over a stored code', () => {
  assert.equal(resolveStateCode({ gstin: '29ABCDE1234F1Z5', stateCode: '27' }), '29')
  assert.equal(resolveStateCode({ gstin: '', stateCode: '07' }), '07')
  assert.equal(resolveStateCode({ gstin: '00INVALID0000X1', stateCode: '07' }), '07')
  assert.equal(resolveStateCode({ stateCode: ' 6 ' }), '06')
  assert.equal(resolveStateCode({ stateCode: 9 }), '09')
  assert.equal(resolveStateCode({}), null)
  assert.equal(resolveStateCode(), null)
})

test('isInterStateSupply', () => {
  const TS = { gstin: '36AABCM1234F1ZY', stateCode: '36' }
  const MH = { gstin: '27AAPFU0939F1ZV', stateCode: '27' }

  assert.equal(isInterStateSupply({ seller: TS }), false)
  assert.equal(isInterStateSupply({ seller: TS, buyer: null }), false)
  assert.equal(isInterStateSupply({ seller: TS, buyer: MH }), true)
  assert.equal(isInterStateSupply({ seller: TS, buyer: { ...TS } }), false)
  // SEZ is always IGST, even in the same state
  assert.equal(isInterStateSupply({ seller: TS, buyer: { ...TS, sez: true } }), true)
  // Stale stored code: the GSTIN decides
  assert.equal(isInterStateSupply({ seller: TS, buyer: { gstin: MH.gstin, stateCode: '36' } }), true)
  // Unregistered buyer: stored code is used
  assert.equal(isInterStateSupply({ seller: TS, buyer: { stateCode: '29' } }), true)
  // Ship-to overrides the buyer's state
  assert.equal(isInterStateSupply({ seller: TS, buyer: MH, shipToStateCode: '36' }), false)
  assert.equal(isInterStateSupply({ seller: TS, buyer: { ...TS }, shipToStateCode: '27' }), true)
  // Unknown side → intra-state
  assert.equal(isInterStateSupply({ seller: {}, buyer: MH }), false)
  assert.equal(isInterStateSupply({ seller: TS, buyer: { name: 'Walk-in' } }), false)
})
