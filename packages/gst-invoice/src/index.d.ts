export interface ItemInput {
  qty: number | string
  /** Price per unit in rupees, before GST. */
  rate: number | string
  /** Percentage off this line (0–100). Ignored when discountAmount is above 0. */
  discountPercent?: number | string
  /** Rupees off this line. Capped at the line's value. */
  discountAmount?: number | string
  /** GST rate in percent, e.g. 18. Ignored when noTax is true. */
  gstRate?: number | string
}

export interface LineAmounts {
  qty: number
  rate: number
  /** qty × rate */
  gross: number
  /** This line's own discount. */
  discount: number
  /** This line's share of a before-GST discount on the whole invoice. */
  documentDiscount: number
  taxable: number
  gstRate: number
  cgstRate: number
  cgst: number
  sgstRate: number
  sgst: number
  igstRate: number
  igst: number
  tax: number
  total: number
}

export interface InvoiceInput {
  items?: ItemInput[]
  /** IGST instead of CGST + SGST. */
  interState?: boolean
  /** No GST on this document (bill of supply, export under LUT…). */
  noTax?: boolean
  freight?: { amount?: number | string; gstRate?: number | string }
  /** A discount on the whole invoice. */
  discount?: { type?: 'percent' | 'amount'; value?: number | string; beforeGst?: boolean }
  /** true = to the nearest rupee; a number = that adjustment in rupees. */
  roundOff?: boolean | number | string
}

export interface HeadTotals {
  cgst: number
  sgst: number
  igst: number
  tax: number
  total: number
}

export interface InvoiceAmounts {
  lines: LineAmounts[]
  items: HeadTotals & { gross: number; discount: number; documentDiscount: number; taxable: number }
  freight: HeadTotals & { amount: number; gstRate: number }
  discount: { type: 'percent' | 'amount' | null; value: number; beforeGst: boolean; amount: number }
  /** items.taxable + freight.amount */
  taxable: number
  /** Items and freight together. */
  cgst: number
  sgst: number
  igst: number
  tax: number
  roundOff: number
  /** What the customer pays. */
  total: number
}

export declare function computeLine(item: ItemInput, opts?: { interState?: boolean; noTax?: boolean }): LineAmounts
export declare function computeInvoice(input?: InvoiceInput): InvoiceAmounts
