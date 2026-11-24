import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeDocNumber, looseDocNumber, parseGstnDate, parseReturnPeriod,
  parseGstr2b, reconcile,
} from '../src/index.js'

// Portal shape: data → docdata → b2b/cdnr, item-level and invoice-level tax,
// dd-mm-yyyy and dd/mm/yyyy dates. GSTINs are made up.
const PORTAL_2B = {
  data: {
    gstin: '36aabcm1234f1zy',
    rtnprd: '072026',
    docdata: {
      b2b: [
        {
          ctin: '27AAAPL1234C1ZV',
          trdnm: 'Lakshmi Components',
          supfildt: '11-08-2026',
          inv: [
            {
              inum: 'INV-001', dt: '05-07-2026', val: 11800, itcavl: 'Y', rev: 'N',
              imsStatus: 'N', irn: 'abc123', srctyp: 'E-Invoice',
              items: [{ num: 1, rt: 18, txval: 10000, igst: 1800, cgst: 0, sgst: 0, cess: 0 }],
            },
            { inum: 'LC/042', dt: '12/07/2026', val: 5900, itcavl: 'Y', rev: 'N', txval: 5000, igst: 0, cgst: 450, sgst: 450, cess: 0 },
          ],
        },
        {
          ctin: '29BBBPL5678D1ZX',
          trdnm: 'Karnataka Metals',
          inv: [
            { inum: 'KM-77', dt: '20-07-2026', val: 2360, itcavl: 'N', rsn: 'P', rev: 'N', txval: 2000, igst: 360 },
            { inum: 'KM-78', dt: '21-07-2026', val: 1180, itcavl: 'Y', rev: 'Y', txval: 1000, igst: 180 },
          ],
        },
      ],
      cdnr: [
        {
          ctin: '27AAAPL1234C1ZV', trdnm: 'Lakshmi Components',
          nt: [
            { ntnum: 'CN-9', typ: 'C', dt: '25-07-2026', val: 590, itcavl: 'Y', txval: 500, cgst: 45, sgst: 45 },
            { ntnum: 'DN-2', typ: 'D', dt: '26-07-2026', val: 118, itcavl: 'Y', txval: 100, igst: 18 },
          ],
        },
      ],
      impg: [{ boe: [{ num: 'BOE1' }, { num: 'BOE2' }] }],
    },
  },
}

const bill = (over = {}) => ({
  id: over.id ?? 'p1',
  supplierGstin: '27AAAPL1234C1ZV',
  docNumber: 'INV-001',
  docDate: '2026-07-05',
  taxable: 10000,
  igst: 1800, cgst: 0, sgst: 0,
  ...over,
})

describe('document numbers', () => {
  test('normalize: uppercase, letters and digits only', () => {
    assert.equal(normalizeDocNumber(' inv/001-a '), 'INV001A')
    assert.equal(normalizeDocNumber(null), '')
  })
  test('loose: leading zeros dropped from each digit run', () => {
    assert.equal(looseDocNumber('INV-001'), 'INV1')
    assert.equal(looseDocNumber('inv/1'), 'INV1')
    assert.equal(looseDocNumber('A010B007'), 'A10B7')
    assert.equal(looseDocNumber('INV-000'), 'INV0')
    assert.notEqual(looseDocNumber('INV-10'), looseDocNumber('INV-1'))
    // Long digit runs keep every digit (no float rounding)
    assert.equal(looseDocNumber('0012345678901234567890'), '12345678901234567890')
  })
})

describe('dates and periods', () => {
  test('parseGstnDate', () => {
    assert.equal(parseGstnDate('05-07-2026'), '2026-07-05')
    assert.equal(parseGstnDate('5/7/2026'), '2026-07-05')
    assert.equal(parseGstnDate('2026-07-05'), '2026-07-05')
    assert.equal(parseGstnDate('July 5'), null)
    assert.equal(parseGstnDate(''), null)
  })
  test('parseReturnPeriod', () => {
    assert.deepEqual(parseReturnPeriod('072026'), { iso: '2026-07', label: 'Jul 2026' })
    assert.equal(parseReturnPeriod('132026'), null)
    assert.equal(parseReturnPeriod('002026'), null)
    assert.equal(parseReturnPeriod(undefined), null)
  })
})

describe('parseGstr2b', () => {
  test('reads invoices with item-level and invoice-level tax', () => {
    const p = parseGstr2b(JSON.stringify(PORTAL_2B))
    assert.equal(p.gstin, '36AABCM1234F1ZY')
    assert.deepEqual(p.period, { iso: '2026-07', label: 'Jul 2026' })
    assert.equal(p.rows.length, 4)
    const inv1 = p.rows.find((r) => r.docNumber === 'INV-001')
    assert.equal(inv1.taxable, 10000)
    assert.equal(inv1.totalTax, 1800)
    assert.equal(inv1.docDate, '2026-07-05')
    assert.equal(inv1.supplierFiledOn, '2026-08-11')
    const lc = p.rows.find((r) => r.docNumber === 'LC/042')
    assert.equal(lc.totalTax, 900)
    assert.equal(lc.docDate, '2026-07-12')
  })

  test('flags ITC not available and reverse charge', () => {
    const p = parseGstr2b(PORTAL_2B)
    assert.equal(p.rows.find((r) => r.docNumber === 'KM-77').itcAvailable, false)
    assert.equal(p.rows.find((r) => r.docNumber === 'KM-78').reverseCharge, true)
  })

  test('reads credit and debit notes', () => {
    const p = parseGstr2b(PORTAL_2B)
    assert.equal(p.notes.length, 2)
    assert.equal(p.notes[0].noteType, 'C')
    assert.equal(p.notes[0].totalTax, 90)
    assert.equal(p.notes[1].noteType, 'D')
  })

  test('IMS status and e-invoice fields', () => {
    const p = parseGstr2b(PORTAL_2B)
    const inv1 = p.rows.find((r) => r.docNumber === 'INV-001')
    assert.equal(inv1.imsStatus, 'N')
    assert.equal(inv1.eInvoice, true)
    assert.equal(inv1.irn, 'abc123')
    const lc = p.rows.find((r) => r.docNumber === 'LC/042')
    assert.equal(lc.imsStatus, null)
    assert.equal(lc.eInvoice, false)
  })

  test('warns about sections it does not match, with a count', () => {
    const p = parseGstr2b(PORTAL_2B)
    assert.match(p.warnings.join(' '), /^2 import \(bill of entry\) entries/)
  })

  test('warns about and skips documents without a number', () => {
    const p = parseGstr2b({ docdata: { b2b: [{ ctin: 'X', inv: [{ dt: '01-07-2026' }, { inum: 'A1' }] }] } })
    assert.equal(p.rows.length, 1)
    assert.match(p.warnings[0], /no number/)
  })

  test('accepts docdata at the root', () => {
    const flat = { gstin: 'X', rtnprd: '062026', docdata: PORTAL_2B.data.docdata }
    assert.equal(parseGstr2b(flat).rows.length, 4)
  })

  test('readable errors with codes', () => {
    assert.throws(() => parseGstr2b('not json'), { code: 'INVALID_JSON' })
    assert.throws(() => parseGstr2b('null'), { code: 'EMPTY' })
    assert.throws(() => parseGstr2b({ hello: 'world' }), { code: 'NOT_GSTR2B', message: /GSTR-2B/ })
  })
})

describe('reconcile', () => {
  const parsed = () => parseGstr2b(PORTAL_2B)

  test('exact match within ₹1', () => {
    const r = reconcile(parsed(), [bill({ igst: 1800.4 })])
    assert.equal(r.matched.length, 1)
    assert.equal(r.valueMismatch.length, 0)
    assert.equal(r.matched[0].book.id, 'p1') // your fields come back
  })

  test('tolerance is inclusive and configurable', () => {
    assert.equal(reconcile(parsed(), [bill({ igst: 1801 })]).matched.length, 1)
    assert.equal(reconcile(parsed(), [bill({ igst: 1801 })], { tolerance: 0 }).valueMismatch.length, 1)
  })

  test('same document, different amounts → valueMismatch with differences', () => {
    const r = reconcile(parsed(), [bill({ igst: 1500 })])
    assert.equal(r.valueMismatch.length, 1)
    assert.equal(r.valueMismatch[0].taxDiff, 300)
    assert.equal(r.valueMismatch[0].taxableDiff, 0)
    assert.equal(r.summary.mismatchTax, 300)
  })

  test('"INV-001" on the portal vs "INV/1" in books → probable', () => {
    const r = reconcile(parsed(), [bill({ docNumber: 'INV/1' })])
    assert.equal(r.matched.length, 0)
    assert.equal(r.probable.length, 1)
    assert.equal(r.probable[0].amountsMatch, true)
  })

  test('bills not on the portal → onlyBooks; eligible tax is at risk', () => {
    const r = reconcile(parsed(), [bill(), bill({ id: 'p2', docNumber: 'ZZ-99', igst: 555, taxable: 3083 })])
    assert.equal(r.onlyBooks.length, 1)
    assert.equal(r.onlyBooks[0].id, 'p2')
    assert.equal(r.summary.atRiskTax, 555)
  })

  test('portal rows not in books → only2b; RCM and unavailable left out of the missing tax', () => {
    const r = reconcile(parsed(), [bill()])
    assert.equal(r.only2b.length, 3)
    assert.equal(r.summary.missingFromBooksTax, 900)
  })

  test('one bill never matches two portal rows', () => {
    const twin = { docdata: { b2b: [{ ctin: '27AAAPL1234C1ZV', inv: [
      { inum: 'INV-001', txval: 10000, igst: 1800 },
      { inum: 'INV.001', txval: 10000, igst: 1800 },
    ] }] } }
    const r = reconcile(parseGstr2b(twin), [bill()])
    assert.equal(r.matched.length + r.valueMismatch.length, 1)
    assert.equal(r.only2b.length, 1)
  })

  test('bills without a supplier GSTIN are counted and skipped', () => {
    const r = reconcile(parsed(), [bill(), bill({ id: 'cash', supplierGstin: '' })])
    assert.equal(r.summary.counts.skippedNoGstin, 1)
    assert.equal(r.summary.counts.inBooks, 1)
  })

  test('GSTIN case and spaces in books do not matter', () => {
    const r = reconcile(parsed(), [bill({ supplierGstin: ' 27aaapl1234c1zv ' })])
    assert.equal(r.matched.length, 1)
  })

  test('ITC summary', () => {
    const r = reconcile(parsed(), [bill(), bill({ id: 'rcm', docNumber: 'X1', reverseCharge: true, igst: 50 })])
    // 2B: 1800 + 900 (claimable) − 90 (credit note) + 18 (debit note) = 2628
    assert.equal(r.summary.itc2bAvailable, 2628)
    assert.equal(r.summary.itcBooksEligible, 1800)
    assert.equal(r.summary.matchedTax, 1800)
    assert.equal(r.summary.counts.imsNoAction, 1)
    assert.equal(r.summary.counts.notes, 2)
  })

  test('empty purchase list', () => {
    const r = reconcile(parsed(), [])
    assert.equal(r.only2b.length, 4)
    assert.equal(r.onlyBooks.length, 0)
  })
})
