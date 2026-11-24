// Runs every example and checks its key lines, so the examples (and the README
// snippets taken from them) can't quietly go stale. Needs `npm install` at the
// repository root first, which links the packages by name.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const run = (file) => execFileSync(process.execPath, [new URL(file, import.meta.url).pathname], { encoding: 'utf8' })

test('full-invoice', () => {
  const out = run('./full-invoice.mjs')
  assert.match(out, /Buyer GSTIN 27AAKFP5678L1ZE \(Maharashtra\) · CGST \+ SGST/)
  assert.match(out, /Invoice INV\/2026-27\/007 · FY 2026-27/)
  assert.match(out, /CGST ₹876\.69 · SGST ₹876\.69 · Round off -₹0\.38/)
  assert.match(out, /Total ₹11,494\.00/)
  assert.match(out, /Indian Rupees Eleven Thousand Four Hundred Ninety Four Only/)
  assert.match(out, /upi:\/\/pay\?pa=shreeganesh%40example&.*am=11494\.00.*&cu=INR/)
})

test('gstin-hindi', () => {
  const out = run('./gstin-hindi.mjs')
  assert.match(out, /✓ 27ABCFS1234K1Z7/)
  assert.match(out, /आख़िरी अक्षर मेल नहीं खाता/)
  assert.match(out, /"29…" → Karnataka/)
})

test('gstr2b-reconcile', () => {
  const out = run('./gstr2b-reconcile.mjs')
  assert.match(out, /Matched\s+INV-001/)
  assert.match(out, /Amounts differ\s+LC\/042: GST ₹300\.00 less on the portal/)
  assert.match(out, /Probably the same\s+KM\/7 ↔ KM-007/)
  assert.match(out, /Only on the portal Sai Traders ST-118: ₹360\.00/)
  assert.match(out, /Only in your books GH-55 \(bill 104\): ₹720\.00 ITC at risk/)
  assert.match(out, /ITC on GSTR-2B ₹3,840\.00 · in your books ₹4,500\.00 · at risk ₹720\.00/)
})

test('bank-statement', () => {
  const out = run('./bank-statement.mjs')
  assert.match(out, /5 transactions · running balance checks out/)
  assert.match(out, /PV-88\s+↔ NEFT-LAKSHMI COMPONENTS \(1 day apart\)/)
  assert.match(out, /Not in your books: SMS ALERT CHGS INCL GST ₹17\.70/)
  assert.match(out, /Not on the statement yet: PV-91 ₹6,500\.00/)
})
