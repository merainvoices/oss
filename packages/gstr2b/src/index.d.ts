export declare function normalizeDocNumber(s: unknown): string
export declare function looseDocNumber(s: unknown): string
export declare function parseGstnDate(s: unknown): string | null
export declare function parseReturnPeriod(rtnprd: unknown): { iso: string; label: string } | null

export interface Gstr2bRow {
  section: 'B2B' | 'B2BA' | 'CDNR' | 'CDNRA'
  /** 'C' credit note, 'D' debit note; null for invoices. */
  noteType: 'C' | 'D' | null
  supplierGstin: string
  supplierName: string
  /** 'YYYY-MM-DD' */
  supplierFiledOn: string | null
  docNumber: string
  /** 'YYYY-MM-DD' */
  docDate: string | null
  docValue: number
  taxable: number
  igst: number
  cgst: number
  sgst: number
  cess: number
  /** igst + cgst + sgst (cess not included) */
  totalTax: number
  itcAvailable: boolean
  reverseCharge: boolean
  reason: string
  /** Invoice Management System action, e.g. 'N' = no action. */
  imsStatus: string | null
  irn: string | null
  eInvoice: boolean
}

export interface Gstr2b {
  gstin: string
  period: { iso: string; label: string } | null
  rows: Gstr2bRow[]
  notes: Gstr2bRow[]
  warnings: string[]
}

export type Gstr2bErrorCode = 'INVALID_JSON' | 'EMPTY' | 'NOT_GSTR2B'

export declare function parseGstr2b(input: string | object): Gstr2b

/** One bill from your purchase register. Extra fields (ids etc.) are passed through. */
export interface PurchaseRecord {
  supplierGstin: string
  docNumber: string
  /** 'YYYY-MM-DD' */
  docDate?: string | null
  taxable: number
  igst?: number
  cgst?: number
  sgst?: number
  /** Default true. */
  itcEligible?: boolean
  /** Default false. */
  reverseCharge?: boolean
  [key: string]: unknown
}

export type BookRow<T extends PurchaseRecord = PurchaseRecord> = T & {
  supplierGstin: string
  docNumber: string
  taxable: number
  igst: number
  cgst: number
  sgst: number
  totalTax: number
  itcEligible: boolean
  reverseCharge: boolean
}

export interface MatchPair<T extends PurchaseRecord = PurchaseRecord> {
  row2b: Gstr2bRow
  book: BookRow<T>
  amountsMatch: boolean
  /** 2B minus books */
  taxableDiff: number
  /** 2B minus books */
  taxDiff: number
}

export interface Reconciliation<T extends PurchaseRecord = PurchaseRecord> {
  matched: MatchPair<T>[]
  valueMismatch: MatchPair<T>[]
  probable: MatchPair<T>[]
  only2b: Gstr2bRow[]
  onlyBooks: BookRow<T>[]
  notes: Gstr2bRow[]
  summary: {
    counts: {
      in2b: number
      inBooks: number
      matched: number
      valueMismatch: number
      probable: number
      only2b: number
      onlyBooks: number
      notes: number
      skippedNoGstin: number
      imsNoAction: number
    }
    itc2bAvailable: number
    itcBooksEligible: number
    matchedTax: number
    atRiskTax: number
    missingFromBooksTax: number
    mismatchTax: number
  }
}

export declare function reconcile<T extends PurchaseRecord>(
  parsed: Gstr2b,
  purchases: T[],
  opts?: { tolerance?: number },
): Reconciliation<T>
