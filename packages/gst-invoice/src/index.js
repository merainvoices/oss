// @merainvoices/gst-invoice — the money on an Indian GST invoice.
//
// Lines (quantity × rate, less a discount, plus GST), freight with its own
// GST, a discount on the whole invoice (before or after GST), and round-off.
//
// All arithmetic is in whole paise, so:
//   • the lines always add up to the invoice totals, to the paisa
//   • CGST + SGST always equals the GST on the line (CGST takes the odd paisa)
//   • a discount before GST is shared out so the lines still add up exactly
//
// Zero dependencies.

// ── Paise helpers ───────────────────────────────────────────────────────────

// Round half up after removing binary float noise (1.5 × 33.33 × 100 is
// 4999.499999… in floating point; it should be 5000).
const roundHalfUp = (x) => Math.round(Number(x.toPrecision(15)))
const rupees = (p) => (p === 0 ? 0 : p / 100) // never -0

function amount(value, field, { allowNegative = false } = {}) {
  if (value == null || value === '') return 0
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(n)) throw new RangeError(`${field} must be a number (got ${JSON.stringify(value)})`)
  if (n < 0 && !allowNegative) throw new RangeError(`${field} cannot be negative (got ${n})`)
  return n
}

function percent(value, field) {
  const n = amount(value, field)
  if (n > 100) throw new RangeError(`${field} cannot be more than 100 (got ${n})`)
  return n
}

const toPaise = (n) => roundHalfUp(n * 100)

// Tax on a paise amount at a percentage rate, rounded half up.
const taxOn = (paise, rate) => roundHalfUp((paise * rate) / 100)

// Split a tax amount into heads. CGST takes the odd paisa so CGST + SGST is exact.
function splitTax(taxP, interState) {
  if (interState) return { cgstP: 0, sgstP: 0, igstP: taxP }
  const cgstP = Math.round(taxP / 2)
  return { cgstP, sgstP: taxP - cgstP, igstP: 0 }
}

// Share `totalP` across `weights` in proportion, exactly (largest remainder).
function allocate(totalP, weights) {
  const sum = weights.reduce((s, w) => s + w, 0)
  if (!totalP || !sum) return weights.map(() => 0)
  const raw = weights.map((w) => (totalP * w) / sum)
  const shares = raw.map(Math.floor)
  let left = totalP - shares.reduce((s, v) => s + v, 0)
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) shares[order[k].i]++
  return shares
}

// ── One line ────────────────────────────────────────────────────────────────

function lineInPaise(item, index, { interState, noTax }) {
  const at = `items[${index}]`
  const qty = amount(item.qty, `${at}.qty`)
  const rate = amount(item.rate, `${at}.rate`)
  const discountAmount = amount(item.discountAmount, `${at}.discountAmount`)
  const discountPercent = percent(item.discountPercent, `${at}.discountPercent`)
  const gstRate = noTax ? 0 : percent(item.gstRate, `${at}.gstRate`)

  const grossP = roundHalfUp(qty * rate * 100)
  // A rupee discount wins over a percentage; neither can exceed the line.
  const discountP = discountAmount > 0
    ? Math.min(toPaise(discountAmount), grossP)
    : roundHalfUp((grossP * discountPercent) / 100)
  return { qty, rate, gstRate, grossP, discountP, taxableP: grossP - discountP }
}

function finishLine(l, documentDiscountP, interState) {
  const taxableP = l.taxableP - documentDiscountP
  const taxP = taxOn(taxableP, l.gstRate)
  const { cgstP, sgstP, igstP } = splitTax(taxP, interState)
  return {
    qty: l.qty,
    rate: l.rate,
    gross: rupees(l.grossP),
    discount: rupees(l.discountP),
    documentDiscount: rupees(documentDiscountP),
    taxable: rupees(taxableP),
    gstRate: l.gstRate,
    cgstRate: interState ? 0 : l.gstRate / 2,
    cgst: rupees(cgstP),
    sgstRate: interState ? 0 : l.gstRate / 2,
    sgst: rupees(sgstP),
    igstRate: interState ? l.gstRate : 0,
    igst: rupees(igstP),
    tax: rupees(taxP),
    total: rupees(taxableP + taxP),
    _p: { grossP: l.grossP, discountP: l.discountP, documentDiscountP, taxableP, cgstP, sgstP, igstP, taxP },
  }
}

/**
 * Amounts for one invoice line.
 *
 * @param {{ qty: number, rate: number, discountPercent?: number, discountAmount?: number, gstRate?: number }} item
 * @param {{ interState?: boolean, noTax?: boolean }} [opts]
 */
export function computeLine(item, { interState = false, noTax = false } = {}) {
  const l = lineInPaise(item ?? {}, 0, { interState, noTax })
  const { _p, ...line } = finishLine(l, 0, interState && !noTax)
  return line
}

// ── The invoice ─────────────────────────────────────────────────────────────

/**
 * Compute a whole GST invoice.
 *
 * @param {object} input
 * @param {Array<{ qty: number, rate: number, discountPercent?: number, discountAmount?: number, gstRate?: number }>} input.items
 * @param {boolean} [input.interState]  IGST instead of CGST + SGST
 * @param {boolean} [input.noTax]       no GST on this document (bill of supply, export under LUT…)
 * @param {{ amount?: number, gstRate?: number }} [input.freight]
 * @param {{ type?: 'percent'|'amount', value?: number, beforeGst?: boolean }} [input.discount]  on the whole invoice
 * @param {boolean|number} [input.roundOff]  true = to the nearest rupee; a number = that adjustment in rupees
 */
export function computeInvoice({
  items = [],
  interState = false,
  noTax = false,
  freight = {},
  discount = {},
  roundOff = false,
} = {}) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array')
  const igst = interState && !noTax
  const raw = items.map((item, i) => lineInPaise(item ?? {}, i, { interState: igst, noTax }))

  // Discount on the whole invoice
  const type = discount?.type === 'amount' ? 'amount' : 'percent'
  if (discount?.type != null && !['amount', 'percent'].includes(discount.type)) {
    throw new RangeError(`discount.type must be 'percent' or 'amount' (got ${JSON.stringify(discount.type)})`)
  }
  const value = type === 'percent' ? percent(discount?.value, 'discount.value') : amount(discount?.value, 'discount.value')
  const beforeGst = Boolean(discount?.beforeGst)

  // Before GST: comes off the lines' taxable value, shared in proportion.
  const itemsTaxableP = raw.reduce((s, l) => s + l.taxableP, 0)
  let beforeP = 0
  if (beforeGst && value > 0 && itemsTaxableP > 0) {
    beforeP = type === 'percent'
      ? roundHalfUp((itemsTaxableP * value) / 100)
      : Math.min(toPaise(value), itemsTaxableP)
  }
  const shares = allocate(beforeP, raw.map((l) => l.taxableP))
  const lines = raw.map((l, i) => finishLine(l, shares[i], igst))

  const sum = (k) => lines.reduce((s, l) => s + l._p[k], 0)
  const itemsP = {
    grossP: sum('grossP'), discountP: sum('discountP'), documentDiscountP: sum('documentDiscountP'),
    taxableP: sum('taxableP'), cgstP: sum('cgstP'), sgstP: sum('sgstP'), igstP: sum('igstP'), taxP: sum('taxP'),
  }
  itemsP.totalP = itemsP.taxableP + itemsP.taxP

  // Freight: its own GST, untouched by the invoice discount.
  const freightAmount = amount(freight?.amount, 'freight.amount')
  const freightRate = noTax ? 0 : percent(freight?.gstRate, 'freight.gstRate')
  const freightP = toPaise(freightAmount)
  const freightTaxP = taxOn(freightP, freightRate)
  const freightSplit = splitTax(freightTaxP, igst)

  // After GST: comes off the total; taxable value and GST are unchanged.
  const beforeAfterP = itemsP.totalP + freightP + freightTaxP
  let afterP = 0
  if (!beforeGst && value > 0 && beforeAfterP > 0) {
    afterP = type === 'percent'
      ? roundHalfUp((beforeAfterP * value) / 100)
      : Math.min(toPaise(value), beforeAfterP)
  }

  const preRoundP = beforeAfterP - afterP
  let roundOffP = 0
  if (roundOff === true) roundOffP = Math.round(preRoundP / 100) * 100 - preRoundP
  else if (typeof roundOff === 'number' || (typeof roundOff === 'string' && roundOff !== '')) {
    roundOffP = toPaise(amount(roundOff, 'roundOff', { allowNegative: true }))
  } else if (roundOff !== false && roundOff != null && roundOff !== '') {
    throw new TypeError('roundOff must be true, false or a number')
  }

  const cgstP = itemsP.cgstP + freightSplit.cgstP
  const sgstP = itemsP.sgstP + freightSplit.sgstP
  const igstP = itemsP.igstP + freightSplit.igstP

  return {
    lines: lines.map(({ _p, ...line }) => line),
    items: {
      gross: rupees(itemsP.grossP),
      discount: rupees(itemsP.discountP),
      documentDiscount: rupees(itemsP.documentDiscountP),
      taxable: rupees(itemsP.taxableP),
      cgst: rupees(itemsP.cgstP),
      sgst: rupees(itemsP.sgstP),
      igst: rupees(itemsP.igstP),
      tax: rupees(itemsP.taxP),
      total: rupees(itemsP.totalP),
    },
    freight: {
      amount: rupees(freightP),
      gstRate: freightRate,
      cgst: rupees(freightSplit.cgstP),
      sgst: rupees(freightSplit.sgstP),
      igst: rupees(freightSplit.igstP),
      tax: rupees(freightTaxP),
      total: rupees(freightP + freightTaxP),
    },
    discount: {
      type: beforeP || afterP ? type : null,
      value: beforeP || afterP ? value : 0,
      beforeGst: beforeP || afterP ? beforeGst : false,
      amount: rupees(beforeP + afterP),
    },
    taxable: rupees(itemsP.taxableP + freightP),
    cgst: rupees(cgstP),
    sgst: rupees(sgstP),
    igst: rupees(igstP),
    tax: rupees(cgstP + sgstP + igstP),
    roundOff: rupees(roundOffP),
    total: rupees(preRoundP + roundOffP),
  }
}
