export interface Columns {
  date: number
  description: number
  debit: number
  credit: number
  amount: number
  drcr: number
  balance: number
  reference: number
}

export interface Transaction {
  /** Index of the source row. */
  row: number
  /** 'YYYY-MM-DD' */
  date: string
  description: string
  reference: string
  /** Money into the account (statement credit). */
  moneyIn: number
  /** Money out of the account (statement debit). */
  moneyOut: number
  /** Negative when overdrawn ("Dr"); null when the statement has no balance column. */
  balance: number | null
}

export type Cell = string | number | Date | null | undefined

export declare function parseCsv(text: string, opts?: { delimiter?: string }): string[][]
export declare function guessColumns(headerCells: unknown[]): Columns
export declare function hasRequiredColumns(columns: Columns | null | undefined): boolean
export declare function findHeaderRow(rows: unknown[][]): number
export declare function parseDate(value: Cell): string | null
export declare function parseAmount(value: Cell): { value: number; indicator: 'CR' | 'DR' | null }
export declare function readTransactions(rows: unknown[][], headerRow: number, columns: Columns): Transaction[]

/** Throws an Error with `code: 'NO_HEADER'` when no statement table is found. */
export declare function readStatement(
  input: string | unknown[][],
  opts?: { delimiter?: string; columns?: Partial<Columns>; headerRow?: number },
): { headerRow: number; columns: Columns; transactions: Transaction[] }

export declare function checkRunningBalance(transactions: Transaction[]): {
  ok: boolean
  order: 'oldest-first' | 'newest-first' | null
  mismatches: Array<{ row: number; expected: number; actual: number }>
}

export interface Entry {
  id?: unknown
  /** Money into ('in') or out of ('out') this bank account. */
  direction: 'in' | 'out'
  amount: number
  /** 'YYYY-MM-DD' */
  date: string
  [key: string]: unknown
}

export declare function matchTransactions<E extends Entry>(
  transactions: Transaction[],
  entries: E[],
  opts?: { toleranceDays?: number },
): {
  matches: Array<{ transaction: Transaction; entry: E; dayGap: number }>
  unmatchedTransactions: Transaction[]
  unmatchedEntries: E[]
}
