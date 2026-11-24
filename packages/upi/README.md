# @merainvoices/upi

Build and read UPI payment links (`upi://pay?…`). On a phone, a link opens any UPI app (Google Pay, PhonePe, Paytm, BHIM, bank apps) with the payee, amount and note filled in. In a QR code, it lets a customer pay a printed invoice by scanning.

Zero dependencies. Ships with TypeScript types.

```sh
npm install @merainvoices/upi
```

## Build a link

```js
import { buildUpiLink, isValidVpa } from '@merainvoices/upi'

isValidVpa('shop@okaxis') // true

buildUpiLink({
  vpa: 'shop@okaxis',
  name: 'Shree Ganesh Electricals',
  amount: 1234.5,
  note: 'Invoice INV/2025-26/007',
  ref: 'INV/2025-26/007',
})
// 'upi://pay?pa=shop%40okaxis&pn=Shree%20Ganesh%20Electricals&am=1234.50&tn=Invoice%20INV%2F2025-26%2F007&tr=INV%2F2025-26%2F007&cu=INR'
```

- Returns `null` when there is no UPI ID, so you can fall back to showing it as text.
- Leave out `amount` (or pass 0) to let the payer type the amount.
- Spaces are encoded as `%20`, not `+`, because some Android UPI apps don't decode `+`.
- `note` is cut to 50 characters and `ref` to 35, which is what most UPI apps show.
- `cu=INR` is always added last; a few older apps reject links without it.

To make a QR code, pass the link to any QR library.

## Read a link

```js
import { parseUpiLink } from '@merainvoices/upi'

parseUpiLink('upi://pay?pa=shop@ybl&pn=Shree+Ganesh&am=500&cu=INR')
// { vpa: 'shop@ybl', name: 'Shree Ganesh', amount: 500, note: null, ref: null, currency: 'INR',
//   params: { pa: 'shop@ybl', pn: 'Shree Ganesh', am: '500', cu: 'INR' } }
```

Returns `null` for anything that isn't a UPI pay link with a UPI ID.

## What this does not do

It does not move money, check that a UPI ID exists, or confirm a payment. A link only opens the payer's app; record the payment when you see it in your bank account.

## Licence

MIT © REKSMART Insights Private Limited. From [Mera Invoices](https://merainvoices.com), GST billing for Indian businesses.
