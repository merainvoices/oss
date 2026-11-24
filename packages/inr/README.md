# @merainvoices/inr

Indian rupee formatting, amounts in words (lakh and crore), the April–March financial year, and invoice numbers that follow the GST rules.

Zero dependencies. Works in Node 18+, browsers, React Native (Hermes) and edge runtimes. Ships with TypeScript types.

```sh
npm install @merainvoices/inr
```

## Rupees

```js
import { formatINR, formatIndianNumber } from '@merainvoices/inr'

formatINR(123456)                    // '₹1,23,456.00'
formatINR(-1500.5)                   // '-₹1,500.50'
formatINR(1234, { symbol: false })   // '1,234.00'
formatIndianNumber(1234567.5)        // '12,34,567.5'
```

## Amount in words

```js
import { amountInWords, numberToWords } from '@merainvoices/inr'

amountInWords(1234.5)
// 'Indian Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only'

amountInWords(250000, { prefix: 'Rupees', suffix: 'Only' })
// 'Rupees Two Lakh Fifty Thousand Only'

numberToWords(10000000) // 'One Crore'
```

Amounts are rounded to the nearest paisa.

## Financial year

```js
import { financialYear } from '@merainvoices/inr'

financialYear('2025-11-02')
// { label: '2025-26', short: '2526', startYear: 2025, endYear: 2026,
//   start: '2025-04-01', end: '2026-03-31' }

financialYear(new Date('2026-03-31T20:00:00Z')).label // '2026-27'
```

A `'YYYY-MM-DD'` string is read as that calendar date. A `Date` is read in India time by default, so a server running in UTC still puts 1 April 01:30 IST in the new year. Pass `{ timeZone }` to change it.

## Invoice numbers

```js
import { formatInvoiceNumber, checkInvoiceNumber } from '@merainvoices/inr'

formatInvoiceNumber('INV/{yyyy-yy}/{n}', { seq: 7, date: '2025-11-02' }) // 'INV/2025-26/007'

checkInvoiceNumber('INV/2025-26/10000')
// { valid: false, length: 17, code: 'TOO_LONG', error: 'Invoice numbers can have at most 16 characters (this has 17)' }
```

Template tokens:

| Token | Example |
| --- | --- |
| `{n}` | `007` (padded to 3 digits, or `pad`) |
| `{fy}` | `2526` |
| `{yyyy-yy}` | `2025-26` |
| `{yyyy}` | `2025` (the year the financial year starts) |
| `{yy}` | `25` |

`checkInvoiceNumber` follows Rule 46(b) of the CGST Rules: up to 16 characters, using only letters, digits, hyphen (`-`) and slash (`/`). Numbers must also be unique within a financial year; that check is yours, against your own records.

## Recipes

### The invoice footer

```js
amountInWords(invoice.total, { prefix: 'Rupees' })
// 'Rupees Eleven Thousand Four Hundred Ninety Four Only'
```

### A new number series every April

```js
const fy = financialYear(invoiceDate)
const seq = last && last.fy === fy.label ? last.seq + 1 : 1   // restart at 1 in a new financial year
const number = formatInvoiceNumber('INV/{yyyy-yy}/{n}', { seq, fy })
```

### Check a numbering template before saving it

Try the longest number the series will produce this year:

```js
checkInvoiceNumber(formatInvoiceNumber('INV/{yyyy-yy}/{n}', { seq: 9999, date: new Date() })).valid    // true: 16 characters
checkInvoiceNumber(formatInvoiceNumber('INV/{yyyy-yy}/{n}', { seq: 10000, date: new Date() })).valid   // false: 17
```

Part of the [Mera Invoices toolkit](https://github.com/merainvoices/oss): [gstin](https://www.npmjs.com/package/@merainvoices/gstin) · [gst-invoice](https://www.npmjs.com/package/@merainvoices/gst-invoice) · [inr](https://www.npmjs.com/package/@merainvoices/inr) · [upi](https://www.npmjs.com/package/@merainvoices/upi) · [gstr2b](https://www.npmjs.com/package/@merainvoices/gstr2b) · [bank-statement](https://www.npmjs.com/package/@merainvoices/bank-statement).

## Licence

MIT © REKSMART Insights Private Limited. From [Mera Invoices](https://merainvoices.com), GST billing for Indian businesses.

This library formats and checks data. It is not tax advice.
