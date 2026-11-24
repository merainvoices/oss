export declare function formatIndianNumber(value: number, opts?: { decimals?: number }): string
export declare function formatINR(value: number, opts?: { symbol?: boolean; decimals?: number }): string

export declare function numberToWords(n: number): string
export declare function amountInWords(amount: number, opts?: { prefix?: string; suffix?: string }): string

export interface FinancialYear {
  /** '2025-26' */
  label: string
  /** '2526' */
  short: string
  startYear: number
  endYear: number
  /** 'YYYY-04-01' */
  start: string
  /** 'YYYY-03-31' */
  end: string
}

export declare function financialYear(date?: Date | string | number, opts?: { timeZone?: string }): FinancialYear

export declare const MAX_INVOICE_NUMBER_LENGTH: 16

export declare function formatInvoiceNumber(
  template: string,
  opts: { seq: number; date?: Date | string | number; fy?: FinancialYear; pad?: number; timeZone?: string },
): string

export type InvoiceNumberCheck =
  | { valid: true; length: number; code: null; error: null }
  | { valid: false; length: number; code: 'EMPTY' | 'TOO_LONG' | 'CHARACTERS'; error: string }

export declare function checkInvoiceNumber(number: unknown): InvoiceNumberCheck
