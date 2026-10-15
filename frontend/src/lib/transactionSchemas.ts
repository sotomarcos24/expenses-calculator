import { z } from 'zod'
import type { CategoryKind, TransactionRead } from '../api/types.ts'
import { todayLocalIso } from './periods.ts'
import { parseMoney, type MoneyError } from './money.ts'

/** Limit mirrored from `NOTE_MAX_LENGTH` in `backend/app/schemas/transactions.py`. */
export const NOTE_MAX_LENGTH = 500

export const DATE_REQUIRED = 'Date is required'
export const CATEGORY_REQUIRED = 'Select a category'
export const GROSS_BELOW_AMOUNT = 'Gross amount must be at least the amount'
export const NOTE_TOO_LONG = `Note must be at most ${NOTE_MAX_LENGTH} characters`
export const TOO_MANY_DECIMALS = 'Use at most 2 decimal places'
export const MONEY_FORMAT = 'Enter an amount like 1234.56'

/** Message for a money field (`label` is "Amount" or "Gross amount"). */
export function moneyErrorMessage(label: string, error: MoneyError): string {
  switch (error) {
    case 'required':
      return `${label} is required`
    case 'not-positive':
    case 'negative':
      return `${label} must be greater than 0`
    case 'too-many-decimals':
      return TOO_MANY_DECIMALS
    case 'too-large':
      return `${label} must be at most 9,999,999,999.99`
    case 'format':
      return MONEY_FORMAT
  }
}

/** Raw values of the create / edit form: every input is a string, except the type radios. */
export type TransactionFormInput = {
  type: CategoryKind
  date: string
  amount: string
  /** Income only; empty means "no gross amount". Ignored for an expense. */
  gross_amount: string
  /** Category id, or empty when none is selected. */
  category_id: string
  /** Subcategory id, or empty for "None". */
  subcategory_id: string
  note: string
}

/**
 * Body sent by the form, on both `POST` and `PATCH` (every field, so an edit can clear the gross
 * amount, the subcategory or the note). Money stays a decimal string.
 */
export type TransactionPayload = {
  type: CategoryKind
  date: string
  amount: string
  gross_amount: string | null
  category_id: number
  subcategory_id: number | null
  note: string | null
}

/** Note length in code points, as the API counts it (Python `len`). */
function noteLength(note: string) {
  return [...note].length
}

/**
 * Validates the form values with the same rules as the API, then turns them into the request
 * body: trimmed money strings, `null` gross for an expense or an empty field, numeric ids, and a
 * trimmed note (`null` when empty). Amounts are compared in `bigint` cents, never as floats.
 */
export const transactionFormSchema = z
  .object({
    type: z.enum(['expense', 'income']),
    date: z.string(),
    amount: z.string(),
    gross_amount: z.string(),
    category_id: z.string(),
    subcategory_id: z.string(),
    note: z.string(),
  })
  .superRefine((values, context) => {
    const issue = (path: keyof TransactionFormInput, message: string) =>
      context.addIssue({ code: 'custom', path: [path], message })

    if (values.date.trim() === '') {
      issue('date', DATE_REQUIRED)
    }
    const amount = parseMoney(values.amount)
    if (!amount.ok) {
      issue('amount', moneyErrorMessage('Amount', amount.error))
    }
    if (values.type === 'income' && values.gross_amount.trim() !== '') {
      const gross = parseMoney(values.gross_amount)
      if (!gross.ok) {
        issue('gross_amount', moneyErrorMessage('Gross amount', gross.error))
      } else if (amount.ok && gross.cents < amount.cents) {
        issue('gross_amount', GROSS_BELOW_AMOUNT)
      }
    }
    if (values.category_id === '') {
      issue('category_id', CATEGORY_REQUIRED)
    }
    if (noteLength(values.note.trim()) > NOTE_MAX_LENGTH) {
      issue('note', NOTE_TOO_LONG)
    }
  })
  .transform((values): TransactionPayload => {
    const gross = values.gross_amount.trim()
    const note = values.note.trim()
    return {
      type: values.type,
      date: values.date,
      amount: values.amount.trim(),
      gross_amount: values.type === 'income' && gross !== '' ? gross : null,
      category_id: Number(values.category_id),
      subcategory_id: values.subcategory_id === '' ? null : Number(values.subcategory_id),
      note: note === '' ? null : note,
    }
  })

/** Empty form for a new transaction: an expense dated today (local calendar date). */
export function emptyTransactionForm(): TransactionFormInput {
  return {
    type: 'expense',
    date: todayLocalIso(),
    amount: '',
    gross_amount: '',
    category_id: '',
    subcategory_id: '',
    note: '',
  }
}

/** Form values of an existing row, as returned by the API (`"2400.00"`, `null` → empty). */
export function transactionToForm(transaction: TransactionRead): TransactionFormInput {
  return {
    type: transaction.type,
    date: transaction.date,
    amount: transaction.amount,
    gross_amount: transaction.gross_amount ?? '',
    category_id: String(transaction.category_id),
    subcategory_id: transaction.subcategory_id === null ? '' : String(transaction.subcategory_id),
    note: transaction.note ?? '',
  }
}
