import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseCsv, guessColumns, hasRequiredColumns, findHeaderRow, parseDate, parseAmount,
  readTransactions, readStatement, checkRunningBalance, matchTransactions,
} from '../src/index.js'

// HDFC-style: account details above the table, separate withdrawal/deposit columns, dd/mm/yy.
const HDFC_CSV = `HDFC BANK Ltd.
Statement of account,,,,,
Account No :,50100123456789,,,,
,,,,,
Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/08/26,UPI-RAVI KUMAR TRADERS-PAYMENT,0000123,01/08/26,,"18,880.00","1,42,880.00"
03/08/26,NEFT-RENT AUGUST,N206261234,03/08/26,"25,000.00",,"1,17,880.00"
05/08/26,POS 4265 OFFICE SUPPLIES,,05/08/26,"3,200.50",,"1,14,679.50"
,,,,,
STATEMENT SUMMARY :-,,,,,`

// SBI-style: one amount column and a Dr/Cr column.
const SBI_ROWS = [
  ['State Bank of India'],
  ['Account Statement', '', '', ''],
  ['Txn Date', 'Description', 'Amount', 'Dr/Cr', 'Balance'],
  ['05-Aug-2026', 'TRANSFER FROM SHARMA ENT', '29,500.00', 'CR', '95,000.00'],
  ['06-Aug-2026', 'ATM WDL', '5,000.00', 'DR', '90,000.00'],
]

describe('parseCsv', () => {
  test('quotes, escaped quotes, CRLF, byte-order mark, blank rows', () => {
    const rows = parseCsv('﻿a,"b, with comma","say ""hi"""\r\n\r\n1,2,3\n,,\n4,5,"multi\nline"')
    assert.deepEqual(rows, [['a', 'b, with comma', 'say "hi"'], ['1', '2', '3'], ['4', '5', 'multi\nline']])
  })
  test('other delimiters', () => {
    assert.deepEqual(parseCsv('a;b\n1;2', { delimiter: ';' }), [['a', 'b'], ['1', '2']])
    assert.deepEqual(parseCsv('a\tb', { delimiter: '\t' }), [['a', 'b']])
  })
  test('empty input', () => {
    assert.deepEqual(parseCsv(''), [])
    assert.deepEqual(parseCsv(null), [])
  })
})

describe('header and columns', () => {
  test('finds the HDFC header under the account details', () => {
    const rows = parseCsv(HDFC_CSV)
    const i = findHeaderRow(rows)
    assert.equal(rows[i][0], 'Date')
  })

  test('withdrawal/deposit columns', () => {
    const c = guessColumns(['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'])
    assert.deepEqual(c, { date: 0, description: 1, debit: 4, credit: 5, amount: -1, drcr: -1, balance: 6, reference: 2 })
    assert.equal(hasRequiredColumns(c), true)
  })

  test('amount + Dr/Cr columns', () => {
    const c = guessColumns(SBI_ROWS[2])
    assert.equal(c.amount, 2)
    assert.equal(c.drcr, 3)
    assert.equal(hasRequiredColumns(c), true)
  })

  test('a "Debit/Credit" column is the indicator, not the debit column', () => {
    const c = guessColumns(['Date', 'Particulars', 'Amount', 'Debit/Credit', 'Balance'])
    assert.equal(c.drcr, 3)
    assert.equal(c.debit, -1)
  })

  test('spacing and "(INR)" labels', () => {
    const c = guessColumns(['Value Date', 'Transaction Date', 'Transaction Remarks', 'Withdrawal Amount (INR )', 'Deposit Amount (INR )', 'Balance (INR )'])
    assert.equal(c.date, 1)
    assert.equal(c.description, 2)
    assert.equal(c.debit, 3)
    assert.equal(c.credit, 4)
    assert.equal(c.balance, 5)
  })

  test('no usable header', () => {
    assert.equal(findHeaderRow([['hello', 'world', 'foo'], ['1', '2', '3']]), -1)
    assert.equal(hasRequiredColumns(guessColumns(['Name', 'Phone', 'City'])), false)
    assert.equal(hasRequiredColumns(null), false)
  })
})

describe('parseDate (day first)', () => {
  const cases = [
    ['05/08/2026', '2026-08-05'], ['05/08/26', '2026-08-05'], ['5-8-2026', '2026-08-05'],
    ['05.08.2026', '2026-08-05'], ['05 Aug 2026', '2026-08-05'], ['5-Aug-26', '2026-08-05'],
    ['05-August-2026', '2026-08-05'], ['2026-08-05', '2026-08-05'], ['2026-08-05T10:30:00', '2026-08-05'],
    ['05/08/2026 10:42', '2026-08-05'], [46239, '2026-08-05'], [new Date(2026, 7, 5, 23, 30), '2026-08-05'],
    ['29/02/2024', '2024-02-29'],
  ]
  for (const [input, expected] of cases) test(`${input} → ${expected}`, () => assert.equal(parseDate(input), expected))

  test('impossible or unreadable dates → null', () => {
    for (const bad of ['31/02/2026', '29/02/2026', '99/99/2026', '00/08/2026', '05/13/2026', 'STATEMENT SUMMARY', '', null, 'Aug 5 2026', 0, -5, new Date('x')]) {
      assert.equal(parseDate(bad), null, String(bad))
    }
  })
})

describe('parseAmount', () => {
  test('Indian grouping, symbols, brackets, signs, Cr/Dr', () => {
    assert.equal(parseAmount('1,23,456.78').value, 123456.78)
    assert.equal(parseAmount('₹ 5,000').value, 5000)
    assert.equal(parseAmount('Rs. 5,000').value, 5000)
    assert.equal(parseAmount('INR 5000').value, 5000)
    assert.equal(parseAmount('(2,500)').value, -2500)
    assert.equal(parseAmount('-750.25').value, -750.25)
    assert.equal(parseAmount('+100').value, 100)
    assert.deepEqual(parseAmount('5000.00 Cr'), { value: 5000, indicator: 'CR' })
    assert.deepEqual(parseAmount('5000.00CR'), { value: 5000, indicator: 'CR' })
    assert.equal(parseAmount('120 Dr.').indicator, 'DR')
    assert.equal(parseAmount(1234.5).value, 1234.5)
  })
  test('unreadable → 0', () => {
    for (const bad of ['—', 'abc', '1.2.3', '', null, NaN]) assert.deepEqual(parseAmount(bad), { value: 0, indicator: null }, String(bad))
  })
})

describe('reading transactions', () => {
  test('HDFC: footers skipped, directions right, reference kept', () => {
    const { headerRow, transactions } = readStatement(HDFC_CSV)
    assert.equal(headerRow, 3) // the blank ',,,,,' line is dropped by parseCsv
    assert.equal(transactions.length, 3)
    assert.deepEqual(transactions[0], {
      row: 4, date: '2026-08-01', description: 'UPI-RAVI KUMAR TRADERS-PAYMENT', reference: '0000123',
      moneyIn: 18880, moneyOut: 0, balance: 142880,
    })
    assert.equal(transactions[1].moneyOut, 25000)
    assert.equal(transactions[2].moneyOut, 3200.5)
    assert.equal(transactions[2].balance, 114679.5)
  })

  test('SBI: amount + Dr/Cr', () => {
    const { transactions } = readStatement(SBI_ROWS)
    assert.deepEqual(transactions.map((t) => [t.date, t.moneyIn, t.moneyOut]), [['2026-08-05', 29500, 0], ['2026-08-06', 0, 5000]])
  })

  test('spelled-out indicators, Cr/Dr suffixes, and signs when there is no indicator', () => {
    const rows = [
      ['Date', 'Particulars', 'Amount', 'Debit/Credit', 'Balance'],
      ['01/09/2026', 'A', '100', 'Credit', '100'],
      ['02/09/2026', 'B', '40', 'Debit', '60'],
      ['03/09/2026', 'C', '10 Dr', '', '50'],
      ['04/09/2026', 'D', '-5', '', '45'],
      ['05/09/2026', 'E', '75', '', '120'],
    ]
    const { transactions } = readStatement(rows)
    assert.deepEqual(transactions.map((t) => [t.moneyIn, t.moneyOut]), [[100, 0], [0, 40], [0, 10], [0, 5], [75, 0]])
  })

  test('overdrawn balance marked Dr is negative', () => {
    const { transactions } = readStatement([
      ['Date', 'Narration', 'Withdrawal', 'Deposit', 'Balance'],
      ['01/09/2026', 'Cheque', '5,000', '', '1,200.00 Dr'],
    ])
    assert.equal(transactions[0].balance, -1200)
  })

  test('given columns override the guess', () => {
    const rows = [['When', 'What', 'Out', 'In', 'x'], ['01/09/2026', 'A', '', '10', '']]
    assert.throws(() => readStatement(rows), { code: 'NO_HEADER' })
    const { transactions } = readStatement(rows, { headerRow: 0, columns: { date: 0, description: 1, debit: 2, credit: 3 } })
    assert.deepEqual(transactions.map((t) => [t.description, t.moneyIn]), [['A', 10]])
  })

  test('readTransactions works on its own', () => {
    const rows = parseCsv(HDFC_CSV)
    const h = findHeaderRow(rows)
    assert.equal(readTransactions(rows, h, guessColumns(rows[h])).length, 3)
  })

  test('readStatement without a table', () => {
    assert.throws(() => readStatement('name,phone\nA,1'), { code: 'NO_HEADER' })
    assert.throws(() => readStatement(''), { code: 'NO_HEADER' })
  })
})

describe('checkRunningBalance', () => {
  test('oldest first', () => {
    assert.deepEqual(checkRunningBalance(readStatement(HDFC_CSV).transactions), { ok: true, order: 'oldest-first', mismatches: [] })
  })
  test('newest first', () => {
    const t = readStatement(HDFC_CSV).transactions.reverse()
    assert.equal(checkRunningBalance(t).order, 'newest-first')
    assert.equal(checkRunningBalance(t).ok, true)
  })
  test('a misread amount shows up', () => {
    const t = readStatement(HDFC_CSV).transactions
    t[1] = { ...t[1], moneyOut: 2500 } // decimal point lost
    const r = checkRunningBalance(t)
    assert.equal(r.ok, false)
    assert.deepEqual(r.mismatches[0], { row: 5, expected: 140380, actual: 117880 })
  })
  test('nothing to check', () => {
    assert.deepEqual(checkRunningBalance([]), { ok: true, order: null, mismatches: [] })
  })
})

describe('matchTransactions', () => {
  const stmt = readStatement(HDFC_CSV).transactions
  const ENTRIES = [
    { id: 'a', direction: 'in', amount: 18880, date: '2026-08-01' },
    { id: 'b', direction: 'out', amount: 25000, date: '2026-08-02' },
    { id: 'c', direction: 'out', amount: 3200.5, date: '2026-08-05' },
    { id: 'd', direction: 'in', amount: 12400, date: '2026-08-04' },
  ]

  test('direction + amount + date window', () => {
    const r = matchTransactions(stmt, ENTRIES)
    assert.deepEqual(r.matches.map((m) => [m.entry.id, m.dayGap]), [['a', 0], ['b', 1], ['c', 0]])
    assert.equal(r.unmatchedTransactions.length, 0)
    assert.deepEqual(r.unmatchedEntries.map((e) => e.id), ['d'])
  })

  test('never across directions', () => {
    const r = matchTransactions([{ ...stmt[0], moneyIn: 0, moneyOut: 18880 }], ENTRIES)
    assert.equal(r.matches.length, 0)
  })

  test('amount must agree to the paisa; dates within the window', () => {
    assert.equal(matchTransactions([stmt[2]], [{ id: 'x', direction: 'out', amount: 3200.51, date: '2026-08-05' }]).matches.length, 0)
    assert.equal(matchTransactions([stmt[1]], [{ id: 'x', direction: 'out', amount: 25000, date: '2026-07-30' }]).matches.length, 0)
    assert.equal(matchTransactions([stmt[1]], [{ id: 'x', direction: 'out', amount: 25000, date: '2026-07-30' }], { toleranceDays: 5 }).matches.length, 1)
  })

  test('closest dates win across the whole statement', () => {
    // Taking rows in order, row 1 would grab e1 (2 days away) and row 2 would be left with nothing.
    const t = [
      { row: 1, date: '2026-08-03', description: '', reference: '', moneyIn: 0, moneyOut: 1000, balance: null },
      { row: 2, date: '2026-08-05', description: '', reference: '', moneyIn: 0, moneyOut: 1000, balance: null },
    ]
    const e = [
      { id: 'e1', direction: 'out', amount: 1000, date: '2026-08-05' },
      { id: 'e2', direction: 'out', amount: 1000, date: '2026-08-01' },
    ]
    const r = matchTransactions(t, e)
    assert.deepEqual(r.matches.map((m) => [m.transaction.row, m.entry.id, m.dayGap]), [[1, 'e2', 2], [2, 'e1', 0]])
  })

  test('each side used once; extra fields come back', () => {
    const r = matchTransactions(
      [stmt[2], { ...stmt[2], row: 99 }],
      [{ id: 'c', direction: 'out', amount: 3200.5, date: '2026-08-05', voucher: 'PV-12' }],
    )
    assert.equal(r.matches.length, 1)
    assert.equal(r.matches[0].entry.voucher, 'PV-12')
    assert.equal(r.unmatchedTransactions.length, 1)
  })

  test('bad entries are ignored, not fatal', () => {
    const r = matchTransactions(stmt, [{ id: 'z', direction: 'sideways', amount: 1, date: '2026-08-01' }, { id: 'y', direction: 'in', amount: 18880 }])
    assert.equal(r.matches.length, 0)
    assert.equal(r.unmatchedEntries.length, 2)
  })
})
