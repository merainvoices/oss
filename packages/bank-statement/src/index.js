// @merainvoices/bank-statement — read Indian bank statement exports and match
// them against your own records.
//
//   rows (from CSV text, or a spreadsheet library)
//     → findHeaderRow     banks put account details above the table
//     → guessColumns      "Narration" vs "Particulars", "Withdrawal Amt." vs "Debit"…
//     → readTransactions  day-first dates, ₹ and Indian commas, Cr/Dr
//     → matchTransactions one-to-one, by direction + amount + nearest date
//
// Zero dependencies. No file, network or DOM access.

// ── CSV ─────────────────────────────────────────────────────────────────────

/**
 * Parse CSV text into rows of strings (RFC 4180 quoting, CRLF or LF, a
 * leading byte-order mark removed). Fully blank rows are dropped. No header
 * row is assumed.
 * @param {string} text
 * @param {{ delimiter?: string }} [opts]
 * @returns {string[][]}
 */
export function parseCsv(text, { delimiter = ',' } = {}) {
  if (typeof text !== 'string' || !text) return []
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows = []
  let field = ''
  let row = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === delimiter) { row.push(field); field = '' }
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); field = ''; row = []
    } else field += ch
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
}

// ── Columns ─────────────────────────────────────────────────────────────────

// Lowercased, contains-matching. Earlier hints in a list win.
const COLUMN_HINTS = {
  date: ['txn date', 'transaction date', 'tran date', 'value date', 'posting date', 'date'],
  description: ['narration', 'particulars', 'description', 'transaction details', 'transaction remarks', 'details', 'remarks'],
  drcr: ['dr/cr', 'cr/dr', 'dr / cr', 'debit/credit', 'credit/debit', 'type'],
  debit: ['withdrawal amt', 'withdrawal amount', 'withdrawals', 'withdrawal', 'debit amount', 'debit amt', 'debit', 'paid out', 'dr amount'],
  credit: ['deposit amt', 'deposit amount', 'deposits', 'deposit', 'credit amount', 'credit amt', 'credit', 'paid in', 'cr amount'],
  amount: ['transaction amount', 'amount (inr)', 'amount(inr)', 'amount'],
  balance: ['closing balance', 'available balance', 'running balance', 'balance'],
  reference: ['chq./ref.no.', 'chq/ref no', 'ref no', 'reference', 'cheque no', 'chq no', 'utr'],
}

/**
 * Map a header row to column positions (-1 = not found).
 * @param {unknown[]} headerCells
 * @returns {Columns}
 * @typedef {{ date: number, description: number, debit: number, credit: number, amount: number, drcr: number, balance: number, reference: number }} Columns
 */
export function guessColumns(headerCells) {
  const cells = (headerCells ?? []).map((c) => String(c ?? '').toLowerCase().replace(/\s+/g, ' ').trim())
  const columns = { date: -1, description: -1, debit: -1, credit: -1, amount: -1, drcr: -1, balance: -1, reference: -1 }
  const taken = new Set()
  for (const [field, hints] of Object.entries(COLUMN_HINTS)) {
    found: for (const hint of hints) {
      for (let i = 0; i < cells.length; i++) {
        if (taken.has(i) || !cells[i]) continue
        if (cells[i] === hint || cells[i].includes(hint)) { columns[field] = i; taken.add(i); break found }
      }
    }
  }
  return columns
}

/** True when the columns are enough to read money movements: a date, plus debit and credit or a single amount. */
export function hasRequiredColumns(columns) {
  if (!columns || columns.date < 0) return false
  return (columns.debit >= 0 && columns.credit >= 0) || columns.amount >= 0
}

/** Index of the header row within the first 30 rows, or -1. */
export function findHeaderRow(rows) {
  const limit = Math.min(rows?.length ?? 0, 30)
  for (let i = 0; i < limit; i++) {
    const row = rows[i]
    if (!Array.isArray(row) || row.filter((c) => String(c ?? '').trim() !== '').length < 3) continue
    if (hasRequiredColumns(guessColumns(row))) return i
  }
  return -1
}

// ── Values ──────────────────────────────────────────────────────────────────

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const pad = (n) => String(n).padStart(2, '0')

function isoDate(y, m, d) {
  if (y < 100) y += 2000
  if (m < 1 || m > 12 || d < 1) return null
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return d > daysInMonth ? null : `${y}-${pad(m)}-${pad(d)}`
}

/**
 * A statement date as 'YYYY-MM-DD', or null. Indian statements are day-first
 * (05/08/2026 is 5 August). Also reads ISO dates, '05 Aug 2026', '5-Aug-26',
 * spreadsheet serial numbers (46239) and Date objects (local calendar date).
 * Two-digit years are 20xx.
 */
export function parseDate(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : isoDate(value.getFullYear(), value.getMonth() + 1, value.getDate())
  }
  if (typeof value === 'number') {
    // Spreadsheet serial: days since 1899-12-30.
    if (!Number.isFinite(value) || value < 1 || value > 100000) return null
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000)
    return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  }
  const s = String(value).trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return isoDate(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})(?!\d)/.exec(s)
  if (m) return isoDate(+m[3], +m[2], +m[1])
  m = /^(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-,]+(\d{2}|\d{4})(?!\d)/.exec(s)
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()]
    return month ? isoDate(+m[3], month, +m[1]) : null
  }
  return null
}

/**
 * A statement amount. Handles '1,23,456.78', '₹ 5,000', 'Rs. 5,000', 'INR 5000',
 * '(2,500)' and '-750' (negative), and a 'Cr' / 'Dr' suffix.
 * @returns {{ value: number, indicator: 'CR'|'DR'|null }} value keeps its sign; unreadable → 0
 */
export function parseAmount(value) {
  if (value == null || value === '') return { value: 0, indicator: null }
  if (typeof value === 'number') return { value: Number.isFinite(value) ? value : 0, indicator: null }
  let s = String(value).trim()
  let indicator = null
  const suffix = /(cr|dr)\.?$/i.exec(s)
  if (suffix) {
    indicator = suffix[1].toUpperCase()
    s = s.slice(0, suffix.index).trim()
  }
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }
  s = s.replace(/^(inr|rs\.?)/i, '').replace(/[₹,\s]/g, '')
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1) } else if (s.startsWith('+')) s = s.slice(1)
  if (!/^\d*\.?\d+$/.test(s)) return { value: 0, indicator: null }
  const n = Number(s)
  return { value: negative ? -n : n, indicator }
}

const toPaise = (n) => Math.round(Number((n * 100).toPrecision(15)))

// A balance marked Dr is overdrawn: negative.
function readBalance(value, index) {
  if (index < 0 || String(value ?? '').trim() === '') return null
  const { value: v, indicator } = parseAmount(value)
  return indicator === 'DR' ? -Math.abs(v) : v
}

// ── Transactions ────────────────────────────────────────────────────────────

/**
 * Read the rows under the header into transactions. Rows without a date or
 * without money moving (opening-balance lines, page footers, totals) are skipped.
 * @param {unknown[][]} rows
 * @param {number} headerRow
 * @param {Columns} columns
 * @returns {Transaction[]}
 * @typedef {{ row: number, date: string, description: string, reference: string, moneyIn: number, moneyOut: number, balance: number|null }} Transaction
 */
export function readTransactions(rows, headerRow, columns) {
  const out = []
  const cell = (row, i) => (i >= 0 ? row[i] : '')
  for (let r = headerRow + 1; r < (rows?.length ?? 0); r++) {
    const row = rows[r]
    if (!Array.isArray(row)) continue
    const date = parseDate(cell(row, columns.date))
    if (!date) continue

    let inP = 0
    let outP = 0
    if ((columns.debit >= 0 && columns.credit >= 0) || columns.amount < 0) {
      outP = Math.abs(toPaise(parseAmount(cell(row, columns.debit)).value))
      inP = Math.abs(toPaise(parseAmount(cell(row, columns.credit)).value))
    } else if (columns.amount >= 0) {
      const { value, indicator } = parseAmount(cell(row, columns.amount))
      const letters = columns.drcr >= 0 ? String(cell(row, columns.drcr) ?? '').toUpperCase().replace(/[^A-Z]/g, '') : ''
      const flag = indicator ?? (letters.startsWith('C') ? 'CR' : letters.startsWith('D') ? 'DR' : null)
      const p = toPaise(value)
      if (flag === 'CR') inP = Math.abs(p)
      else if (flag === 'DR') outP = Math.abs(p)
      else if (p >= 0) inP = p // no indicator: positive = money in
      else outP = -p
    }
    if (!inP && !outP) continue

    out.push({
      row: r,
      date,
      description: columns.description >= 0 ? String(cell(row, columns.description) ?? '').trim() : '',
      reference: columns.reference >= 0 ? String(cell(row, columns.reference) ?? '').trim() : '',
      moneyIn: inP / 100,
      moneyOut: outP / 100,
      balance: readBalance(cell(row, columns.balance), columns.balance),
    })
  }
  return out
}

/**
 * Header detection, column guessing and reading in one call.
 * @param {string|unknown[][]} input CSV text, or rows from a spreadsheet library
 * @param {{ delimiter?: string, columns?: Partial<Columns>, headerRow?: number }} [opts]
 * @returns {{ headerRow: number, columns: Columns, transactions: Transaction[] }}
 * @throws {Error} code 'NO_HEADER' when no date + amount header is found
 */
export function readStatement(input, { delimiter, columns: given, headerRow: givenHeader } = {}) {
  const rows = typeof input === 'string' ? parseCsv(input, { delimiter }) : (input ?? [])
  const headerRow = givenHeader ?? findHeaderRow(rows)
  if (headerRow < 0 || !rows[headerRow]) {
    const err = new Error('No statement table found. Look for a header row with a date column and debit/credit or amount columns.')
    err.code = 'NO_HEADER'
    throw err
  }
  const columns = { ...guessColumns(rows[headerRow]), ...(given ?? {}) }
  if (!hasRequiredColumns(columns)) {
    const err = new Error('The header row needs a date column, plus debit and credit columns or an amount column.')
    err.code = 'NO_HEADER'
    throw err
  }
  return { headerRow, columns, transactions: readTransactions(rows, headerRow, columns) }
}

// ── Running balance ─────────────────────────────────────────────────────────

/**
 * Check that each balance follows from the previous one. A mismatch usually
 * means a column was read wrongly or a row is missing. Statements listed
 * newest first are detected.
 * @param {Transaction[]} transactions
 * @returns {{ ok: boolean, order: 'oldest-first'|'newest-first'|null, mismatches: Array<{ row: number, expected: number, actual: number }> }}
 */
export function checkRunningBalance(transactions) {
  const t = (transactions ?? []).filter((x) => x.balance != null)
  if (t.length < 2) return { ok: true, order: null, mismatches: [] }
  const run = (list) => {
    const bad = []
    for (let i = 1; i < list.length; i++) {
      const expected = toPaise(list[i - 1].balance) + toPaise(list[i].moneyIn) - toPaise(list[i].moneyOut)
      if (expected !== toPaise(list[i].balance)) bad.push({ row: list[i].row, expected: expected / 100, actual: list[i].balance })
    }
    return bad
  }
  const forward = run(t)
  if (!forward.length) return { ok: true, order: 'oldest-first', mismatches: [] }
  const backward = run([...t].reverse())
  if (!backward.length) return { ok: true, order: 'newest-first', mismatches: [] }
  return backward.length < forward.length
    ? { ok: false, order: 'newest-first', mismatches: backward }
    : { ok: false, order: 'oldest-first', mismatches: forward }
}

// ── Matching ────────────────────────────────────────────────────────────────

const dayNumber = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86400000

/**
 * Match statement transactions to your entries, one to one.
 *
 * An entry is money in or out of this bank account, from your side:
 *   { id, direction: 'in' | 'out', amount, date: 'YYYY-MM-DD' }
 * A pair needs the same direction, the same amount to the paisa, and dates
 * at most `toleranceDays` apart. Closest dates are paired first across the
 * whole statement, so a same-day entry is never taken by a row two days away.
 *
 * @param {Transaction[]} transactions
 * @param {Array<{ id: unknown, direction: 'in'|'out', amount: number, date: string }>} entries
 * @param {{ toleranceDays?: number }} [opts]
 */
export function matchTransactions(transactions, entries, { toleranceDays = 3 } = {}) {
  const txs = transactions ?? []
  const ens = entries ?? []
  const byKey = new Map()
  ens.forEach((e, j) => {
    const dir = e.direction === 'in' || e.direction === 'out' ? e.direction : null
    if (!dir || !e.date) return
    const key = `${dir}|${Math.abs(toPaise(Number(e.amount) || 0))}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(j)
  })

  const candidates = []
  txs.forEach((t, i) => {
    const dir = t.moneyIn > 0 ? 'in' : 'out'
    const key = `${dir}|${toPaise(dir === 'in' ? t.moneyIn : t.moneyOut)}`
    for (const j of byKey.get(key) ?? []) {
      const gap = Math.abs(dayNumber(t.date) - dayNumber(ens[j].date))
      if (Number.isFinite(gap) && gap <= toleranceDays) candidates.push({ i, j, gap })
    }
  })
  candidates.sort((a, b) => a.gap - b.gap || a.i - b.i || a.j - b.j)

  const usedT = new Set()
  const usedE = new Set()
  const matches = []
  for (const c of candidates) {
    if (usedT.has(c.i) || usedE.has(c.j)) continue
    usedT.add(c.i)
    usedE.add(c.j)
    matches.push({ i: c.i, transaction: txs[c.i], entry: ens[c.j], dayGap: c.gap })
  }
  matches.sort((a, b) => a.i - b.i)

  return {
    matches: matches.map(({ i, ...m }) => m),
    unmatchedTransactions: txs.filter((_, i) => !usedT.has(i)),
    unmatchedEntries: ens.filter((_, j) => !usedE.has(j)),
  }
}
