// @merainvoices/gstr2b — read the GSTR-2B JSON from the GST portal and match it
// against your purchase register.
//
// Runs anywhere JavaScript runs (browser, Node, edge); no GSP or portal login.
//
// Parsing is defensive. The portal has used several shapes over the years
// (root vs `data`, `docdata` nesting, item-level vs invoice-level tax, dd-mm-yyyy
// vs dd/mm/yyyy). All known variants are read; anything skipped is reported in
// `warnings`; a file that is not a 2B fails with a readable error.
//
// Matching:
//   1. exact     supplier GSTIN + document number (uppercased, letters and digits only)
//   2. probable  supplier GSTIN + document number without leading zeros
//                ("INV-001" ↔ "INV/1") — for a person to confirm
// Exact matches split into `matched` and `valueMismatch` by comparing taxable
// value and tax within a tolerance (₹1 by default). Leftovers are `only2b`
// (on the portal, not in your books) and `onlyBooks` (in your books, not yet
// reported by the supplier — that ITC is at risk).
// Credit and debit notes (CDNR/CDNRA) are read and totalled, not matched.
//
// Zero dependencies.

// ── Document numbers ────────────────────────────────────────────────────────

/** " inv/001-a " → "INV001A" */
export function normalizeDocNumber(s) {
  return String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** "INV-001" and "INV/1" → "INV1": normalized, leading zeros dropped from each digit run. */
export function looseDocNumber(s) {
  return normalizeDocNumber(s).replace(/\d+/g, (run) => run.replace(/^0+(?=\d)/, ''))
}

// ── Small helpers ───────────────────────────────────────────────────────────

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n) => Math.round(n * 100) / 100

/** "05-07-2026", "5/7/2026" or "2026-07-05" → "2026-07-05"; anything else → null. */
export function parseGstnDate(s) {
  if (!s) return null
  const str = String(s).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(str)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Return period "072026" → { iso: '2026-07', label: 'Jul 2026' }; invalid → null. */
export function parseReturnPeriod(rtnprd) {
  const m = /^(\d{2})(\d{4})$/.exec(String(rtnprd ?? ''))
  if (!m) return null
  const mi = Number(m[1]) - 1
  if (mi < 0 || mi > 11) return null
  return { iso: `${m[2]}-${m[1]}`, label: `${MONTHS[mi]} ${m[2]}` }
}

// Tax from the document's items[], or from document-level fields.
function amountsOf(doc) {
  const items = Array.isArray(doc.items) ? doc.items : null
  if (items && items.length) {
    const sum = (k) => items.reduce((s, it) => s + num(it[k] ?? it[k.toUpperCase()]), 0)
    return { taxable: sum('txval'), igst: sum('igst'), cgst: sum('cgst'), sgst: sum('sgst'), cess: sum('cess') }
  }
  return { taxable: num(doc.txval), igst: num(doc.igst), cgst: num(doc.cgst), sgst: num(doc.sgst), cess: num(doc.cess) }
}

function toRow(section, supplier, doc, noteType, warnings) {
  const docNumber = doc.inum ?? doc.ntnum ?? doc.num ?? ''
  if (!docNumber) {
    warnings.push(`${section}: a document from ${supplier.ctin || 'an unknown supplier'} has no number and was skipped`)
    return null
  }
  const a = amountsOf(doc)
  return {
    section,
    noteType,
    supplierGstin: String(supplier.ctin ?? '').toUpperCase(),
    supplierName: supplier.trdnm ?? supplier.name ?? '',
    supplierFiledOn: parseGstnDate(supplier.supfildt),
    docNumber: String(docNumber),
    docDate: parseGstnDate(doc.dt ?? doc.ntdt ?? doc.idt),
    docValue: num(doc.val),
    ...a,
    totalTax: round2(a.igst + a.cgst + a.sgst),
    itcAvailable: String(doc.itcavl ?? 'Y').toUpperCase() !== 'N',
    reverseCharge: String(doc.rev ?? 'N').toUpperCase() === 'Y',
    reason: doc.rsn ?? '',
    imsStatus: doc.imsStatus != null ? String(doc.imsStatus).toUpperCase() : null,
    irn: doc.irn ?? null,
    eInvoice: String(doc.srctyp ?? '').toLowerCase().includes('e-invoice'),
  }
}

const docsOf = (supplier) => supplier?.inv ?? supplier?.nt ?? supplier?.note ?? supplier?.invoices ?? []

function parseError(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

// ── Parser ──────────────────────────────────────────────────────────────────

/**
 * Read a GSTR-2B JSON file.
 * @param {string|object} input file text, or the parsed object
 * @returns {Gstr2b}
 * @throws {Error} with `code` 'INVALID_JSON' | 'EMPTY' | 'NOT_GSTR2B'
 */
export function parseGstr2b(input) {
  let j = input
  if (typeof input === 'string') {
    try { j = JSON.parse(input) } catch {
      throw parseError('INVALID_JSON', 'This file is not valid JSON. On the GST portal, open GSTR-2B and use "Download JSON".')
    }
  }
  if (!j || typeof j !== 'object') throw parseError('EMPTY', 'The file is empty or unreadable.')

  const root = j.data && typeof j.data === 'object' ? j.data : j
  const docdata = root.docdata && typeof root.docdata === 'object' ? root.docdata : root

  const warnings = []
  const rows = []
  const notes = []

  for (const section of ['b2b', 'b2ba']) {
    const suppliers = docdata[section]
    if (!Array.isArray(suppliers)) continue
    for (const supplier of suppliers) {
      for (const doc of docsOf(supplier)) {
        const row = toRow(section.toUpperCase(), supplier, doc, null, warnings)
        if (row) rows.push(row)
      }
    }
  }

  for (const section of ['cdnr', 'cdnra']) {
    const suppliers = docdata[section]
    if (!Array.isArray(suppliers)) continue
    for (const supplier of suppliers) {
      for (const doc of docsOf(supplier)) {
        const noteType = String(doc.typ ?? doc.ntty ?? 'C').toUpperCase().startsWith('D') ? 'D' : 'C'
        const row = toRow(section.toUpperCase(), supplier, doc, noteType, warnings)
        if (row) notes.push(row)
      }
    }
  }

  for (const [key, label] of [['impg', 'import (bill of entry)'], ['impgsez', 'SEZ import'], ['isd', 'ISD credit']]) {
    const arr = docdata[key]
    if (!Array.isArray(arr) || !arr.length) continue
    const count = arr.reduce((s, sup) => s + (docsOf(sup).length || (Array.isArray(sup?.boe) ? sup.boe.length : 0) || 1), 0)
    warnings.push(`${count} ${label} ${count === 1 ? 'entry is' : 'entries are'} in this file but not part of purchase matching.`)
  }

  if (!rows.length && !notes.length) {
    throw parseError('NOT_GSTR2B', 'No B2B invoices or credit notes found. Check that this is a GSTR-2B JSON from the GST portal (not GSTR-2A or a summary).')
  }

  return {
    gstin: String(root.gstin ?? '').toUpperCase(),
    period: parseReturnPeriod(root.rtnprd),
    rows,
    notes,
    warnings,
  }
}

// ── Reconciliation ──────────────────────────────────────────────────────────

function bookRow(p) {
  const igst = num(p.igst), cgst = num(p.cgst), sgst = num(p.sgst)
  return {
    ...p,
    supplierGstin: String(p.supplierGstin ?? '').trim().toUpperCase(),
    docNumber: String(p.docNumber ?? ''),
    taxable: num(p.taxable),
    igst, cgst, sgst,
    totalTax: round2(igst + cgst + sgst),
    itcEligible: p.itcEligible !== false,
    reverseCharge: p.reverseCharge === true,
  }
}

const close = (a, b, tol) => Math.abs(num(a) - num(b)) <= tol + 1e-9

/**
 * Match a parsed GSTR-2B against your purchase register.
 *
 * @param {Gstr2b} parsed  from parseGstr2b
 * @param {PurchaseRecord[]} purchases  bills for the same return period
 * @param {{ tolerance?: number }} [opts]  rupees allowed between amounts (default 1)
 * @returns {Reconciliation}
 */
export function reconcile(parsed, purchases, { tolerance = 1 } = {}) {
  const all = (purchases ?? []).map(bookRow)
  const books = all.filter((b) => b.supplierGstin && normalizeDocNumber(b.docNumber))
  const skippedNoGstin = all.length - books.length

  // Index by key; a bill is used once.
  const exact = new Map()
  const loose = new Map()
  const push = (map, key, b) => (map.get(key) ?? map.set(key, []).get(key)).push(b)
  for (const b of books) {
    push(exact, `${b.supplierGstin}|${normalizeDocNumber(b.docNumber)}`, b)
    push(loose, `${b.supplierGstin}|${looseDocNumber(b.docNumber)}`, b)
  }
  const used = new Set()
  const take = (map, key) => {
    const list = map.get(key)
    while (list?.length) {
      const b = list.shift()
      if (!used.has(b)) { used.add(b); return b }
    }
    return null
  }
  const pair = (row2b, book) => ({
    row2b,
    book,
    amountsMatch: close(row2b.taxable, book.taxable, tolerance) && close(row2b.totalTax, book.totalTax, tolerance),
    taxableDiff: round2(row2b.taxable - book.taxable),
    taxDiff: round2(row2b.totalTax - book.totalTax),
  })

  const matched = []
  const valueMismatch = []
  const probable = []
  const only2b = []
  const pending = []

  for (const r of parsed.rows) {
    const b = take(exact, `${r.supplierGstin}|${normalizeDocNumber(r.docNumber)}`)
    if (!b) { pending.push(r); continue }
    const p = pair(r, b)
    ;(p.amountsMatch ? matched : valueMismatch).push(p)
  }
  for (const r of pending) {
    const b = take(loose, `${r.supplierGstin}|${looseDocNumber(r.docNumber)}`)
    if (b) probable.push(pair(r, b))
    else only2b.push(r)
  }
  const onlyBooks = books.filter((b) => !used.has(b))

  const sum = (arr, f) => round2(arr.reduce((s, x) => s + f(x), 0))
  const claimable = (r) => r.itcAvailable && !r.reverseCharge
  const summary = {
    counts: {
      in2b: parsed.rows.length,
      inBooks: books.length,
      matched: matched.length,
      valueMismatch: valueMismatch.length,
      probable: probable.length,
      only2b: only2b.length,
      onlyBooks: onlyBooks.length,
      notes: parsed.notes.length,
      skippedNoGstin,
      // 'N' = no accept/reject on the Invoice Management System; these are
      // deemed accepted when GSTR-3B is filed.
      imsNoAction: [...parsed.rows, ...parsed.notes].filter((r) => r.imsStatus === 'N').length,
    },
    // Tax (IGST + CGST + SGST; cess not included). Reverse-charge rows are left
    // out of the ITC figures because that credit is claimed differently.
    itc2bAvailable: round2(
      sum(parsed.rows.filter(claimable), (r) => r.totalTax)
      - sum(parsed.notes.filter((n) => n.noteType === 'C' && n.itcAvailable), (n) => n.totalTax)
      + sum(parsed.notes.filter((n) => n.noteType === 'D' && claimable(n)), (n) => n.totalTax),
    ),
    itcBooksEligible: sum(books.filter((b) => b.itcEligible && !b.reverseCharge), (b) => b.totalTax),
    matchedTax: sum(matched, (m) => m.row2b.totalTax),
    atRiskTax: sum(onlyBooks.filter((b) => b.itcEligible && !b.reverseCharge), (b) => b.totalTax),
    missingFromBooksTax: sum(only2b.filter(claimable), (r) => r.totalTax),
    mismatchTax: sum(valueMismatch, (m) => Math.abs(m.taxDiff)),
  }

  const order = (a, b) => a.supplierGstin.localeCompare(b.supplierGstin) || String(a.docDate ?? '').localeCompare(String(b.docDate ?? ''))
  for (const list of [matched, valueMismatch, probable]) list.sort((x, y) => order(x.row2b, y.row2b))
  only2b.sort(order)
  onlyBooks.sort(order)

  return { matched, valueMismatch, probable, only2b, onlyBooks, notes: parsed.notes, summary }
}
