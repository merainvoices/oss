# Mera Invoices open-source toolkit

Small, dependency-free JavaScript packages for Indian GST billing. The code comes from [Mera Invoices](https://merainvoices.com), a GST billing app, where it runs in the web app.

| Package | What it does |
| --- | --- |
| [`@merainvoices/gstin`](packages/gstin) | Validate GSTINs with the check digit, read state and PAN, decide CGST + SGST vs IGST |
| [`@merainvoices/inr`](packages/inr) | ₹1,23,456.00 formatting, amount in words (lakh/crore), April–March financial year, Rule 46 invoice numbers |
| [`@merainvoices/upi`](packages/upi) | Build and read `upi://pay` links for invoices and QR codes |
| [`@merainvoices/gstr2b`](packages/gstr2b) | Read the GSTR-2B JSON from the GST portal and match it against your purchase register |

Every package:

- has no dependencies and no side effects,
- is plain ESM that runs in Node 18+, browsers, React Native and edge runtimes,
- ships TypeScript types,
- is tested with Node's built-in test runner.

## Develop

```sh
npm test            # every package
npm run pack:check  # what each package would publish
```

No install step is needed; there are no dependencies.

## Not tax advice

These packages check and transform data. They don't file returns or decide what tax applies to you. Confirm GST treatment with a chartered accountant.

## Licence

[MIT](LICENSE) © REKSMART Insights Private Limited
