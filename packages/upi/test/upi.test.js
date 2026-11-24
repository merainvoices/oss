import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidVpa, buildUpiLink, parseUpiLink } from '../src/index.js'

test('isValidVpa accepts common UPI IDs', () => {
  for (const v of ['acme@okaxis', 'foo.bar@ybl', 'user-123@paytm', 'user_name@upi', 'a@b', '  acme@okaxis  ']) {
    assert.equal(isValidVpa(v), true, v)
  }
})

test('isValidVpa rejects malformed values', () => {
  for (const v of ['', null, undefined, 42, 'no-at-symbol', 'user@', '@bank', 'user@bank123', 'user@bank.com', 'a b@ybl']) {
    assert.equal(isValidVpa(v), false, String(v))
  }
})

test('buildUpiLink returns null without a UPI ID', () => {
  assert.equal(buildUpiLink(), null)
  assert.equal(buildUpiLink({}), null)
  assert.equal(buildUpiLink({ vpa: '   ' }), null)
})

test('minimal link', () => {
  assert.equal(buildUpiLink({ vpa: 'acme@okaxis' }), 'upi://pay?pa=acme%40okaxis&cu=INR')
})

test('full link, in spec order, spaces as %20', () => {
  assert.equal(
    buildUpiLink({ vpa: 'acme@okaxis', name: 'Acme Traders', amount: 1234.5, note: 'Invoice INV-001', ref: 'INV-001' }),
    'upi://pay?pa=acme%40okaxis&pn=Acme%20Traders&am=1234.50&tn=Invoice%20INV-001&tr=INV-001&cu=INR',
  )
})

test('amount is left out when zero, negative or not a number', () => {
  for (const amount of [0, -10, NaN, 'abc', undefined, null]) {
    assert.ok(!buildUpiLink({ vpa: 'a@b', amount }).includes('am='), String(amount))
  }
  assert.ok(buildUpiLink({ vpa: 'a@b', amount: '99.999' }).includes('am=100.00'))
})

test('note and ref are trimmed and cut', () => {
  const link = buildUpiLink({ vpa: 'a@b', note: ' ' + 'x'.repeat(80), ref: 'r'.repeat(60) })
  assert.ok(link.includes(`tn=${'x'.repeat(50)}&`))
  assert.ok(link.includes(`tr=${'r'.repeat(35)}&`))
})

test('parseUpiLink reads what buildUpiLink writes', () => {
  const link = buildUpiLink({ vpa: 'acme@okaxis', name: 'Acme & Sons', amount: 500, note: 'Invoice 7', ref: 'INV/7' })
  assert.deepEqual(parseUpiLink(link), {
    vpa: 'acme@okaxis', name: 'Acme & Sons', amount: 500, note: 'Invoice 7', ref: 'INV/7', currency: 'INR',
    params: { pa: 'acme@okaxis', pn: 'Acme & Sons', am: '500.00', tn: 'Invoice 7', tr: 'INV/7', cu: 'INR' },
  })
})

test('parseUpiLink handles QR-style links', () => {
  const r = parseUpiLink('UPI://pay?pa=shop@ybl&pn=Shree+Ganesh&mc=5411&am=&bad=%E0')
  assert.equal(r.vpa, 'shop@ybl')
  assert.equal(r.name, 'Shree Ganesh')
  assert.equal(r.amount, null)
  assert.equal(r.params.mc, '5411')
  assert.equal(r.params.bad, '%E0') // undecodable value kept as is
})

test('parseUpiLink rejects other links', () => {
  assert.equal(parseUpiLink('https://example.com/?pa=a@b'), null)
  assert.equal(parseUpiLink('upi://pay?pn=NoId'), null)
  assert.equal(parseUpiLink(''), null)
  assert.equal(parseUpiLink(null), null)
})
