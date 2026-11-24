import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatIndianNumber, formatINR, numberToWords, amountInWords,
  financialYear, formatInvoiceNumber, checkInvoiceNumber, MAX_INVOICE_NUMBER_LENGTH,
} from '../src/index.js'

test('Indian digit grouping', () => {
  assert.equal(formatIndianNumber(1234567.5), '12,34,567.5')
  assert.equal(formatIndianNumber(100000), '1,00,000')
  assert.equal(formatIndianNumber(999), '999')
  assert.equal(formatIndianNumber(1234.5, { decimals: 2 }), '1,234.50')
})

test('formatINR', () => {
  assert.equal(formatINR(123456), '₹1,23,456.00')
  assert.equal(formatINR(31478.08), '₹31,478.08')
  assert.equal(formatINR('2500'), '₹2,500.00')
  assert.equal(formatINR(-1500.5), '-₹1,500.50')
  assert.equal(formatINR(-0.004), '₹0.00')
  assert.equal(formatINR(NaN), '₹0.00')
  assert.equal(formatINR(undefined), '₹0.00')
  assert.equal(formatINR(1234, { symbol: false }), '1,234.00')
  assert.equal(formatINR(1234.56, { decimals: 0 }), '₹1,235')
})

test('numberToWords uses lakh and crore', () => {
  assert.equal(numberToWords(0), 'Zero')
  assert.equal(numberToWords(15), 'Fifteen')
  assert.equal(numberToWords(40), 'Forty')
  assert.equal(numberToWords(101), 'One Hundred One')
  assert.equal(numberToWords(1250000), 'Twelve Lakh Fifty Thousand')
  assert.equal(numberToWords(10000000), 'One Crore')
  assert.equal(numberToWords(1234567890), 'One Hundred Twenty Three Crore Forty Five Lakh Sixty Seven Thousand Eight Hundred Ninety')
  assert.throws(() => numberToWords(-1), RangeError)
  assert.throws(() => numberToWords(1.5), RangeError)
})

test('amountInWords', () => {
  assert.equal(amountInWords(1234.5), 'Indian Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only')
  assert.equal(amountInWords(0), 'Indian Rupees Zero Only')
  assert.equal(amountInWords(100000), 'Indian Rupees One Lakh Only')
  assert.equal(amountInWords(0.99), 'Indian Rupees Zero and Ninety Nine Paise Only')
  assert.equal(amountInWords(-250), 'Indian Rupees Minus Two Hundred Fifty Only')
  assert.equal(amountInWords(5, { prefix: 'Rupees', suffix: '' }), 'Rupees Five')
  assert.throws(() => amountInWords(Infinity), RangeError)
  assert.throws(() => amountInWords('abc'), RangeError)
})

test('financialYear from a calendar date string', () => {
  assert.deepEqual(financialYear('2025-11-02'), {
    label: '2025-26', short: '2526', startYear: 2025, endYear: 2026, start: '2025-04-01', end: '2026-03-31',
  })
  assert.equal(financialYear('2026-03-31').label, '2025-26')
  assert.equal(financialYear('2026-04-01').label, '2026-27')
  assert.equal(financialYear('2000-01-15').label, '1999-00')
})

test('financialYear reads a Date in India time by default', () => {
  // 31 Mar 2026 20:00 UTC = 1 Apr 2026 01:30 IST
  const t = new Date('2026-03-31T20:00:00Z')
  assert.equal(financialYear(t).label, '2026-27')
  assert.equal(financialYear(t, { timeZone: 'UTC' }).label, '2025-26')
  assert.equal(financialYear(t.getTime()).label, '2026-27')
  assert.throws(() => financialYear('not a date'), RangeError)
})

test('formatInvoiceNumber', () => {
  const fy = financialYear('2025-11-02')
  assert.equal(formatInvoiceNumber('INV/{yyyy-yy}/{n}', { seq: 7, fy }), 'INV/2025-26/007')
  assert.equal(formatInvoiceNumber('INV{fy}{n}', { seq: 42, fy }), 'INV2526042')
  assert.equal(formatInvoiceNumber('{yyyy}-{yy}-{n}', { seq: 1, fy, pad: 5 }), '2025-25-00001')
  assert.equal(formatInvoiceNumber('A{n}-B{n}', { seq: 3, fy }), 'A003-B003')
  assert.equal(formatInvoiceNumber('INV/{yyyy-yy}/{n}', { seq: 12345, date: '2026-04-01' }), 'INV/2026-27/12345')
  assert.throws(() => formatInvoiceNumber('INV{n}', { seq: -1, fy }), RangeError)
  assert.throws(() => formatInvoiceNumber('INV{n}', { fy }), RangeError)
})

test('checkInvoiceNumber (Rule 46(b))', () => {
  assert.equal(MAX_INVOICE_NUMBER_LENGTH, 16)
  assert.deepEqual(checkInvoiceNumber('INV/2025-26/9999'), { valid: true, length: 16, code: null, error: null })
  assert.equal(checkInvoiceNumber('INV/2025-26/10000').code, 'TOO_LONG')
  assert.equal(checkInvoiceNumber('INV 001').code, 'CHARACTERS')
  assert.equal(checkInvoiceNumber('INV#001').code, 'CHARACTERS')
  assert.equal(checkInvoiceNumber('INV_001').code, 'CHARACTERS')
  assert.equal(checkInvoiceNumber('').code, 'EMPTY')
  assert.equal(checkInvoiceNumber(null).code, 'EMPTY')
  assert.equal(checkInvoiceNumber(1001).valid, true)
})
