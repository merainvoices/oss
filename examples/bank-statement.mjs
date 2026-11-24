// Read an HDFC-style statement export and match it against your entries.
//
//   node examples/bank-statement.mjs

import { readFileSync } from 'node:fs'
import { readStatement, checkRunningBalance, matchTransactions } from '@merainvoices/bank-statement'
import { formatINR } from '@merainvoices/inr'

const { transactions } = readStatement(readFileSync(new URL('./data/hdfc-nov-2026.csv', import.meta.url), 'utf8'))

const balance = checkRunningBalance(transactions)
console.log(`${transactions.length} transactions · running balance ${balance.ok ? 'checks out' : `breaks at row ${balance.mismatches[0].row}`}`)

// Your receipts and payments through this account. 'in' = money into the account.
const entries = [
  { id: 'RCPT-41', direction: 'in', amount: 11494, date: '2026-11-01' },
  { id: 'PV-88', direction: 'out', amount: 11800, date: '2026-11-02' },
  { id: 'PV-89', direction: 'out', amount: 2360, date: '2026-11-05' },
  { id: 'PV-90', direction: 'out', amount: 25000, date: '2026-11-07' },
  { id: 'PV-91', direction: 'out', amount: 6500, date: '2026-11-06' },
]

const { matches, unmatchedTransactions, unmatchedEntries } = matchTransactions(transactions, entries)
for (const m of matches) {
  console.log(`${m.entry.id.padEnd(8)} ↔ ${m.transaction.description} (${m.dayGap === 0 ? 'same day' : `${m.dayGap} day apart`})`)
}
for (const t of unmatchedTransactions) console.log(`Not in your books: ${t.description} ${formatINR(t.moneyIn || t.moneyOut)}`)
for (const e of unmatchedEntries) console.log(`Not on the statement yet: ${e.id} ${formatINR(e.amount)}`)
