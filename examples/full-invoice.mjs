// A whole GST invoice with four packages: check the buyer's GSTIN, number the
// invoice, add it up, write the total in words and build the UPI payment link.
//
//   node examples/full-invoice.mjs

import { validateGSTIN, isInterStateSupply, stateFromGSTIN } from '@merainvoices/gstin'
import { computeInvoice } from '@merainvoices/gst-invoice'
import { financialYear, formatInvoiceNumber, amountInWords, formatINR } from '@merainvoices/inr'
import { buildUpiLink } from '@merainvoices/upi'

const seller = { name: 'Shree Ganesh Electricals', gstin: '27ABCFS1234K1Z7', upi: 'shreeganesh@example' }
const buyer = { name: 'Patil Hardware Stores', gstin: '27aakfp5678l1ze' }

// 1. The buyer's GSTIN decides CGST + SGST or IGST.
const check = validateGSTIN(buyer.gstin)
if (!check.valid) throw new Error(check.error)
const interState = isInterStateSupply({ seller, buyer: { gstin: check.gstin } })

// 2. Number the invoice in this financial year's series.
const date = '2026-11-24'
const number = formatInvoiceNumber('INV/{yyyy-yy}/{n}', { seq: 7, date })

// 3. Add it up.
const invoice = computeInvoice({
  items: [
    { qty: 4, rate: 1250, gstRate: 18 },                       // LED panel light 18W
    { qty: 2, rate: 1890, discountPercent: 5, gstRate: 18 },   // Copper wire, 5% off
    { qty: 1, rate: 850, gstRate: 18 },                        // Fitting charges
  ],
  interState,
  freight: { amount: 300, gstRate: 18 },
  roundOff: true,
})

// 4. Payment link for a QR code or a Pay button.
const upi = buildUpiLink({ vpa: seller.upi, name: seller.name, amount: invoice.total, note: `Invoice ${number}`, ref: number })

console.log(`${seller.name} → ${buyer.name}`)
console.log(`Buyer GSTIN ${check.gstin} (${stateFromGSTIN(check.gstin)}) · ${interState ? 'IGST' : 'CGST + SGST'}`)
console.log(`Invoice ${number} · FY ${financialYear(date).label}`)
console.log(`Taxable ${formatINR(invoice.taxable)} · CGST ${formatINR(invoice.cgst)} · SGST ${formatINR(invoice.sgst)} · Round off ${formatINR(invoice.roundOff)}`)
console.log(`Total ${formatINR(invoice.total)}`)
console.log(amountInWords(invoice.total))
console.log(upi)
