export declare const GSTIN_REGEX: RegExp
export declare const PAN_REGEX: RegExp

export interface StateCode {
  readonly code: string
  readonly name: string
}

/** Every code a GSTIN may start with (01–38, 97, 99), with its name. */
export declare const STATE_CODES: readonly StateCode[]
/** States and union territories for a place-of-supply picker, sorted by name. */
export declare const STATES: readonly StateCode[]

export declare function stateName(code: string | number | null | undefined): string | null
export declare function normalizeGSTIN(input: unknown): string
export declare function gstinCheckDigit(first14: string): string

export type GSTINErrorCode = 'EMPTY' | 'LENGTH' | 'FORMAT' | 'STATE' | 'CHECKSUM'

export type GSTINValidation =
  | { valid: true; gstin: string; code: null; error: null }
  | { valid: false; gstin: string; code: GSTINErrorCode; error: string }

export declare function validateGSTIN(input: unknown): GSTINValidation
export declare function isValidGSTIN(input: unknown): boolean

export declare function stateCodeFromGSTIN(gstin: string | null | undefined): string | null
export declare function stateFromGSTIN(gstin: string | null | undefined): string | null
export declare function panFromGSTIN(gstin: string | null | undefined): string | null
export declare function isValidPAN(pan: string | null | undefined): boolean
export declare function panHolderType(pan: string | null | undefined): string | null

export interface Party {
  gstin?: string | null
  stateCode?: string | number | null
  /** Buyer is a Special Economic Zone unit or developer. */
  sez?: boolean
}

export declare function resolveStateCode(party?: Party): string | null

export declare function isInterStateSupply(args?: {
  seller?: Party
  buyer?: Party | null
  shipToStateCode?: string | null
}): boolean
