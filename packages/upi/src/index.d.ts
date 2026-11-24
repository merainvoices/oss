export declare const NOTE_MAX_LENGTH: 50
export declare const REF_MAX_LENGTH: 35

export declare function isValidVpa(vpa: unknown): boolean

export interface UpiLinkInput {
  /** Payee UPI ID, e.g. "shop@okaxis". */
  vpa: string
  /** Payee name shown in the UPI app. */
  name?: string
  /** Amount in rupees. 0, negative or not a number → the payer enters it. */
  amount?: number | string
  /** Transaction note, cut to 50 characters. */
  note?: string
  /** Your reference (e.g. invoice number), cut to 35 characters. */
  ref?: string
}

export declare function buildUpiLink(input?: Partial<UpiLinkInput>): string | null

export interface ParsedUpiLink {
  vpa: string
  name: string | null
  amount: number | null
  note: string | null
  ref: string | null
  currency: string | null
  params: Record<string, string>
}

export declare function parseUpiLink(link: string): ParsedUpiLink | null
