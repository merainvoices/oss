// Match a GSTR-2B download against your purchase register.
//
//   node examples/gstr2b-reconcile.mjs

import { readFileSync } from 'node:fs'
import { parseGstr2b, reconcile } from '@merainvoices/gstr2b'
import { formatINR } from '@merainvoices/inr'

// The file from GST portal → Returns → GSTR-2B → Download JSON (sample data).
const gstr2b = parseGstr2b(readFileSync(new URL('./data/gstr2b-oct-2026.json', import.meta.url), 'utf8'))

// Your purchase bills for October, from your own database.
const purchases = [
  { id: 101, supplierGstin: '27AABFL4321K1ZF', docNumber: 'INV-001', docDate: '2026-10-05', taxable: 10000, cgst: 900, sgst: 900 },
  { id: 102, supplierGstin: '27AABFL4321K1ZF', docNumber: 'LC/042', docDate: '2026-10-12', taxable: 5000, cgst: 450, sgst: 450 },
  { id: 103, supplierGstin: '29AACFK8765M1ZJ', docNumber: 'KM/7', docDate: '2026-10-18', taxable: 6000, igst: 1080 },
  { id: 104, supplierGstin: '27AAGFG1357R1ZV', docNumber: 'GH-55', docDate: '2026-10-26', taxable: 4000, cgst: 360, sgst: 360 },
]

const r = reconcile(gstr2b, purchases)

console.log(`GSTR-2B ${gstr2b.period.label} for ${gstr2b.gstin}`)
for (const m of r.matched) console.log(`Matched            ${m.book.docNumber}`)
for (const m of r.valueMismatch) console.log(`Amounts differ     ${m.book.docNumber}: GST ${formatINR(Math.abs(m.taxDiff))} ${m.taxDiff < 0 ? 'less' : 'more'} on the portal`)
for (const m of r.probable) console.log(`Probably the same  ${m.book.docNumber} ↔ ${m.row2b.docNumber}`)
for (const x of r.only2b) console.log(`Only on the portal ${x.supplierName} ${x.docNumber}: ${formatINR(x.totalTax)} ITC not booked`)
for (const b of r.onlyBooks) console.log(`Only in your books ${b.docNumber} (bill ${b.id}): ${formatINR(b.totalTax)} ITC at risk`)
console.log(`ITC on GSTR-2B ${formatINR(r.summary.itc2bAvailable)} · in your books ${formatINR(r.summary.itcBooksEligible)} · at risk ${formatINR(r.summary.atRiskTax)}`)
