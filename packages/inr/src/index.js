// @merainvoices/inr — Indian rupee formatting, amount in words, the April–March
// financial year, and GST invoice numbers.
//
// Zero dependencies. Uses Intl (built into Node 18+, browsers and Hermes).

// ── Formatting ──────────────────────────────────────────────────────────────

const toNumber = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Format a number with Indian digit grouping: 1234567.5 → "12,34,567.5".
 * @param {number} value
 * @param {{ decimals?: number }} [opts] fixed decimals (default: as needed, max 2)
 */
export function formatIndianNumber(value, { decimals } = {}) {
  const options = decimals == null
    ? { maximumFractionDigits: 2 }
    : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
  return new Intl.NumberFormat('en-IN', options).format(toNumber(value))
}

/**
 * Format rupees: 123456 → "₹1,23,456.00". Non-numbers format as ₹0.00.
 * @param {number} value
 * @param {{ symbol?: boolean, decimals?: number }} [opts]
 */
export function formatINR(value, { symbol = true, decimals = 2 } = {}) {
  const n = toNumber(value)
  const body = formatIndianNumber(Math.abs(n), { decimals })
  // Treat -0.004 → "0.00", not "-₹0.00"
  const negative = n < 0 && Number(body.replace(/,/g, '')) !== 0
  return `${negative ? '-' : ''}${symbol ? '₹' : ''}${body}`
}

// ── Amount in words (Indian system: thousand, lakh, crore) ─────────────────

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function words(n) {
  if (n < 20) return ONES[n]
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + words(n % 100) : '')
  if (n < 100000) return words(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + words(n % 1000) : '')
  if (n < 10000000) return words(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + words(n % 100000) : '')
  return words(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + words(n % 10000000) : '')
}

/**
 * A whole number in words, Indian system: 1250000 → "Twelve Lakh Fifty Thousand".
 * @param {number} n a non-negative safe integer
 */
export function numberToWords(n) {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('numberToWords needs a non-negative whole number')
  return n === 0 ? 'Zero' : words(n)
}

/**
 * An amount in words as printed on Indian invoices:
 * 1234.5 → "Indian Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only".
 * Rounds to the nearest paisa.
 * @param {number} amount
 * @param {{ prefix?: string, suffix?: string }} [opts] defaults 'Indian Rupees' / 'Only'; pass '' to drop either
 */
export function amountInWords(amount, { prefix = 'Indian Rupees', suffix = 'Only' } = {}) {
  const value = Number(amount)
  if (!Number.isFinite(value)) throw new RangeError('amountInWords needs a finite number')
  const totalPaise = Math.round(Math.abs(value) * 100)
  if (!Number.isSafeInteger(totalPaise)) throw new RangeError('amountInWords: amount is too large')
  const rupees = Math.floor(totalPaise / 100)
  const paise = totalPaise % 100
  let text = numberToWords(rupees)
  if (paise > 0) text += ' and ' + numberToWords(paise) + ' Paise'
  if (value < 0 && totalPaise > 0) text = 'Minus ' + text
  return [prefix, text, suffix].filter(Boolean).join(' ')
}

// ── Financial year (1 April – 31 March) ────────────────────────────────────

function calendarParts(date, timeZone) {
  if (typeof date === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
    if (m) return { year: Number(m[1]), month: Number(m[2]) }
  }
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) throw new RangeError('financialYear: invalid date')
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(d)
  const get = (type) => Number(parts.find((p) => p.type === type).value)
  return { year: get('year'), month: get('month') }
}

/**
 * The Indian financial year a date falls in.
 *
 * A 'YYYY-MM-DD' string is read as that calendar date. A Date (or timestamp)
 * is read in `timeZone` — India by default — so 31 March 20:00 UTC, which is
 * already 1 April in India, lands in the new year.
 *
 * @param {Date|string|number} [date] defaults to now
 * @param {{ timeZone?: string }} [opts]
 * @returns {{ label: string, short: string, startYear: number, endYear: number, start: string, end: string }}
 *   e.g. { label: '2025-26', short: '2526', startYear: 2025, endYear: 2026, start: '2025-04-01', end: '2026-03-31' }
 */
export function financialYear(date = new Date(), { timeZone = 'Asia/Kolkata' } = {}) {
  const { year, month } = calendarParts(date, timeZone)
  const startYear = month >= 4 ? year : year - 1
  const endYear = startYear + 1
  return {
    label: `${startYear}-${String(endYear).slice(2)}`,
    short: `${String(startYear).slice(2)}${String(endYear).slice(2)}`,
    startYear,
    endYear,
    start: `${startYear}-04-01`,
    end: `${endYear}-03-31`,
  }
}

// ── Invoice numbers ────────────────────────────────────────────────────────

/** Rule 46(b), CGST Rules: at most 16 characters. */
export const MAX_INVOICE_NUMBER_LENGTH = 16

/**
 * Fill an invoice-number template.
 *
 *   {n}        sequence, zero-padded (default 3 digits)  → 007
 *   {fy}       financial year, short                     → 2526
 *   {yyyy-yy}  financial year, label                     → 2025-26
 *   {yyyy}     year the financial year starts            → 2025
 *   {yy}       last two digits of that year              → 25
 *
 * formatInvoiceNumber('INV/{yyyy-yy}/{n}', { seq: 7, date: '2025-11-02' }) → 'INV/2025-26/007'
 *
 * @param {string} template
 * @param {{ seq: number, date?: Date|string|number, fy?: ReturnType<typeof financialYear>, pad?: number, timeZone?: string }} opts
 */
export function formatInvoiceNumber(template, { seq, date, fy, pad = 3, timeZone } = {}) {
  if (!Number.isSafeInteger(seq) || seq < 0) throw new RangeError('formatInvoiceNumber needs seq as a non-negative whole number')
  const year = fy ?? financialYear(date ?? new Date(), timeZone ? { timeZone } : undefined)
  return String(template)
    .replaceAll('{n}', String(seq).padStart(pad, '0'))
    .replaceAll('{yyyy-yy}', year.label)
    .replaceAll('{fy}', year.short)
    .replaceAll('{yyyy}', String(year.startYear))
    .replaceAll('{yy}', String(year.startYear).slice(2))
}

const INVOICE_NUMBER_CHARS = /^[A-Za-z0-9/-]+$/

/**
 * Check an invoice number against Rule 46(b): 1–16 characters, only letters,
 * digits, hyphen (-) and slash (/). Uniqueness within the financial year is
 * the caller's to enforce.
 * @returns {{ valid: boolean, length: number, code: null|'EMPTY'|'TOO_LONG'|'CHARACTERS', error: string|null }}
 */
export function checkInvoiceNumber(number) {
  const s = number == null ? '' : String(number)
  const length = s.length
  const fail = (code, error) => ({ valid: false, length, code, error })
  if (!length) return fail('EMPTY', 'Enter an invoice number')
  if (length > MAX_INVOICE_NUMBER_LENGTH) return fail('TOO_LONG', `Invoice numbers can have at most ${MAX_INVOICE_NUMBER_LENGTH} characters (this has ${length})`)
  if (!INVOICE_NUMBER_CHARS.test(s)) return fail('CHARACTERS', 'Use only letters, numbers, hyphen (-) and slash (/)')
  return { valid: true, length, code: null, error: null }
}
