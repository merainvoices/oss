import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { computeLine, computeInvoice } from '../src/index.js'

describe('computeLine', () => {
  test('intra-state: GST split into CGST + SGST', () => {
    const l = computeLine({ qty: 1, rate: 1000, gstRate: 18 })
    assert.equal(l.taxable, 1000)
    assert.equal(l.cgstRate, 9)
    assert.equal(l.cgst, 90)
    assert.equal(l.sgst, 90)
    assert.equal(l.igst, 0)
    assert.equal(l.total, 1180)
  })

  test('inter-state: IGST only', () => {
    const l = computeLine({ qty: 1, rate: 1000, gstRate: 18 }, { interState: true })
    assert.equal(l.igstRate, 18)
    assert.equal(l.igst, 180)
    assert.equal(l.cgst + l.sgst, 0)
    assert.equal(l.total, 1180)
  })

  test('discount comes off before GST', () => {
    const l = computeLine({ qty: 1, rate: 1000, discountPercent: 10, gstRate: 18 })
    assert.equal(l.discount, 100)
    assert.equal(l.taxable, 900)
    assert.equal(l.cgst, 81)
    assert.equal(l.total, 1062)
  })

  test('a rupee discount wins over a percentage and is capped at the line', () => {
    assert.equal(computeLine({ qty: 1, rate: 1000, discountPercent: 50, discountAmount: 100, gstRate: 18 }).taxable, 900)
    assert.equal(computeLine({ qty: 1, rate: 1000, discountAmount: 5000, gstRate: 18 }).taxable, 0)
  })

  test('qty × rate, zero rate', () => {
    assert.equal(computeLine({ qty: 2, rate: 500, gstRate: 5 }).total, 1050)
    const zero = computeLine({ qty: 1, rate: 1000, gstRate: 0 })
    assert.equal(zero.total, 1000)
    assert.equal(zero.tax, 0)
  })

  test('CGST + SGST equals the GST exactly; CGST takes the odd paisa', () => {
    const l = computeLine({ qty: 5, rate: 499, gstRate: 5 }) // 2495 @ 5% = 124.75
    assert.equal(l.tax, 124.75)
    assert.equal(l.cgst, 62.38)
    assert.equal(l.sgst, 62.37)
    assert.equal(l.total, 2619.75)
  })

  test('floating-point traps round correctly', () => {
    const a = computeLine({ qty: 1.5, rate: 33.33, gstRate: 18 }) // 49.995 → 50.00
    assert.equal(a.taxable, 50)
    assert.equal(a.tax, 9)
    assert.equal(a.total, 59)
    const b = computeLine({ qty: 1, rate: 333.33, discountPercent: 10, gstRate: 18 }) // 299.997 → 300.00
    assert.equal(b.taxable, 300)
    assert.equal(b.total, 354)
    assert.equal(computeLine({ qty: 1, rate: 1.005, gstRate: 0 }).total, 1.01)
  })

  test('noTax ignores the GST rate', () => {
    const l = computeLine({ qty: 1, rate: 1000, gstRate: 18 }, { noTax: true, interState: true })
    assert.equal(l.tax, 0)
    assert.equal(l.gstRate, 0)
    assert.equal(l.igstRate, 0)
    assert.equal(l.total, 1000)
  })

  test('numeric strings and blanks are accepted', () => {
    assert.equal(computeLine({ qty: '2', rate: '250.50', gstRate: '18', discountPercent: '' }).taxable, 501)
  })
})

// Two lines, intra-state: 1000 @ 18% + 2 × 250 @ 5% → taxable 1500, GST 205, total 1705
const TWO = [
  { qty: 1, rate: 1000, gstRate: 18 },
  { qty: 2, rate: 250, gstRate: 5 },
]

describe('computeInvoice', () => {
  test('plain totals', () => {
    const r = computeInvoice({ items: TWO })
    assert.equal(r.items.gross, 1500)
    assert.equal(r.taxable, 1500)
    assert.equal(r.cgst, 102.5)
    assert.equal(r.sgst, 102.5)
    assert.equal(r.tax, 205)
    assert.equal(r.total, 1705)
    assert.deepEqual(r.discount, { type: null, value: 0, beforeGst: false, amount: 0 })
    assert.equal(r.roundOff, 0)
  })

  test('discount after GST: off the total; taxable value and GST unchanged', () => {
    const r = computeInvoice({ items: TWO, discount: { type: 'amount', value: 105 } })
    assert.equal(r.discount.amount, 105)
    assert.equal(r.taxable, 1500)
    assert.equal(r.cgst, 102.5)
    assert.equal(r.total, 1600)
    assert.equal(computeInvoice({ items: TWO, discount: { type: 'percent', value: 10 } }).discount.amount, 170.5)
  })

  test('discount before GST: off the taxable value; GST recalculated on each line', () => {
    const r = computeInvoice({ items: TWO, discount: { type: 'percent', value: 10, beforeGst: true } })
    assert.equal(r.discount.amount, 150)
    assert.equal(r.discount.beforeGst, true)
    assert.equal(r.taxable, 1350)
    assert.equal(r.tax, 184.5)
    assert.equal(r.total, 1534.5)
    assert.deepEqual(r.lines.map((l) => [l.documentDiscount, l.taxable, l.tax]), [[100, 900, 162], [50, 450, 22.5]])
  })

  test('a before-GST discount is shared out to the paisa', () => {
    const r = computeInvoice({
      items: [{ qty: 1, rate: 100 }, { qty: 1, rate: 100 }, { qty: 1, rate: 100 }],
      discount: { type: 'amount', value: 100, beforeGst: true },
    })
    assert.deepEqual(r.lines.map((l) => l.documentDiscount), [33.34, 33.33, 33.33])
    assert.equal(r.items.documentDiscount, 100)
    assert.equal(r.taxable, 200)
  })

  test('discounts never exceed the amount and never go negative', () => {
    assert.equal(computeInvoice({ items: TWO, discount: { type: 'amount', value: 99999 } }).total, 0)
    const before = computeInvoice({ items: TWO, discount: { type: 'amount', value: 99999, beforeGst: true } })
    assert.equal(before.taxable, 0)
    assert.equal(before.tax, 0)
    assert.throws(() => computeInvoice({ items: TWO, discount: { type: 'amount', value: -50 } }), RangeError)
  })

  test('freight carries its own GST and is not discounted', () => {
    const r = computeInvoice({
      items: TWO,
      freight: { amount: 500, gstRate: 18 },
      discount: { type: 'percent', value: 10, beforeGst: true },
    })
    assert.deepEqual(r.freight, { amount: 500, gstRate: 18, cgst: 45, sgst: 45, igst: 0, tax: 90, total: 590 })
    assert.equal(r.taxable, 1850)       // 1350 + 500
    assert.equal(r.tax, 274.5)          // 184.5 + 90
    assert.equal(r.cgst, r.items.cgst + 45)
    assert.equal(r.total, 2124.5)
    const inter = computeInvoice({ items: TWO, interState: true, freight: { amount: 500, gstRate: 18 } })
    assert.equal(inter.freight.igst, 90)
    assert.equal(inter.igst, 295)
  })

  test('noTax: no GST anywhere, including freight', () => {
    const r = computeInvoice({ items: TWO, noTax: true, freight: { amount: 100, gstRate: 18 } })
    assert.equal(r.tax, 0)
    assert.equal(r.freight.tax, 0)
    assert.equal(r.total, 1600)
  })

  test('round-off to the nearest rupee, or a given amount', () => {
    const half = computeInvoice({ items: TWO, discount: { type: 'percent', value: 10, beforeGst: true }, roundOff: true })
    assert.equal(half.roundOff, 0.5)  // 1534.50 → 1535
    assert.equal(half.total, 1535)
    const down = computeInvoice({ items: [{ qty: 1, rate: 100.49 }], roundOff: true })
    assert.equal(down.roundOff, -0.49)
    assert.equal(down.total, 100)
    const given = computeInvoice({ items: TWO, roundOff: -0.5 })
    assert.equal(given.roundOff, -0.5)
    assert.equal(given.total, 1704.5)
    assert.equal(computeInvoice({ items: TWO, roundOff: true }).roundOff, 0)
    assert.ok(!Object.is(computeInvoice({ items: TWO, roundOff: -0.001 }).roundOff, -0))
  })

  test('empty invoice', () => {
    const r = computeInvoice()
    assert.equal(r.total, 0)
    assert.deepEqual(r.lines, [])
  })

  test('bad input fails with the field named', () => {
    assert.throws(() => computeInvoice({ items: [{ qty: -1, rate: 10 }] }), /items\[0\]\.qty cannot be negative/)
    assert.throws(() => computeInvoice({ items: [{ qty: 1, rate: 'abc' }] }), /items\[0\]\.rate must be a number/)
    assert.throws(() => computeInvoice({ items: [{ qty: 1, rate: 10, discountPercent: 120 }] }), /cannot be more than 100/)
    assert.throws(() => computeInvoice({ items: [{ qty: 1, rate: 10, gstRate: 150 }] }), RangeError)
    assert.throws(() => computeInvoice({ items: TWO, discount: { type: 'flat', value: 5 } }), /discount\.type/)
    assert.throws(() => computeInvoice({ items: 'x' }), TypeError)
    assert.throws(() => computeInvoice({ items: TWO, roundOff: {} }), TypeError)
  })
})

describe('invariants on 500 random invoices', () => {
  // Small deterministic PRNG so failures are reproducible.
  let seed = 20261124
  const rand = () => { // mulberry32
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pick = (arr) => arr[Math.floor(rand() * arr.length)]
  const money = (max) => Math.round(rand() * max * 100) / 100
  const isPaise = (v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6
  const P = (v) => Math.round(v * 100)

  for (let n = 0; n < 500; n++) {
    const items = Array.from({ length: 1 + Math.floor(rand() * 8) }, () => ({
      qty: pick([1, 2, 3, 0.5, 1.25, 7, 12.5, 100]),
      rate: money(5000),
      gstRate: pick([0, 0.25, 3, 5, 12, 18, 28, 40]),
      ...(rand() < 0.3 ? { discountPercent: pick([2.5, 5, 10, 33.33]) } : {}),
      ...(rand() < 0.15 ? { discountAmount: money(200) } : {}),
    }))
    const input = {
      items,
      interState: rand() < 0.4,
      freight: rand() < 0.3 ? { amount: money(800), gstRate: pick([0, 5, 12, 18]) } : {},
      discount: rand() < 0.5 ? { type: pick(['percent', 'amount']), value: rand() < 0.5 ? pick([5, 7.5, 10, 12.5]) : money(500), beforeGst: rand() < 0.5 } : {},
      roundOff: rand() < 0.5,
    }
    if (input.discount.type === 'percent' && input.discount.value > 100) input.discount.value = 10

    test(`invoice #${n}`, () => {
      const r = computeInvoice(input)
      for (const k of ['gross', 'discount', 'documentDiscount', 'taxable', 'cgst', 'sgst', 'igst', 'tax', 'total']) {
        assert.equal(r.lines.reduce((s, l) => s + P(l[k]), 0), P(r.items[k]), `Σ lines.${k}`)
      }
      for (const l of r.lines) {
        assert.equal(P(l.cgst) + P(l.sgst) + P(l.igst), P(l.tax), 'line heads')
        assert.equal(P(l.taxable) + P(l.tax), P(l.total), 'line total')
        assert.ok(P(l.cgst) - P(l.sgst) === 0 || P(l.cgst) - P(l.sgst) === 1, 'CGST ≥ SGST by at most a paisa')
      }
      assert.equal(P(r.cgst) + P(r.sgst) + P(r.igst), P(r.tax), 'header heads')
      const after = r.discount.beforeGst ? 0 : P(r.discount.amount)
      assert.equal(P(r.taxable) + P(r.tax) - after + P(r.roundOff), P(r.total), 'header total')
      if (input.roundOff) assert.equal(P(r.total) % 100, 0, 'rounded to the rupee')
      assert.ok(r.total >= 0)
      for (const v of [r.total, r.tax, r.taxable, r.roundOff, ...r.lines.flatMap((l) => [l.taxable, l.tax, l.total])]) assert.ok(isPaise(v), `${v} has at most 2 decimals`)
    })
  }
})
