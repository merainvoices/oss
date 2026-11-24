// @merainvoices/upi — build and read UPI payment links (upi://pay?...).
//
// A UPI link opens any UPI app (Google Pay, PhonePe, Paytm, BHIM, bank apps)
// with the payee, amount and note filled in. Put it behind a button on a
// phone, or in a QR code for a printed invoice.
//
// Parameters (NPCI UPI linking specification):
//   pa  payee UPI ID (VPA)   required
//   pn  payee name
//   am  amount, 2 decimals   leave out to let the payer type it
//   tn  transaction note
//   tr  transaction reference
//   cu  currency, always INR
//
// Zero dependencies.

/** Notes and references longer than these get cut off by most UPI apps. */
export const NOTE_MAX_LENGTH = 50
export const REF_MAX_LENGTH = 35

// <handle>@<provider>. The provider is letters only (okaxis, ybl, paytm, ibl…);
// the handle allows letters, digits, dot, hyphen and underscore.
const VPA_RE = /^[a-zA-Z0-9._-]+@[a-zA-Z]+$/

/** True for something shaped like a UPI ID (e.g. "shop@okaxis"). Does not check it exists. */
export function isValidVpa(vpa) {
  return typeof vpa === 'string' && VPA_RE.test(vpa.trim())
}

const clean = (v) => (v == null ? '' : String(v).trim())

/**
 * Build a `upi://pay?...` link. Returns null when there is no UPI ID.
 *
 * Empty fields are left out. Spaces are encoded as %20, not '+', because some
 * Android UPI apps do not decode '+'. `cu=INR` comes last; a few older apps
 * reject links without it.
 *
 * @param {object} args
 * @param {string} args.vpa              payee UPI ID
 * @param {string} [args.name]           payee name shown in the app
 * @param {number|string} [args.amount]  rupees; 0, negative or not a number → left out
 * @param {string} [args.note]           cut to 50 characters
 * @param {string} [args.ref]            your reference (e.g. invoice number), cut to 35 characters
 * @returns {string|null}
 */
export function buildUpiLink({ vpa, name, amount, note, ref } = {}) {
  const pa = clean(vpa)
  if (!pa) return null
  const parts = [`pa=${encodeURIComponent(pa)}`]

  const pn = clean(name)
  if (pn) parts.push(`pn=${encodeURIComponent(pn)}`)

  const am = Number(amount)
  if (Number.isFinite(am) && am > 0) parts.push(`am=${am.toFixed(2)}`)

  const tn = clean(note).slice(0, NOTE_MAX_LENGTH)
  if (tn) parts.push(`tn=${encodeURIComponent(tn)}`)

  const tr = clean(ref).slice(0, REF_MAX_LENGTH)
  if (tr) parts.push(`tr=${encodeURIComponent(tr)}`)

  parts.push('cu=INR')
  return `upi://pay?${parts.join('&')}`
}

const decode = (s) => {
  try { return decodeURIComponent(s.replace(/\+/g, ' ')) } catch { return s }
}

/**
 * Read a `upi://pay?...` link (for example from a scanned QR code).
 * Returns null if it is not a UPI pay link or has no UPI ID.
 * Unknown parameters are kept in `params`.
 *
 * @param {string} link
 * @returns {{ vpa: string, name: string|null, amount: number|null, note: string|null, ref: string|null, currency: string|null, params: Record<string, string> } | null}
 */
export function parseUpiLink(link) {
  const s = clean(link)
  const m = /^upi:\/\/pay\?(.*)$/i.exec(s)
  if (!m) return null
  const params = {}
  for (const pair of m[1].split('&')) {
    if (!pair) continue
    const i = pair.indexOf('=')
    const key = decode(i === -1 ? pair : pair.slice(0, i))
    const value = i === -1 ? '' : decode(pair.slice(i + 1))
    if (!(key in params)) params[key] = value
  }
  if (!params.pa) return null
  const am = params.am != null && params.am !== '' ? Number(params.am) : null
  return {
    vpa: params.pa,
    name: params.pn || null,
    amount: am != null && Number.isFinite(am) ? am : null,
    note: params.tn || null,
    ref: params.tr || null,
    currency: params.cu || null,
    params,
  }
}
