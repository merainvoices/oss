// GSTIN checks with your own messages — here in Hindi — keyed by the error code.
//
//   node examples/gstin-hindi.mjs

import { validateGSTIN, stateCodeFromGSTIN, stateName } from '@merainvoices/gstin'

const HINDI = {
  EMPTY: 'GSTIN दर्ज करें',
  LENGTH: 'GSTIN में ठीक 15 अक्षर होते हैं',
  FORMAT: 'यह GSTIN के प्रारूप में नहीं है',
  STATE: 'शुरू के दो अंक किसी राज्य का कोड नहीं हैं',
  CHECKSUM: 'आख़िरी अक्षर मेल नहीं खाता — टाइपिंग की ग़लती जाँचें',
}

const message = (input) => {
  const r = validateGSTIN(input)
  return r.valid ? `✓ ${r.gstin}` : `✗ ${HINDI[r.code]}`
}

for (const input of ['27ABCFS1234K1Z7', '27ABCFS1234K1Z8', '27ABCFS1234', '50ABCFS1234K1Z7', '']) {
  console.log(`${JSON.stringify(input).padEnd(19)} ${message(input)}`)
}

// Fill the state as soon as two characters are typed.
const typed = '29'
console.log(`"${typed}…" → ${stateName(stateCodeFromGSTIN(typed))}`)
