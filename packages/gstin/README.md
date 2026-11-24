# @merainvoices/gstin

Validate GSTINs, including the check digit, read the state and PAN inside them, and decide whether a sale is intra-state (CGST + SGST) or inter-state (IGST).

Zero dependencies. Works in Node 18+, browsers, React Native and edge runtimes. Ships with TypeScript types.

```sh
npm install @merainvoices/gstin
```

## Validate

```js
import { validateGSTIN, isValidGSTIN } from '@merainvoices/gstin'

validateGSTIN('27aapfu0939f1zv')
// { valid: true, gstin: '27AAPFU0939F1ZV', code: null, error: null }

validateGSTIN('27AAPFU0939F1ZW')
// { valid: false, gstin: '27AAPFU0939F1ZW', code: 'CHECKSUM',
//   error: 'The last character does not match — check the GSTIN for a typo' }

isValidGSTIN('27AAPFU0939F1ZV') // true
```

`code` is one of `EMPTY`, `LENGTH`, `FORMAT`, `STATE`, `CHECKSUM`. Use it to show your own message in any language.

The check digit catches most single-character typos and swapped neighbours. It does not tell you whether the GSTIN is registered or active; for that, search it on the GST portal.

Covers regular, composition and SEZ registrations, which share one layout. UIN, OIDAR, non-resident and TDS/TCS registrations use other layouts and are rejected.

## State and PAN

```js
import { stateCodeFromGSTIN, stateFromGSTIN, panFromGSTIN, panHolderType, stateName, STATES } from '@merainvoices/gstin'

stateCodeFromGSTIN('29AAGCB7383J1Z4') // '29'
stateFromGSTIN('29AAGCB7383J1Z4')     // 'Karnataka'
stateCodeFromGSTIN('36')              // '36' — a partly typed GSTIN is enough
panFromGSTIN('27AAPFU0939F1ZV')       // 'AAPFU0939F'
panHolderType('AAPFU0939F')           // 'Firm / LLP'
stateName('07')                       // 'Delhi'

STATES // [{ code: '35', name: 'Andaman & Nicobar Islands' }, …] sorted by name, for a place-of-supply picker
```

`STATE_CODES` lists every code a GSTIN can start with, including the old Andhra Pradesh code (28), Other Territory (97) and Centre Jurisdiction (99).

## CGST + SGST or IGST?

```js
import { isInterStateSupply } from '@merainvoices/gstin'

const seller = { gstin: '36AABCM1234F1ZY' }               // Telangana
isInterStateSupply({ seller, buyer: { gstin: '27AAPFU0939F1ZV' } }) // true  → IGST
isInterStateSupply({ seller, buyer: { stateCode: '36' } })          // false → CGST + SGST
isInterStateSupply({ seller, buyer: { gstin: '36AABCM1234F1ZY', sez: true } }) // true — SEZ is always IGST
isInterStateSupply({ seller, buyer: { gstin: '27AAPFU0939F1ZV' }, shipToStateCode: '36' }) // false
```

Rules, in order:

1. No buyer: `false`.
2. SEZ buyer: `true`, wherever it is (section 7(5)(b), IGST Act).
3. Compare state codes. A GSTIN's prefix wins over a stored `stateCode`, because a registered party's state is fixed by its registration and stored codes go stale. A ship-to state, when given, replaces the buyer's.
4. If either state is unknown: `false`.

Exports and other document-level cases are yours to add.

## Recipes

### Your own error messages, in any language

`code` is stable, so map it to your own words:

```js
const HINDI = {
  EMPTY: 'GSTIN दर्ज करें',
  LENGTH: 'GSTIN में ठीक 15 अक्षर होते हैं',
  FORMAT: 'यह GSTIN के प्रारूप में नहीं है',
  STATE: 'शुरू के दो अंक किसी राज्य का कोड नहीं हैं',
  CHECKSUM: 'आख़िरी अक्षर मेल नहीं खाता — टाइपिंग की ग़लती जाँचें',
}

const r = validateGSTIN(input)
const message = r.valid ? '' : HINDI[r.code]
```

Full script: [`examples/gstin-hindi.mjs`](https://github.com/merainvoices/oss/blob/main/examples/gstin-hindi.mjs).

### Fill the state while the GSTIN is being typed

```js
gstinInput.addEventListener('input', (e) => {
  const code = stateCodeFromGSTIN(e.target.value)   // works from the first two characters
  if (code) stateSelect.value = code
})
```

### A place-of-supply picker

```js
stateSelect.innerHTML = STATES.map((s) => `<option value="${s.code}">${s.name} (${s.code})</option>`).join('')
```

### With `@merainvoices/gst-invoice`

```js
import { computeInvoice } from '@merainvoices/gst-invoice'

const invoice = computeInvoice({ items, interState: isInterStateSupply({ seller, buyer }) })
```

## API

| Export | Returns |
| --- | --- |
| `validateGSTIN(input)` | `{ valid, gstin, code, error }` |
| `isValidGSTIN(input)` | `boolean` |
| `normalizeGSTIN(input)` | trimmed, uppercased string |
| `gstinCheckDigit(first14)` | the 15th character |
| `stateCodeFromGSTIN(gstin)` | `'27'` or `null` |
| `stateFromGSTIN(gstin)` | `'Maharashtra'` or `null` |
| `stateName(code)` | name or `null` |
| `panFromGSTIN(gstin)` | PAN or `null` |
| `isValidPAN(pan)` | `boolean` (format only) |
| `panHolderType(pan)` | `'Company'`, `'Individual'`, … or `null` |
| `resolveStateCode({ gstin, stateCode })` | effective state code or `null` |
| `isInterStateSupply({ seller, buyer, shipToStateCode })` | `boolean` |
| `STATES`, `STATE_CODES` | frozen `{ code, name }[]` |
| `GSTIN_REGEX`, `PAN_REGEX` | `RegExp` |

Part of the [Mera Invoices toolkit](https://github.com/merainvoices/oss): [gstin](https://www.npmjs.com/package/@merainvoices/gstin) · [gst-invoice](https://www.npmjs.com/package/@merainvoices/gst-invoice) · [inr](https://www.npmjs.com/package/@merainvoices/inr) · [upi](https://www.npmjs.com/package/@merainvoices/upi) · [gstr2b](https://www.npmjs.com/package/@merainvoices/gstr2b) · [bank-statement](https://www.npmjs.com/package/@merainvoices/bank-statement).

## Licence

MIT © REKSMART Insights Private Limited. From [Mera Invoices](https://merainvoices.com), GST billing for Indian businesses.

This library helps you check data. It is not tax advice; confirm how GST applies to your business with a chartered accountant.
